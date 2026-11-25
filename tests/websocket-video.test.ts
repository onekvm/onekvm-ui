import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

class Video extends EventTarget {
  readyState = 0
  videoWidth = 0
  playbackRate = 1
  paused = true
  buffered = { length: 0 }
  muted = false
  playsInline = false
  preload = ''
  error: { code: number } | null = null
  async play() {}
  pause() {}
  load() {}
  removeAttribute() {}
}

let behavior = 'decoded'
let muxers = 0
let destroyed = 0
let feeds = 0
const feedDurations: number[] = []
const readyCallbacks: (() => void)[] = []
const muxerCodecs: string[] = []
class Muxer {
  private feeds = 0
  private options: { node: Video; videoCodec: string; onReady: () => void; onError: (data: unknown) => void; onUnsupportedCodec: () => void }
  constructor(options: Muxer['options']) {
    this.options = options
    muxers += 1
    muxerCodecs.push(options.videoCodec)
    readyCallbacks.push(options.onReady)
    if (behavior !== 'late-ready') queueMicrotask(options.onReady)
  }
  feed(frame: { duration?: number } = {}) {
    feedDurations.push(Math.trunc(frame.duration ?? 0))
    feeds += 1
    this.feeds += 1
    if (behavior === 'throw') throw new Error('Cannot create SourceBuffer')
    if (behavior === 'unsupported') this.options.onUnsupportedCodec()
    if (behavior === 'error') this.options.onError({ name: 'buffer' })
    if (behavior === 'decoded' || (behavior === 'decoded-next-feed' && this.feeds > 1)) {
      this.options.node.readyState = 2
      this.options.node.videoWidth = 64
      this.options.node.dispatchEvent(new Event('loadeddata'))
    }
  }
  destroy() { destroyed += 1 }
}

const sockets: Socket[] = []
class Socket {
  static OPEN = 1
  static CLOSING = 2
  readyState = 0
  bufferedAmount = 0
  sent: unknown[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: ArrayBuffer }) => void) | null = null
  constructor() { sockets.push(this) }
  send(value: unknown) { this.sent.push(value) }
  close() { this.readyState = 3 }
  open() { this.readyState = 1; this.onopen?.() }
}

const realSetTimeout = setTimeout
let fetchStalls = false
let fetchAborted = false
const globals = {
  __testMuxer: Muxer,
  localStorage: { getItem: () => null },
  document: { createElement: () => new Video() },
  MediaSource: { isTypeSupported: (mime: string) => mime.includes('hvc1') || mime.includes('avc1') },
  WebSocket: Socket,
  setTimeout: ((callback: () => void, delay: number) => realSetTimeout(callback, delay === 5000 ? 15 : delay)) as typeof setTimeout,
  fetch: async (_url: unknown, options: { signal: AbortSignal }) => {
    if (fetchStalls) return new Promise<never>((_, reject) => {
      options.signal.addEventListener('abort', () => { fetchAborted = true; reject(new Error('Aborted')) })
    })
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) }
  },
}
const originals = Object.keys(globals).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const)
for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, value })

const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  ssr: { noExternal: ['jmuxer'] },
  root: fileURLToPath(new URL('..', import.meta.url)),
  resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)), jmuxer: 'virtual:mock-muxer' } },
  server: { middlewareMode: true, hmr: false, watch: null },
  plugins: [{
    name: 'mock-muxer',
    resolveId: (id) => id === 'virtual:mock-muxer' ? '\0mock-muxer' : null,
    load: (id) => id === '\0mock-muxer' ? 'export default globalThis.__testMuxer' : null,
  }],
})

try {
  const { probeH265WebSocketVideoSupport } = await server.ssrLoadModule('/src/lib/websocket-video-probe.ts')
  assert.equal(await probeH265WebSocketVideoSupport(), true, `Only decoded video enables the codec (${muxers}/${destroyed} muxers)`)
  behavior = 'decoded-next-feed'
  assert.equal(await probeH265WebSocketVideoSupport(200), true, 'Live flushing must feed again after appending the init segment')
  for (behavior of ['advertised-only', 'unsupported', 'error', 'throw']) {
    assert.equal(await probeH265WebSocketVideoSupport(15), false, `${behavior} must not enable H.265`)
    assert.equal(destroyed, muxers, 'Every probe must release the muxer')
  }
  fetchStalls = true
  const beforeStall = muxers
  assert.equal(await probeH265WebSocketVideoSupport(15), false)
  assert.equal(fetchAborted, true, 'Timeout also cancels a stalled sample fetch')
  assert.equal(muxers, beforeStall, 'A late fetch must not allocate a decoder')
  fetchStalls = false
  behavior = 'late-ready'
  assert.equal(await probeH265WebSocketVideoSupport(15), false)
  const beforeLateReady = feeds
  readyCallbacks.at(-1)!()
  assert.equal(feeds, beforeLateReady, 'Late sourceopen after timeout must not restart feeding')

  const support = await server.ssrLoadModule('/src/lib/websocket-video-support.ts')
  Object.defineProperty(globalThis, 'MediaSource', { configurable: true, value: { isTypeSupported: (mime: string) => mime.includes('hev1') } })
  assert.equal(support.supportsWebSocketVideo('h265'), false, 'hev1 alone does not support the actual hvc1 SourceBuffer')
  Object.defineProperty(globalThis, 'MediaSource', { configurable: true, value: globals.MediaSource })
  behavior = 'error'
  const firstProbe = support.detectH265WebSocketVideoSupport()
  assert.equal(firstProbe, support.detectH265WebSocketVideoSupport(), 'UI and connection reuse one probe')
  assert.equal(await firstProbe, false, 'Advertised MSE support with failed decoding is rejected')

  const { WebSocketVideo } = await server.ssrLoadModule('/src/lib/websocket-video.ts')
  const frame = new ArrayBuffer(44)
  const bytes = new Uint8Array(frame)
  bytes.set([0x4f, 0x4b, 0x56, 0x46, 1, 2, 1])
  new DataView(frame).setUint32(24, 16666)
  new DataView(frame).setUint32(32, 4)

  for (behavior of ['decoded', 'advertised-only', 'error', 'unsupported', 'throw']) {
    const video = new Video()
    const failures: { message: string; unsupported?: boolean }[] = []
    const player = new WebSocketVideo(video, 'wss://example.test/video', 'h265', {
      bitrate: () => {},
      disconnected: (message: string, unsupported?: boolean) => failures.push({ message, unsupported }),
    })
    const connected = player.connect()
    const socket = sockets.at(-1)!
    socket.open()
    await connected
    assert.equal(failures.length, 0, 'Opening a socket alone is not a decode failure')
    const feedFrames = (from: number, count: number) => {
      for (let sequence = from; sequence < from + count; sequence++) {
        const packet = frame.slice(0)
        new DataView(packet).setBigUint64(8, BigInt(sequence))
        socket.onmessage?.({ data: packet })
      }
    }
    if (behavior === 'advertised-only') {
      feedFrames(0, 6)
      await new Promise((resolve) => realSetTimeout(resolve, 30))
      assert.equal(failures.length, 0, 'A source that pauses after a few frames is not a decode failure')
      feedFrames(6, 60)
    } else {
      feedFrames(0, 1)
    }
    await new Promise((resolve) => realSetTimeout(resolve, 30))
    assert.equal(failures.length, behavior === 'decoded' ? 0 : 1, `${behavior} playback is reported once`)
    if (failures.length) assert.equal(failures[0]!.unsupported, true)
    player.destroy()
    video.error = { code: 3 }
    video.dispatchEvent(new Event('error'))
    await Promise.resolve()
    assert.equal(failures.length, behavior === 'decoded' ? 0 : 1, 'Destroyed players cannot report a late failure')
  }
  behavior = 'decoded'
  {
    const video = new Video()
    const player = new WebSocketVideo(video, 'wss://example.test/video?video_codec=h265', 'h265', {
      bitrate: () => {},
      disconnected: () => assert.fail('Auto must decode the backend H.264 fallback'),
    }, true)
    const connected = player.connect()
    const socket = sockets.at(-1)!
    socket.open()
    await connected
    const packet = frame.slice(0)
    new Uint8Array(packet)[5] = 1
    const feedsBeforeSwitch = feeds
    socket.onmessage?.({ data: packet })
    assert.equal(muxerCodecs.at(-1), 'H264')
    assert.equal(feeds, feedsBeforeSwitch, 'Frames wait until the new MediaSource opens')
    const keyframeRequests = socket.sent.filter((value) => value === 'keyframe').length
    await Promise.resolve()
    assert.equal(socket.sent.filter((value) => value === 'keyframe').length, keyframeRequests + 1, 'The ready muxer asks for a keyframe')
    const next = packet.slice(0)
    new DataView(next).setBigUint64(8, 1n)
    socket.onmessage?.({ data: next })
    assert.equal(video.readyState, 2)
    player.destroy()
  }
  {
    const latency: { transportUs?: number | null; transportErrorUs?: number | null }[] = []
    const player = new WebSocketVideo(new Video(), 'wss://example.test/video', 'h265', {
      bitrate: () => {}, disconnected: () => assert.fail('Timing is optional telemetry'),
      latency: (value: typeof latency[number]) => latency.push(value),
    })
    const connected = player.connect()
    const socket = sockets.at(-1)!
    socket.open()
    await connected
    assert.equal(latency.at(-1)?.transportUs, null, 'Unknown clocks do not produce a fabricated latency')
    const probe = socket.sent.find((v): v is Uint8Array => v instanceof Uint8Array && v.length === 5)!
    assert.ok(probe, 'The real player must request clock synchronization')
    const deviceUs = Math.round(performance.now() * 1000) + 9_000_000
    const reply = new Uint8Array(21)
    reply[0] = 2
    reply.set(probe.subarray(1), 1)
    const rv = new DataView(reply.buffer)
    rv.setBigUint64(5, BigInt(deviceUs) * 1000n)
    rv.setBigUint64(13, BigInt(deviceUs) * 1000n)
    socket.onmessage?.({ data: reply.buffer })
    const legacy = frame.slice(0)
    new DataView(legacy).setBigUint64(16, BigInt(deviceUs - 20_000))
    socket.onmessage?.({ data: legacy })
    await new Promise(resolve => realSetTimeout(resolve, 125))
    assert.equal(latency.at(-1)?.transportUs, null, 'A legacy PTS without the monotonic flag is never a transport sample')
    const timed = frame.slice(0)
    new Uint8Array(timed)[7] = 1
    new DataView(timed).setBigUint64(16, BigInt(deviceUs - 20_000))
    socket.onmessage?.({ data: timed })
    await new Promise(resolve => realSetTimeout(resolve, 125))
    assert.ok((latency.at(-1)?.transportUs ?? 0) > 10_000, 'The real socket header reaches the panel callback')
    assert.ok(latency.at(-1)?.transportErrorUs != null, 'Clock uncertainty accompanies the measurement')
    player.destroy()
    const count = latency.length
    assert.equal(latency.at(-1)?.transportUs, undefined, 'Destroy clears the old connection value')
    await new Promise(resolve => realSetTimeout(resolve, 125))
    assert.equal(latency.length, count, 'A destroyed player cannot keep its telemetry timer alive')
  }
  {
    const video = new Video()
    const player = new WebSocketVideo(video, 'wss://example.test/video', 'h264', {
      bitrate: () => {}, disconnected: () => assert.fail('A new resolution must keep the connection'),
    })
    const connected = player.connect()
    const socket = sockets.at(-1)!
    socket.open()
    await connected
    let sequence = 0n
    const send = (keyframe: boolean, units: number[][]) => {
      const payload = units.flatMap((unit) => [0, 0, 0, 1, ...unit])
      const packet = new ArrayBuffer(40 + payload.length)
      const packetBytes = new Uint8Array(packet)
      packetBytes.set([0x4f, 0x4b, 0x56, 0x46, 1, 1, keyframe ? 1 : 0])
      packetBytes.set(payload, 40)
      new DataView(packet).setBigUint64(8, sequence++)
      new DataView(packet).setUint32(24, 16666)
      new DataView(packet).setUint32(32, payload.length)
      socket.onmessage?.({ data: packet })
    }
    const pps = [0x68, 0xee, 0x3c, 0x80]
    const idr = [0x65, 0x88, 0x84]
    const before = muxers
    const feedsBefore = feeds
    send(true, [[0x67, 0x64, 0x00, 0x28], pps, idr])
    send(false, [[0x41, 0x9a]])
    send(true, [[0x67, 0x64, 0x00, 0x28], pps, idr])
    assert.equal(muxers, before, 'Repeated parameter sets keep the muxer')
    send(true, [[0x67, 0x64, 0x00, 0x1f], pps, idr])
    assert.equal(muxers, before + 1, 'A new SPS starts a new muxer')
    send(false, [[0x41, 0x9a]])
    assert.equal(feeds, feedsBefore + 3, 'Nothing is fed before the new MediaSource opens')
    await Promise.resolve()
    assert.equal(socket.sent.at(-1), 'keyframe', 'The new muxer asks for a keyframe')
    send(true, [[0x67, 0x64, 0x00, 0x1f], pps, idr])
    send(false, [[0x41, 0x9a]])
    assert.equal(muxers, before + 1, 'The same new SPS keeps the new muxer')
    assert.equal(feeds, feedsBefore + 5, 'Playback resumes from the requested keyframe')
    player.destroy()
  }
  for (const durationUs of [16667, 33333, 8333]) {
    const video = new Video()
    const player = new WebSocketVideo(video, 'wss://example.test/video', 'h265', { bitrate: () => {}, disconnected: () => assert.fail('Continuous video must remain connected') })
    const connected = player.connect()
    const socket = sockets.at(-1)!
    socket.open()
    await connected
    const before = feedDurations.length
    for (let sequence = 0; sequence < 600; sequence++) {
      const packet = frame.slice(0)
      const view = new DataView(packet)
      view.setBigUint64(8, BigInt(sequence))
      view.setUint32(24, durationUs)
      socket.onmessage?.({ data: packet })
    }
    const duration = feedDurations.slice(before).reduce((sum, value) => sum + value, 0)
    assert.ok(Math.abs(duration - 600 * durationUs / 1000) < 1, 'Integer millisecond remuxing must not shorten the live video clock')
    player.destroy()
  }
} finally {
  await server.close()
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else Reflect.deleteProperty(globalThis, name)
  }
}

console.log('websocket-video tests passed')
