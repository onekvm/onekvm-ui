import assert from 'node:assert/strict'

import {
  effectiveVideoCodec,
  connectionVideoCodec,
  preferredWebRTCCodecs,
  selectEncodedVideoTransport,
  supportsWebRTCClient,
  supportsWebRTCVideo,
  webrtcVideoMimeToken,
  videoCodecLabel,
  parseVideoTransport,
  probeWebRTCVideoSupport,
  h265SupportForTransport,
} from '../src/lib/video-transport.ts'

assert.equal(parseVideoTransport(null), 'webrtc')
assert.equal(parseVideoTransport('websocket'), 'websocket')
assert.equal(parseVideoTransport('mjpeg'), 'webrtc')

// HEVC over RTP and HEVC over MSE are independent decoder paths. Neither
// transport may enable H.265 based on the other's advertised capabilities.
assert.equal(h265SupportForTransport('websocket', true, false), false)
assert.equal(h265SupportForTransport('webrtc', false, true), false)
assert.equal(h265SupportForTransport('websocket', false, true), true)
assert.equal(h265SupportForTransport('webrtc', true, false), true)
assert.equal(h265SupportForTransport('websocket', true, null), null)
assert.equal(h265SupportForTransport('webrtc', null, true), null)

assert.equal(effectiveVideoCodec({ codec: 'auto', actual_codec: 'h265' }), 'h265')
assert.equal(effectiveVideoCodec({ codec: 'auto' }), 'h264')
const staleH264Telemetry = { codec: 'h265', actual_codec: 'h264' }
const staleH265Telemetry = { codec: 'h264', actual_codec: 'h265' }
assert.equal(connectionVideoCodec(staleH264Telemetry), 'h265')
assert.equal(connectionVideoCodec(staleH265Telemetry), 'h264')
assert.equal(connectionVideoCodec({ ...staleH265Telemetry, codec: 'auto' }), 'h264')
assert.equal(videoCodecLabel({ codec: 'auto', actual_codec: 'h264' }), 'Auto (H264)')
assert.equal(videoCodecLabel({ codec: 'h265' }), 'H265')

assert.equal(webrtcVideoMimeToken('H.265'), 'h265')
assert.equal(webrtcVideoMimeToken('hevc'), 'h265')
assert.equal(webrtcVideoMimeToken('h264'), 'h264')
assert.equal(webrtcVideoMimeToken('mjpeg'), null)

assert.equal(supportsWebRTCVideo('h265', ['video/VP8', 'video/H264']), false)
assert.equal(supportsWebRTCVideo('h265', ['video/VP8', 'video/H265']), true)
assert.equal(supportsWebRTCVideo('h264', ['video/H264']), true)

assert.equal(supportsWebRTCClient({
  peerConnection: true,
  mediaStream: true,
  dataChannel: true,
  transceiver: true,
}), true)
assert.equal(supportsWebRTCClient({
  peerConnection: true,
  mediaStream: true,
  dataChannel: false,
  transceiver: true,
}), false)

const ordered = preferredWebRTCCodecs('h265', [
  { mimeType: 'video/VP8' },
  { mimeType: 'video/H264' },
  { mimeType: 'video/H265' },
  { mimeType: 'video/AV1' },
])
assert.deepEqual(ordered?.map((codec) => codec.mimeType), [
  'video/H265',
  'video/VP8',
  'video/H264',
  'video/AV1',
])
assert.equal(preferredWebRTCCodecs('h265', [{ mimeType: 'video/H264' }]), null)

const browserGlobals = ['RTCPeerConnection', 'RTCRtpReceiver', 'MediaStream'] as const
const originalGlobals = browserGlobals.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const)
let receiverMimeTypes = ['video/H265']
let offerSdp = 'v=0\r\na=rtpmap:102 H265/90000\r\n'
let rejectCodecPreferences = false
let rejectOffer = false
let stallOffer = false
let createdPeers = 0
let closedPeers = 0

class ProbePeer {
  constructor() { createdPeers += 1 }
  createDataChannel() { return {} }
  addTransceiver() {
    return {
      setCodecPreferences() {
        if (rejectCodecPreferences) throw new Error('Receive codec cannot be used as a send preference')
      },
    }
  }
  async createOffer() {
    if (rejectOffer) throw new Error('Codec negotiation failed')
    if (stallOffer) return new Promise<never>(() => {})
    return { sdp: offerSdp }
  }
  close() { closedPeers += 1 }
}

try {
  Object.defineProperty(globalThis, 'RTCPeerConnection', { configurable: true, value: ProbePeer })
  Object.defineProperty(globalThis, 'RTCRtpReceiver', {
    configurable: true,
    value: { getCapabilities: () => ({ codecs: receiverMimeTypes.map((mimeType) => ({ mimeType })) }) },
  })
  Object.defineProperty(globalThis, 'MediaStream', { configurable: true, value: class {} })

  receiverMimeTypes = ['video/H264']
  assert.equal(await probeWebRTCVideoSupport('h265'), false)
  assert.equal(createdPeers, 0)

  receiverMimeTypes = ['video/H265']
  assert.equal(await probeWebRTCVideoSupport('h265'), true)
  assert.equal(closedPeers, createdPeers)

  offerSdp = 'v=0\r\na=rtpmap:102 H264/90000\r\n'
  assert.equal(await probeWebRTCVideoSupport('h265'), false, 'Advertised HEVC without an HEVC offer must be rejected')
  assert.equal(closedPeers, createdPeers)

  rejectCodecPreferences = true
  offerSdp = 'v=0\r\na=rtpmap:102 H265/90000\r\n'
  assert.equal(await probeWebRTCVideoSupport('h265'), true, 'Receive support may still be present in the default offer')

  rejectOffer = true
  assert.equal(await probeWebRTCVideoSupport('h265'), false)
  assert.equal(closedPeers, createdPeers)

  rejectOffer = false
  stallOffer = true
  assert.equal(await probeWebRTCVideoSupport('h265', 1), false)
  assert.equal(closedPeers, createdPeers, 'Timed-out probes must release the peer connection')
} finally {
  for (const [name, descriptor] of originalGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else Reflect.deleteProperty(globalThis, name)
  }
}

assert.deepEqual(
  selectEncodedVideoTransport({
    codec: 'h265',
    preferred: 'websocket',
    webrtcSupported: true,
    webrtcCodecSupported: true,
    websocketSupported: false,
  }),
  { kind: 'fallback', prompt: 'h265-unsupported' },
  'An explicit WebSocket choice must reject failed MSE decoding even if RTP HEVC is available',
)
assert.deepEqual(
  selectEncodedVideoTransport({
    codec: 'h265',
    preferred: 'webrtc',
    webrtcSupported: true,
    webrtcCodecSupported: true,
    websocketSupported: false,
  }),
  { kind: 'connect', transport: 'webrtc' },
)
assert.deepEqual(
  selectEncodedVideoTransport({
    codec: 'h264',
    preferred: 'webrtc',
    webrtcSupported: false,
    webrtcCodecSupported: false,
    websocketSupported: true,
  }),
  { kind: 'fallback', prompt: 'webrtc-unsupported' },
)
assert.deepEqual(
  selectEncodedVideoTransport({
    codec: 'h265',
    preferred: 'webrtc',
    webrtcSupported: true,
    webrtcCodecSupported: false,
    websocketSupported: true,
  }),
  { kind: 'connect', transport: 'websocket' },
)
assert.deepEqual(
  selectEncodedVideoTransport({
    codec: 'h265',
    preferred: 'webrtc',
    webrtcSupported: false,
    webrtcCodecSupported: false,
    websocketSupported: false,
  }),
  { kind: 'fallback', prompt: 'h265-unsupported' },
)
assert.deepEqual(
  selectEncodedVideoTransport({
    codec: 'h265',
    preferred: 'webrtc',
    webrtcSupported: true,
    webrtcCodecSupported: false,
    websocketSupported: false,
  }),
  { kind: 'fallback', prompt: 'h265-unsupported' },
)
assert.deepEqual(
  selectEncodedVideoTransport({
    codec: 'h265',
    preferred: 'websocket',
    webrtcSupported: true,
    webrtcCodecSupported: true,
    websocketSupported: true,
  }),
  { kind: 'connect', transport: 'websocket' },
)
assert.deepEqual(
  selectEncodedVideoTransport({
    codec: 'h264',
    preferred: 'webrtc',
    webrtcSupported: false,
    webrtcCodecSupported: false,
    websocketSupported: false,
  }),
  { kind: 'unsupported' },
)

console.log('video-transport tests passed')
