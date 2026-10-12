import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { microphonePCMFrame } from '../src/lib/websocket-audio-protocol.ts'

const contexts: Context[] = []
const nodes: Worklet[] = []
const sockets: Socket[] = []
class Node {
  gain = { value: 1 }
  fftSize = 256
  connect() {}
  disconnect() {}
}
class Context {
  state = 'suspended'
  currentTime = 1
  destination = new Node()
  gains: Node[] = []
  audioWorklet = { addModule: async () => {} }
  constructor() { contexts.push(this) }
  createGain() { const gain = new Node(); this.gains.push(gain); return gain }
  createAnalyser() { return new Node() }
  createMediaStreamSource() { return new Node() }
  async resume() { this.state = 'running' }
  async close() { this.state = 'closed' }
}
class Worklet extends Node {
  port = { onmessage: null as any, sent: [] as any[], postMessage(data: any) { this.sent.push(data) } }
  constructor() { super(); nodes.push(this) }
}
class Socket {
  static OPEN = 1
  static CLOSING = 2
  readyState = 1
  bufferedAmount = 0
  sent: any[] = []
  onmessage: any
  onclose: any
  readonly protocol: string | string[]
  constructor(_url: string, protocol: string | string[]) { this.protocol = protocol; sockets.push(this) }
  send(value: any) { this.sent.push(value) }
  close() { this.readyState = 3; this.onclose?.() }
  receive(value: any) { this.onmessage?.({ data: typeof value === 'object' && !(value instanceof ArrayBuffer) ? JSON.stringify(value) : value }) }
}
const globals = { window: { AudioContext: Context }, AudioWorkletNode: Worklet, WebSocket: Socket }
const originals = Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const)
for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, value })
const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true, hmr: false, watch: null } })
let player: any
async function until(predicate: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return
    await new Promise(resolve => setImmediate(resolve))
  }
  assert.fail('Connection did not advance')
}
try {
  const { WebSocketAudio } = await server.ssrLoadModule('/src/lib/websocket-audio.ts')
  let disconnects = 0
  player = new WebSocketAudio('wss://example.test/api/audio/ws', { stats: () => {}, disconnected: () => disconnects++ })
  const connected = player.connect()
  await until(() => sockets.length === 1)
  const socket = sockets[0]!
  assert.equal(socket.protocol, 'onekvm.audio.v1')
  socket.receive({ type: 'ready', session_id: 'audio-1' })
  await connected
  assert.equal(player.sessionID(), 'audio-1')
  const frame = () => microphonePCMFrame(new ArrayBuffer(1920), 0n, 0)
  socket.receive(frame())
  assert.equal(nodes[0]!.port.sent.length, 0, 'Suspended autoplay does not accumulate worklet messages')
  player.resume()
  socket.receive(microphonePCMFrame(new ArrayBuffer(1920), 1n, 0))
  assert.equal(nodes[0]!.port.sent.at(-1).type, 'audio')
  player.setSpeaker(false, 0.7)
  assert.equal(contexts[0]!.gains[0]!.gain.value, 0)
  player.setSpeaker(true, 0.3)
  assert.equal(contexts[0]!.gains[0]!.gain.value, 0.3)

  const claim = player.setMicrophone(true)
  const request = JSON.parse(socket.sent.at(-1))
  socket.receive({ type: 'microphone', request_id: request.request_id, microphone: false })
  assert.equal(await claim, false, 'An occupied microphone is not stolen')
  const claim2 = player.setMicrophone(true)
  const request2 = JSON.parse(socket.sent.at(-1))
  socket.receive({ type: 'microphone', request_id: request2.request_id, microphone: true })
  assert.equal(await claim2, true)
  player.startMicrophone({}, 0.6)
  const capture = nodes.at(-1)!
  capture.port.onmessage({ data: new ArrayBuffer(1920) })
  assert.ok(socket.sent.at(-1) instanceof ArrayBuffer, 'Granted microphone uses the audio WebSocket')
  socket.bufferedAmount = 10000
  const sent = socket.sent.length
  capture.port.onmessage({ data: new ArrayBuffer(1920) })
  assert.equal(socket.sent.length, sent, 'A stalled socket cannot accumulate more microphone sound')
  socket.bufferedAmount = 0
  const released = player.setMicrophone(false)
  const request3 = JSON.parse(socket.sent.at(-1))
  capture.port.onmessage({ data: new ArrayBuffer(1920) })
  assert.equal(typeof socket.sent.at(-1), 'string', 'Disabling immediately stops capture transmission before acknowledgement')
  socket.receive({ type: 'microphone', request_id: request3.request_id, microphone: false })
  await released
  const abandonedClaim = player.setMicrophone(true)
  const rejected = assert.rejects(abandonedClaim, /closed/)
  player.destroy()
  await rejected
  assert.equal(contexts[0]!.state, 'closed')
  assert.equal(capture.port.onmessage, null)
  assert.equal(disconnects, 0, 'Intentional close does not schedule reconnect')

  player = new WebSocketAudio('wss://example.test/api/audio/ws', { stats: () => {}, disconnected: () => disconnects++ })
  const abandoned = player.connect()
  const closed = assert.rejects(abandoned, /closed/)
  await until(() => sockets.length === 2)
  player.destroy()
  await closed
  assert.equal(contexts.at(-1)!.state, 'closed', 'Closing during the handshake releases the AudioContext')

  const decoders: Decoder[] = []
  let releasedAudio = 0
  class Decoder {
    static async isConfigSupported() { return { supported: true } }
    decodeQueueSize = 0
    config: any
    closed = false
    readonly callbacks: any
    constructor(callbacks: any) { this.callbacks = callbacks; decoders.push(this) }
    configure(config: any) { this.config = config }
    decode(chunk: any) {
      assert.deepEqual([...chunk.data], [0xf8, 0xff, 0xfe], 'The decoder receives the original Opus packet')
      this.callbacks.output({ numberOfFrames: 960, numberOfChannels: 2, sampleRate: 48000, copyTo(plane: Float32Array, { planeIndex }: any) { plane.fill(planeIndex ? -0.5 : 0.25) }, close() { releasedAudio++ } })
    }
    close() { this.closed = true }
  }
  const codecGlobals = { AudioDecoder: Decoder, EncodedAudioChunk: class { constructor(value: any) { Object.assign(this, value) } } }
  const codecOriginals = Object.keys(codecGlobals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const)
  for (const [name, value] of Object.entries(codecGlobals)) Object.defineProperty(globalThis, name, { configurable: true, value })
  try {
    const stats: any[] = []
    player = new WebSocketAudio('wss://example.test/api/audio/ws', { stats: (value: any) => stats.push(value), disconnected: () => disconnects++ })
    const connected = player.connect()
    await until(() => sockets.length === 3)
    const socket = sockets.at(-1)!
    assert.deepEqual(socket.protocol, ['onekvm.audio.opus.v1', 'onekvm.audio.v1'], 'Opus is preferred with a compatible PCM fallback')
    socket.receive({ type: 'ready', session_id: 'audio-opus', codec: 'opus' })
    await connected
    const opus = (sequence: bigint) => {
      const frame = microphonePCMFrame(new Uint8Array([0xf8, 0xff, 0xfe]).buffer, sequence, Number(sequence) * 20000)
      new Uint8Array(frame)[5] = 2
      new Uint8Array(frame)[6] = 2
      return frame
    }
    socket.receive(opus(0n))
    assert.equal(decoders.length, 0, 'Suspended autoplay cannot accumulate compressed audio either')
    player.resume()
    socket.receive(opus(1n))
    const playback = nodes.at(-1)!
    const decoded = playback.port.sent.at(-1)
    assert.equal(decoded.type, 'decoded')
    assert.ok(decoded.planes[0].every((sample: number) => sample === 0.25))
    assert.ok(decoded.planes[1].every((sample: number) => sample === -0.5))
    assert.equal(releasedAudio, 1, 'Decoded AudioData is always released')
    assert.equal(decoders[0]!.config.numberOfChannels, 2)
    decoders[0]!.decodeQueueSize = 4
    socket.receive(opus(2n))
    assert.equal(decoders[0]!.closed, true, 'A stalled decoder cannot grow an unbounded latency queue')
    assert.equal(decoders.length, 2)
    player.reportStats()
    assert.equal(stats.at(-1).codec, 'opus', 'The performance overlay reports the actual wire codec')
    const before = playback.port.sent.length
    decoders[0]!.callbacks.output({ close() { releasedAudio++ } })
    assert.equal(playback.port.sent.length, before, 'A replaced decoder cannot deliver stale audio')
    player.destroy()
    assert.equal(decoders.at(-1)!.closed, true)
    assert.equal(disconnects, 0)
  } finally {
    player?.destroy()
    for (const [name, descriptor] of codecOriginals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else Reflect.deleteProperty(globalThis, name)
    }
  }
} finally {
  player?.destroy()
  await server.close()
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else Reflect.deleteProperty(globalThis, name)
  }
}
console.log('websocket-audio connection tests passed')
