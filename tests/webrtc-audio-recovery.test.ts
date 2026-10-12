import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const peers: FakePeer[] = []
let clock = 0
let timerID = 0
const timeouts = new Map<number, { callback: () => void; delay: number }>()
const intervals = new Map<number, () => Promise<void>>()
const nextTurn = () => new Promise<void>(resolve => setImmediate(resolve))
async function until(predicate: () => boolean) {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await nextTurn() }
  assert.fail('Audio negotiation did not finish')
}
function runTimeouts(delay: number) {
  for (const [id, timer] of [...timeouts]) if (timer.delay === delay) {
    timeouts.delete(id); timer.callback()
  }
}
class FakeTrack {
  readyState = 'live'
  readonly kind: string
  constructor(kind: string) { this.kind = kind }
  stop() { this.readyState = 'ended' }
}
class FakeStream {
  private tracks: FakeTrack[]
  constructor(tracks: FakeTrack[] = []) { this.tracks = tracks }
  addTrack(track: FakeTrack) { this.tracks.push(track) }
  getTracks() { return this.tracks }
  getVideoTracks() { return this.tracks.filter(track => track.kind === 'video') }
  getAudioTracks() { return this.tracks.filter(track => track.kind === 'audio') }
}
class FakePeer {
  connectionState = 'new'
  iceGatheringState = 'complete'
  localDescription: { sdp: string } | null = null
  ontrack: ((event: { track: FakeTrack }) => void) | null = null
  onconnectionstatechange: (() => void) | null = null
  kinds: string[] = []
  sentTrack: FakeTrack | null = null
  count = 48000
  delay = 48000 * 0.06
  timestamp = 1000
  control: ReturnType<FakePeer['createDataChannel']> | null = null
  constructor() { peers.push(this) }
  createDataChannel() {
    const control = { readyState: 'connecting', binaryType: '', onopen: null as (() => void) | null, onclose: null as (() => void) | null, onmessage: null, sent: [] as Uint8Array[], send(report: Uint8Array) { this.sent.push(report) }, close() { this.readyState = 'closed'; this.onclose?.() } }
    this.control = control
    return control
  }
  addTransceiver(kind: string) {
    this.kinds.push(kind)
    return { sender: { replaceTrack: async (track: FakeTrack | null) => { this.sentTrack = track } }, setCodecPreferences() {} }
  }
  async createOffer() { return { sdp: this.kinds.includes('video') ? 'H264/90000' : 'opus/48000/2' } }
  async setLocalDescription(offer: { sdp: string }) { this.localDescription = offer; this.connectionState = 'connecting' }
  async setRemoteDescription(answer: { sdp: string }) {
    assert.equal(answer.sdp, this.localDescription?.sdp)
    this.connectionState = 'connected'
    this.onconnectionstatechange?.()
    if (this.control) { this.control.readyState = 'open'; this.control.onopen?.() }
    this.ontrack?.({ track: new FakeTrack(this.kinds[0]!) })
  }
  getReceivers() { return [] }
  async getStats() {
    if (this.kinds[0] !== 'audio') return new Map()
    return new Map([['audio', { id: 'audio', type: 'inbound-rtp', kind: 'audio', timestamp: this.timestamp, jitterBufferEmittedCount: this.count, jitterBufferDelay: this.delay, packetsReceived: this.timestamp / 20, bytesReceived: this.timestamp * 10 }]])
  }
  close() { this.connectionState = 'closed'; this.onconnectionstatechange?.() }
}
class FakeSocket {
  static OPEN = 1
  readyState = 0
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  constructor() { queueMicrotask(() => { if (this.readyState === 0) { this.readyState = 1; this.onopen?.() } }) }
  close() { this.readyState = 3; this.onclose?.() }
}
const globals = {
  localStorage: { getItem: () => null, setItem() {} },
  window: { location: new URL('https://onekvm.test'), addEventListener() {}, setTimeout(callback: () => void, delay: number) { const id = ++timerID; timeouts.set(id, { callback, delay }); return id }, clearTimeout(id: number) { timeouts.delete(id) }, setInterval(callback: () => Promise<void>) { const id = ++timerID; intervals.set(id, callback); return id }, clearInterval(id: number) { intervals.delete(id) } },
  document: { querySelector: () => null },
  performance: { now: () => clock },
  navigator: { mediaDevices: { getUserMedia: async () => new FakeStream([new FakeTrack('audio')]) } },
  MediaStream: FakeStream, RTCPeerConnection: FakePeer, WebSocket: FakeSocket,
  RTCRtpReceiver: { getCapabilities: () => ({ codecs: [{ mimeType: 'video/H264' }] }) },
}
const originals = Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const)
for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, value })
const server = await createServer({ configFile: false, root: fileURLToPath(new URL('..', import.meta.url)), optimizeDeps: { noDiscovery: true, include: [] }, resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } }, server: { middlewareMode: true, hmr: false, watch: null } })
let cleanup: (() => Promise<void>) | undefined
try {
  const { api } = await server.ssrLoadModule('/src/api/client.ts')
  const { AudioLatencyRecovery } = await server.ssrLoadModule('/src/lib/webrtc-audio.ts')
  const policy = new AudioLatencyRecovery()
  assert.equal(policy.sample(60_000, 0, true), false)
  assert.equal(policy.sample(300_000, 1000, true), false)
  assert.equal(policy.sample(300_000, 2000, false), false, 'Stalled counters must break sustained-high detection')
  assert.equal(policy.sample(300_000, 3000, true), false)
  assert.equal(policy.sample(300_000, 5000, true), true)
  policy.reset()
  assert.equal(policy.sample(1_500_000, 6000, true), false, 'Replacing a receiver must preserve cooldown')
  assert.equal(policy.sample(1_500_000, 20000, true), true)

  const { onekvm } = await server.ssrLoadModule('/src/lib/onekvm.ts')
  cleanup = () => onekvm.close()
  api.getStatus = async () => ({ video: { codec: 'h264' }, audio: { enabled: true, channels: 'stereo' } })
  api.getConfigSchema = async () => ({ capabilities: { audio: true } })
  api.getWebRTCIce = async () => ({ ice_servers: [] })
  const closed: string[] = []
  const offers: { id: string; media: string }[] = []
  const microphoneClaims: { id: string; enabled: boolean }[] = []
  api.closeWebRTCSession = async (id: string) => { closed.push(id) }
  api.setWebRTCMicrophone = async (id: string, enabled: boolean) => { microphoneClaims.push({ id, enabled }); return { microphone: enabled } }
  let pendingAudio: { promise: Promise<{ session_id: string; sdp: string }>; resolve: (answer: { session_id: string; sdp: string }) => void } | null = null
  api.createWebRTCSession = async (sdp: string, microphone: boolean, media: string) => {
    assert.equal(microphone, false)
    const id = `session-${offers.length + 1}`
    offers.push({ id, media })
    if (media === 'audio' && pendingAudio) return pendingAudio.promise
    return { session_id: id, sdp, is_primary: media === 'video' }
  }
  let state: { connection: string; audioError: string; controlReady: boolean; webRTCSessionId: string } | undefined
  onekvm.subscribe((value: typeof state) => { state = value })
  const video = { srcObject: null, muted: false, play: async () => {} }
  const audio = { srcObject: null, paused: true, getAttribute() { return '' }, removeAttribute() {}, play: async () => { audio.paused = false } }
  onekvm.attachVideo(video)
  onekvm.attachAudio(audio)
  await onekvm.connect()
  await until(() => Boolean(onekvm.audioSessionID()))
  assert.deepEqual(offers.map(offer => offer.media), ['video', 'audio'])
  const videoPeer = peers.find(peer => peer.control)!
  assert.deepEqual(videoPeer.kinds, ['video'])
  const videoStream = video.srcObject
  const firstAudio = peers.at(-1)!
  assert.deepEqual(firstAudio.kinds, ['audio'])
  assert.equal(onekvm.sessionID(), 'session-1', 'Video settings must use the video session')
  assert.equal(onekvm.audioSessionID(), 'session-2')
  await onekvm.setMicrophone(true)
  assert.ok(firstAudio.sentTrack)
  assert.equal(microphoneClaims.at(-1)?.id, 'session-2')

  const staleTrack = firstAudio.ontrack!
  firstAudio.connectionState = 'failed'
  firstAudio.onconnectionstatechange?.()
  await until(() => [...timeouts.values()].some(timer => timer.delay === 1000))
  assert.ok(closed.includes('session-2'))
  runTimeouts(1000)
  await until(() => onekvm.audioSessionID() === 'session-3' && onekvm.microphoneGranted())
  assert.equal(videoPeer.connectionState, 'connected')
  assert.equal(video.srcObject, videoStream)
  assert.equal(state?.controlReady, true)
  assert.equal(microphoneClaims.at(-1)?.id, 'session-3', 'Microphone lease must follow audio recovery')
  const audioStream = audio.srcObject
  staleTrack({ track: new FakeTrack('audio') })
  assert.equal(audio.srcObject, audioStream, 'Old receiver must not overwrite new audio')

  async function sampleAudio(delaySeconds: number) {
    clock += 1000
    const peer = peers.at(-1)!
    peer.count += 48000; peer.delay += 48000 * delaySeconds; peer.timestamp += 1000
    for (const callback of [...intervals.values()]) await callback()
    await nextTurn()
  }
  await sampleAudio(1.5)
  await until(() => [...timeouts.values()].some(timer => timer.delay === 0))
  assert.equal(state?.audioError, 'latency-recovery')
  runTimeouts(0)
  await until(() => onekvm.audioSessionID() === 'session-4' && onekvm.microphoneGranted())
  assert.equal(video.srcObject, videoStream)
  assert.equal(videoPeer.connectionState, 'connected')
  assert.ok(closed.includes('session-3'))
  for (let i = 0; i < 13; i++) await sampleAudio(1.5)
  assert.equal(offers.length, 4, 'High delay must not cause a reconnect loop during cooldown')
  onekvm.sendKeyboard([4])
  assert.equal(videoPeer.control!.sent.length, 1, 'Audio recovery must leave HID available')

  const oldPeer = peers.at(-1)!
  let resolve!: (answer: { session_id: string; sdp: string }) => void
  pendingAudio = { promise: new Promise(yes => { resolve = yes }), resolve: answer => resolve(answer) }
  oldPeer.connectionState = 'failed'; oldPeer.onconnectionstatechange?.()
  await until(() => [...timeouts.values()].some(timer => timer.delay === 1000))
  runTimeouts(1000)
  await until(() => offers.length === 5)
  await onekvm.close()
  pendingAudio.resolve({ session_id: 'session-5', sdp: 'opus/48000/2' })
  await until(() => closed.includes('session-5'))
  assert.equal(state?.connection, 'closed')
  assert.ok(peers.every(peer => peer.connectionState === 'closed'))
  assert.equal(intervals.size, 0)
  assert.equal(timeouts.size, 0)
  console.log('webrtc-audio-recovery tests passed')
} finally {
  await cleanup?.()
  await server.close()
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else Reflect.deleteProperty(globalThis, name)
  }
}
