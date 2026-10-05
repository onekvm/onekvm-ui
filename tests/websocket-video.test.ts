import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

class Video extends EventTarget {
  readyState = 0
  videoWidth = 0
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
const readyCallbacks: (() => void)[] = []
class Muxer {
  private feeds = 0
  private options: { node: Video; onReady: () => void; onError: (data: unknown) => void; onUnsupportedCodec: () => void }
  constructor(options: Muxer['options']) {
    this.options = options
    muxers += 1
    readyCallbacks.push(options.onReady)
    if (behavior !== 'late-ready') queueMicrotask(options.onReady)
  }
  feed() {
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
  onopen: (() => void) | null = null
  onmessage: ((event: { data: ArrayBuffer }) => void) | null = null
  constructor() { sockets.push(this) }
  send() {}
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
    socket.onmessage?.({ data: frame })
    await new Promise((resolve) => realSetTimeout(resolve, 30))
    assert.equal(failures.length, behavior === 'decoded' ? 0 : 1, `${behavior} playback is reported once`)
    if (failures.length) assert.equal(failures[0]!.unsupported, true)
    player.destroy()
    video.error = { code: 3 }
    video.dispatchEvent(new Event('error'))
    await Promise.resolve()
    assert.equal(failures.length, behavior === 'decoded' ? 0 : 1, 'Destroyed players cannot report a late failure')
  }
} finally {
  await server.close()
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else Reflect.deleteProperty(globalThis, name)
  }
}

console.log('websocket-video tests passed')
