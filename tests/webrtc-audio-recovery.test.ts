import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const peers: FakePeer[] = []
const sockets: FakeSocket[] = []
let clock = 0
let timerID = 0
const timeouts = new Map<number, { callback: () => void; delay: number }>()
const intervals = new Map<number, () => Promise<void>>()
const nextTurn = () => new Promise<void>(resolve => setImmediate(resolve))
async function until(predicate: () => boolean) {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 2)) }
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
  static CLOSING = 2
  readyState = 0
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  sent: string[] = []
  readonly id: string
  readonly url: string
  readonly protocol: string | string[]
  constructor(url: string, protocol: string | string[]) {
    this.url = url
    this.protocol = protocol
    sockets.push(this)
    this.id = `socket-${sockets.length}`
    queueMicrotask(() => {
      if (this.readyState !== 0) return
      this.readyState = 1
      this.onopen?.()
      if (this.protocol === 'onekvm.audio.v1' || this.protocol.includes('onekvm.audio.v1')) this.receive({ type: 'ready', session_id: this.id, codec: 'pcm' })
    })
  }
  receive(data: object) { this.onmessage?.({ data: JSON.stringify(data) }) }
  send(value: string) {
    this.sent.push(value)
    if (typeof value !== 'string') return
    const request = JSON.parse(value)
    if (request.type === 'microphone') queueMicrotask(() => this.receive({ ...request, microphone: request.enabled }))
  }
  close() { this.readyState = 3; this.onclose?.() }
}
class FakeNode {
  gain = { value: 1 }
  fftSize = 256
  connect() {}
  disconnect() {}
}
class FakeContext {
  state = 'suspended'
  currentTime = 1
  destination = new FakeNode()
  audioWorklet = { addModule: async () => {} }
  createGain() { return new FakeNode() }
  createAnalyser() { return new FakeNode() }
  createMediaStreamSource() { return new FakeNode() }
  createMediaStreamDestination() { return Object.assign(new FakeNode(), { stream: new FakeStream([new FakeTrack('audio')]) }) }
  async resume() { this.state = 'running' }
  async close() { this.state = 'closed' }
}
class FakeWorklet extends FakeNode {
  port = { onmessage: null, postMessage() {} }
}
const globals = {
  localStorage: { getItem: () => null, setItem() {} },
  window: { AudioContext: FakeContext, location: new URL('https://onekvm.test'), addEventListener() {}, setTimeout(callback: () => void, delay: number) { const id = ++timerID; timeouts.set(id, { callback, delay }); return id }, clearTimeout(id: number) { timeouts.delete(id) }, setInterval(callback: () => Promise<void>) { const id = ++timerID; intervals.set(id, callback); return id }, clearInterval(id: number) { intervals.delete(id) } },
  document: { querySelector: () => null },
  performance: { now: () => clock },
  navigator: { mediaDevices: { getUserMedia: async () => new FakeStream([new FakeTrack('audio')]) } },
  MediaStream: FakeStream, RTCPeerConnection: FakePeer, WebSocket: FakeSocket,
  AudioWorkletNode: FakeWorklet,
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
  api.getStatus = async () => ({ video: { codec: 'h264' }, audio: { enabled: false, channels: 'stereo' } })
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
  onekvm.setSpeakerEnabled(true)
  await onekvm.connect()
  await nextTurn()
  assert.deepEqual(offers.map(offer => offer.media), ['video'], 'Disabled device audio must not create an idle PeerConnection')
  onekvm.setDeviceSpeakerEnabled(true)
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

  pendingAudio = null
  await onekvm.setMicrophone(false)
  api.getStatus = async () => ({ video: { codec: 'h264' }, audio: { enabled: true, channels: 'stereo', quality: 'pcm' } })
  const offerCount = offers.length
  await onekvm.connect()
  await until(() => Boolean(onekvm.audioSessionID()))
  assert.deepEqual(offers.slice(offerCount).map(offer => offer.media), ['video'], 'PCM with WebRTC video does not create an Opus audio peer')
  const pcmVideo = peers.at(-1)!
  const pcmStream = video.srcObject
  const pcmSocket = sockets.at(-1)!
  assert.deepEqual(pcmSocket.protocol, ['onekvm.audio.pcm-lz4.v1', 'onekvm.audio.v1'])
  const claims = microphoneClaims.length
  await onekvm.setMicrophone(true)
  assert.equal(onekvm.microphoneGranted(), true)
  assert.equal(microphoneClaims.length, claims, 'PCM microphone ownership uses the audio WebSocket with WebRTC video')
  assert.equal(JSON.parse(pcmSocket.sent.at(-1)!).enabled, true)

  pcmSocket.close()
  await until(() => [...timeouts.values()].some(timer => timer.delay === 1000))
  runTimeouts(1000)
  await until(() => Boolean(onekvm.audioSessionID()) && onekvm.audioSessionID() !== pcmSocket.id && onekvm.microphoneGranted())
  assert.equal(pcmVideo.connectionState, 'connected', 'PCM reconnect leaves the WebRTC video peer running')
  assert.equal(video.srcObject, pcmStream)
  onekvm.sendKeyboard([4])
  assert.equal(pcmVideo.control!.sent.length, 1)
  const replacement = sockets.at(-1)!

  const switchOffers = offers.length
  onekvm.setSpeakerGain(0.4)
  onekvm.setSpeakerEnabled(false)
  await onekvm.setAudioQuality('medium')
  await until(() => Boolean(onekvm.audioSessionID()) && onekvm.microphoneGranted())
  const switchedOpus = onekvm.audioSessionID()
  assert.equal(replacement.readyState, 3, 'Switching to Opus closes the PCM connection')
  assert.equal(JSON.parse(replacement.sent.at(-1)!).enabled, false, 'Release PCM microphone ownership before the new session claims it')
  assert.equal(microphoneClaims.at(-1)?.id, switchedOpus)
  assert.deepEqual(offers.slice(switchOffers).map(offer => offer.media), ['audio'])
  assert.equal(video.srcObject, pcmStream)
  assert.equal(pcmVideo.connectionState, 'connected')
  assert.equal(onekvm.speakerGain(), 0.4)
  assert.equal(onekvm.speakerEnabled(), false)
  assert.equal(audio.muted, true, 'Switching format preserves the local speaker preference')

  await onekvm.setAudioQuality('pcm')
  await until(() => onekvm.microphoneGranted())
  assert.ok(closed.includes(switchedOpus), 'Switching to PCM releases the Opus audio session')
  assert.equal(microphoneClaims.at(-1)?.id, switchedOpus, 'PCM restores microphone ownership through its own WebSocket')
  assert.equal(video.srcObject, pcmStream)
  onekvm.sendKeyboard([5])
  assert.equal(pcmVideo.control!.sent.length, 2, 'Both audio formats leave the existing HID channel usable')

  let resolveSchema!: (schema: object) => void
  let waitingForSchema = false
  let holdSchema = true
  api.getConfigSchema = () => {
    if (!holdSchema) return Promise.resolve({ capabilities: { audio: true } })
    holdSchema = false
    waitingForSchema = true
    return new Promise(resolve => { resolveSchema = resolve })
  }
  const beforeRapidSwitch = offers.length
  const staleOpen = onekvm.setAudioQuality('medium')
  await until(() => waitingForSchema)
  await onekvm.setAudioQuality('pcm')
  const rapidPCM = onekvm.audioSessionID()
  resolveSchema({ capabilities: { audio: true } })
  await staleOpen
  assert.equal(offers.length, beforeRapidSwitch, 'A stale schema response cannot create an Opus peer after a later PCM choice')
  assert.equal(onekvm.audioSessionID(), rapidPCM)

  let resolveSwitch!: (answer: { session_id: string; sdp: string }) => void
  pendingAudio = { promise: new Promise(yes => { resolveSwitch = yes }), resolve: answer => resolveSwitch(answer) }
  const beforeStaleAnswer = offers.length
  const staleAnswer = onekvm.setAudioQuality('medium')
  await until(() => offers.length > beforeStaleAnswer)
  const staleSession = offers.at(-1)!.id
  await onekvm.setAudioQuality('pcm')
  const finalPCM = onekvm.audioSessionID()
  pendingAudio.resolve({ session_id: staleSession, sdp: 'opus/48000/2' })
  await staleAnswer
  assert.ok(closed.includes(staleSession), 'Late Opus answers are closed after a newer format choice')
  assert.equal(onekvm.audioSessionID(), finalPCM)
  assert.equal(video.srcObject, pcmStream)
  assert.equal(pcmVideo.connectionState, 'connected')
  assert.equal(offers.filter(offer => offer.media === 'video').length, 2, 'Format changes never create another video session')
  const finalSocket = sockets.at(-1)!
  await onekvm.close()
  assert.equal(finalSocket.readyState, 3, 'Closing WebRTC video also releases its PCM audio connection')
  assert.equal(timeouts.size, 0)
  assert.equal(intervals.size, 0)
  pendingAudio = null
  await onekvm.setMicrophone(false)
  api.getStatus = async () => ({ video: { codec: 'h264' }, audio: { enabled: false, channels: 'stereo', quality: 'medium' } })
  onekvm.setSpeakerEnabled(true)
  const idleOffers = offers.length
  await onekvm.connect()
  await nextTurn()
  assert.deepEqual(offers.slice(idleOffers).map(offer => offer.media), ['video'])
  const lazyVideo = peers.at(-1)!
  const lazyVideoID = onekvm.sessionID()
  const beforeLazyClaims = microphoneClaims.filter(claim => claim.enabled).length
  await onekvm.setMicrophone(true)
  await nextTurn()
  assert.equal(microphoneClaims.filter(claim => claim.enabled).length, beforeLazyClaims + 1,
    'Lazy connection readiness and the user request share one microphone activation')
  assert.ok(onekvm.audioSessionID(), 'Microphone can create audio when the device speaker is disabled')
  assert.equal(onekvm.microphoneGranted(), true)
  onekvm.setSpeakerEnabled(false)
  await nextTurn()
  assert.ok(onekvm.audioSessionID(), 'Muting the speaker must preserve an active microphone')
  await onekvm.setMicrophone(false)
  await until(() => !onekvm.audioSessionID())
  assert.equal(lazyVideo.connectionState, 'connected')
  assert.equal(onekvm.sessionID(), lazyVideoID)
  onekvm.setDeviceSpeakerEnabled(true)
  onekvm.setSpeakerEnabled(true)
  await until(() => Boolean(onekvm.audioSessionID()))
  const beforeMute = onekvm.audioSessionID()
  onekvm.setSpeakerEnabled(false)
  await until(() => !onekvm.audioSessionID() && closed.includes(beforeMute))
  let resolveUnmute!: (answer: { session_id: string; sdp: string }) => void
  pendingAudio = { promise: new Promise(yes => { resolveUnmute = yes }), resolve: answer => resolveUnmute(answer) }
  const beforeUnmute = offers.length
  onekvm.setSpeakerEnabled(true)
  await until(() => offers.length > beforeUnmute)
  const lateID = offers.at(-1)!.id
  onekvm.setSpeakerEnabled(false)
  pendingAudio.resolve({ session_id: lateID, sdp: 'opus/48000/2' })
  await until(() => closed.includes(lateID))
  assert.equal(onekvm.audioSessionID(), '')
  assert.equal(onekvm.sessionID(), lazyVideoID, 'Mute and microphone changes preserve the video connection')
  pendingAudio = null
  const capture = navigator.mediaDevices.getUserMedia
  navigator.mediaDevices.getUserMedia = async () => { throw new Error('capture denied') }
  await assert.rejects(onekvm.setMicrophone(true), /capture denied/)
  await until(() => !onekvm.audioSessionID())
  assert.equal(onekvm.sessionID(), lazyVideoID, 'Denied microphone access releases idle audio only')
  navigator.mediaDevices.getUserMedia = capture
  await onekvm.close()
  assert.equal(timeouts.size, 0)
  assert.equal(intervals.size, 0)
  console.log('webrtc-audio-recovery tests passed')
} finally {
  await cleanup?.()
  await server.close()
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else Reflect.deleteProperty(globalThis, name)
  }
}
