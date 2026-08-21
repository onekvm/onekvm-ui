import assert from 'node:assert/strict'

import {
  applyLowLatencyReceiver,
  preferredWebRTCCodecs,
  selectEncodedVideoTransport,
  supportsWebRTCVideo,
  webrtcVideoMimeToken,
} from '../src/lib/video-transport.ts'

assert.equal(webrtcVideoMimeToken('H.265'), 'h265')
assert.equal(webrtcVideoMimeToken('hevc'), 'h265')
assert.equal(webrtcVideoMimeToken('h264'), 'h264')
assert.equal(webrtcVideoMimeToken('mjpeg'), null)

assert.equal(supportsWebRTCVideo('h265', ['video/VP8', 'video/H264']), false)
assert.equal(supportsWebRTCVideo('h265', ['video/VP8', 'video/H265']), true)
assert.equal(supportsWebRTCVideo('h264', ['video/H264']), true)

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

assert.equal(
  selectEncodedVideoTransport({
    codec: 'h265',
    preferred: 'webrtc',
    webrtcSupported: true,
    websocketSupported: false,
  }),
  'webrtc',
)
assert.equal(
  selectEncodedVideoTransport({
    codec: 'h265',
    preferred: 'webrtc',
    webrtcSupported: false,
    websocketSupported: true,
  }),
  'websocket',
)
assert.equal(
  selectEncodedVideoTransport({
    codec: 'h265',
    preferred: 'webrtc',
    webrtcSupported: false,
    websocketSupported: false,
  }),
  'unsupported',
)
assert.equal(
  selectEncodedVideoTransport({
    codec: 'h265',
    preferred: 'websocket',
    webrtcSupported: true,
    websocketSupported: true,
  }),
  'websocket',
)
assert.equal(
  selectEncodedVideoTransport({
    codec: 'h264',
    preferred: 'webrtc',
    webrtcSupported: false,
    websocketSupported: false,
  }),
  'webrtc',
)

const receiver = { jitterBufferTarget: 80, playoutDelayHint: 0.04 }
applyLowLatencyReceiver(receiver as unknown as RTCRtpReceiver)
assert.equal(receiver.jitterBufferTarget, 0)
assert.equal(receiver.playoutDelayHint, 0)
applyLowLatencyReceiver(undefined)

console.log('video-transport tests passed')
