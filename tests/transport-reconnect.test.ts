import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

async function until(predicate: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return
    await new Promise((resolve) => setImmediate(resolve))
  }
  assert.fail('Transport did not reach the expected negotiation stage')
}

class FakeStream {
  private tracks: { kind: string }[]
  constructor(tracks: { kind: string }[] = []) { this.tracks = tracks }
  addTrack(track: { kind: string }) { this.tracks.push(track) }
  getTracks() { return this.tracks }
  getVideoTracks() { return this.tracks.filter((track) => track.kind === 'video') }
  getAudioTracks() { return this.tracks.filter((track) => track.kind === 'audio') }
}

const peers: FakePeer[] = []
class FakePeer {
  connectionState = 'new'
  iceGatheringState = 'complete'
  localDescription: { sdp: string } | null = null
  ontrack: ((event: { track: { kind: string } }) => void) | null = null
  onconnectionstatechange: (() => void) | null = null
  preferred: { mimeType: string }[] = []
  control: ReturnType<FakePeer['createDataChannel']> | null = null
  constructor() { peers.push(this) }
  createDataChannel() {
    const channel = {
      binaryType: '', readyState: 'connecting',
      onopen: null as (() => void) | null,
      onclose: null as (() => void) | null,
      onmessage: null as ((event: { data: ArrayBuffer }) => void) | null,
      close() { this.readyState = 'closed'; this.onclose?.() },
    }
    this.control = channel
    return channel
  }
  addTransceiver(kind: string) {
    return {
      sender: { replaceTrack: async () => {} },
      setCodecPreferences: (codecs: { mimeType: string }[]) => {
        if (kind === 'video') this.preferred = codecs
      },
    }
  }
  async createOffer() {
    // A receive-capable browser may only include HEVC after codec preferences.
    return { sdp: `v=0\r\na=rtpmap:102 H264/90000\r\n${this.preferred[0]?.mimeType === 'video/H265' ? 'a=rtpmap:103 H265/90000\r\n' : ''}` }
  }
  async setLocalDescription(offer: { sdp: string }) {
    this.localDescription = offer
    this.connectionState = 'connecting'
  }
  async setRemoteDescription(answer: { sdp: string }) {
    assert.ok(this.localDescription?.sdp.includes(answer.sdp), 'Offer must contain the new pipeline codec')
    this.connectionState = 'connected'
    this.onconnectionstatechange?.()
    this.control!.readyState = 'open'
    this.control!.onopen?.()
    this.ontrack?.({ track: { kind: 'video' } })
  }
  getReceivers() { return [] }
  async getStats() { return new Map() }
  close() { this.connectionState = 'closed'; this.onconnectionstatechange?.() }
}

const browserGlobals = {
  localStorage: { getItem: () => null, setItem: () => {} },
  window: { setTimeout, clearTimeout, setInterval, clearInterval },
  document: { querySelector: () => null },
  MediaStream: FakeStream,
  RTCPeerConnection: FakePeer,
  RTCRtpReceiver: { getCapabilities: () => ({ codecs: [{ mimeType: 'video/H264' }, { mimeType: 'video/H265' }] }) },
}
const originalGlobals = Object.keys(browserGlobals).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const)
for (const [name, value] of Object.entries(browserGlobals)) {
  Object.defineProperty(globalThis, name, { configurable: true, value })
}

const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  root: fileURLToPath(new URL('..', import.meta.url)),
  resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
  server: { middlewareMode: true, hmr: false, watch: null },
})
let cleanup: (() => Promise<void>) | undefined
try {
  const { api } = await server.ssrLoadModule('/src/api/client.ts')
  const { statusEvents } = await server.ssrLoadModule('/src/lib/status-events.ts')
  const { onekvm } = await server.ssrLoadModule('/src/lib/onekvm.ts')
  cleanup = () => onekvm.close()
  let codec = 'h264'
  let telemetryCodec = 'h264'
  let statusReads = 0
  const snapshot = (value: string) => ({ video: { codec: value, actual_codec: telemetryCodec }, audio: { enabled: false, channels: 'stereo' } })
  statusEvents.waitForStatus = async () => snapshot('h264')
  api.getStatus = async () => { statusReads += 1; return snapshot(codec) }
  api.getWebRTCIce = async () => ({ ice_servers: [] })
  const closedSessions: string[] = []
  api.closeWebRTCSession = async (id: string) => { closedSessions.push(id) }
  const offers: { id: string; codec: string; sdp: string }[] = []
  type Answer = { session_id: string; sdp: string }
  let pendingAnswer: ReturnType<typeof deferred<Answer>> | undefined
  api.createWebRTCSession = async (sdp: string) => {
    const id = `session-${offers.length + 1}`
    offers.push({ id, codec, sdp })
    if (pendingAnswer) return pendingAnswer.promise
    return { session_id: id, sdp: `${codec === 'h265' ? 'H265' : 'H264'}/90000` }
  }
  let state: { connection: string; controlReady: boolean; webRTCSessionId: string } | undefined
  const unsubscribe = onekvm.subscribe((next: typeof state) => { state = next })
  const video = { srcObject: null, muted: false, play: async () => {} }
  onekvm.attachVideo(video)

  await onekvm.connect()
  assert.equal(state?.connection, 'connected')
  const oldPeer = peers.findLast((peer) => peer.control)!
  const oldConnectionCallback = oldPeer.onconnectionstatechange!
  const oldTrackCallback = oldPeer.ontrack!
  const oldControlClose = oldPeer.control!.onclose!

  codec = 'h265'
  await onekvm.reconnect()
  assert.equal(offers.at(-1)?.codec, 'h265')
  assert.equal(peers.at(-1)?.preferred[0]?.mimeType, 'video/H265')
  assert.ok(closedSessions.includes('session-1'))
  assert.equal(state?.connection, 'connected')
  const newStream = video.srcObject
  oldPeer.connectionState = 'failed'
  oldConnectionCallback()
  oldControlClose()
  oldTrackCallback({ track: { kind: 'video' } })
  assert.equal(state?.connection, 'connected', 'Old peer events must not fail the replacement')
  assert.equal(state?.controlReady, true)
  assert.equal(video.srcObject, newStream, 'Old tracks must not replace the new stream')

  statusEvents.waitForStatus = async () => snapshot('h265')
  telemetryCodec = 'h265'
  codec = 'h264'
  const firstRestart = onekvm.reconnect()
  const repeatedRestart = onekvm.reconnect()
  await Promise.all([firstRestart, repeatedRestart])
  assert.equal(offers.length, 3, 'Concurrent reconnect requests must share one new session')
  assert.equal(statusReads, 3, 'Each new connection must fetch a fresh status')
  assert.equal(offers.at(-1)?.codec, 'h264')
  assert.equal(state?.connection, 'connected')

  await onekvm.close()
  pendingAnswer = deferred<Answer>()
  const connecting = onekvm.connect()
  await until(() => offers.length === 4)
  const inFlightPeer = peers.at(-1)!
  codec = 'h265'
  const restartDuringOffer = onekvm.reconnect()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(inFlightPeer.connectionState, 'connecting', 'Reconnect must wait for the in-flight offer before closing its peer')
  const answer = pendingAnswer
  pendingAnswer = undefined
  answer.resolve({ session_id: 'session-4', sdp: 'H264/90000' })
  await Promise.all([connecting, restartDuringOffer])
  assert.equal(offers.length, 5)
  assert.ok(closedSessions.includes('session-4'))
  assert.equal(offers.at(-1)?.codec, 'h265')
  assert.equal(state?.connection, 'connected')

  await onekvm.close()
  pendingAnswer = deferred<Answer>()
  const abandoned = onekvm.connect()
  await until(() => offers.length === 6)
  await onekvm.close()
  const abandonedAnswer = pendingAnswer
  pendingAnswer = undefined
  codec = 'h264'
  await onekvm.connect()
  const survivingSession = onekvm.sessionID()
  abandonedAnswer.resolve({ session_id: 'session-6', sdp: 'H265/90000' })
  await abandoned
  assert.ok(closedSessions.includes('session-6'), 'Late answers must close their orphaned server session')
  assert.equal(onekvm.sessionID(), survivingSession)
  assert.equal(state?.connection, 'connected')

  await onekvm.close()
  pendingAnswer = deferred<Answer>()
  const failingOldAttempt = onekvm.connect()
  await until(() => offers.length === 8)
  await onekvm.close()
  const rejectedAnswer = pendingAnswer
  pendingAnswer = undefined
  await onekvm.connect()
  rejectedAnswer.reject(new Error('Obsolete offer failed'))
  await failingOldAttempt
  assert.equal(state?.connection, 'connected', 'An obsolete failure must not dispose the current peer')
  assert.equal(peers.at(-1)?.connectionState, 'connected')

  codec = 'auto'
  telemetryCodec = 'h265'
  await onekvm.reconnect()
  assert.equal(state?.connection, 'connected', 'Auto must negotiate H.264 even while telemetry still reports H.265')

  await onekvm.close()
  const pendingStatus = deferred<ReturnType<typeof snapshot>>()
  api.getStatus = () => pendingStatus.promise
  const closedBeforeStatus = onekvm.connect()
  const countBeforeClose = peers.length
  await onekvm.close()
  pendingStatus.resolve(snapshot('h265'))
  await closedBeforeStatus
  assert.equal(peers.length, countBeforeClose, 'Closing while status loads must prevent a new peer')
  assert.equal(state?.connection, 'closed')
  unsubscribe()
  console.log('transport-reconnect tests passed')
} finally {
  await cleanup?.()
  await server.close()
  for (const [name, descriptor] of originalGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else Reflect.deleteProperty(globalThis, name)
  }
}
