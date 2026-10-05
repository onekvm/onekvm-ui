export type EncodedVideoTransport = 'webrtc' | 'websocket'
export const VIDEO_TRANSPORT_KEY = 'onekvm-video-transport'

export function parseVideoTransport(value: string | null | undefined): EncodedVideoTransport {
  return value === 'websocket' ? 'websocket' : 'webrtc'
}

export function h265SupportForTransport(
  transport: EncodedVideoTransport,
  webrtc: boolean | null,
  websocket: boolean | null,
): boolean | null {
  return transport === 'websocket' ? websocket : webrtc
}
export type VideoFallbackPrompt = '' | 'webrtc-unsupported' | 'webrtc-failed' | 'h265-unsupported'
export type EncodedVideoTransportDecision =
  | { kind: 'connect'; transport: EncodedVideoTransport }
  | { kind: 'fallback'; prompt: Exclude<VideoFallbackPrompt, '' | 'webrtc-failed'> }
  | { kind: 'unsupported' }

export interface WebRTCClientFeatures {
  peerConnection: boolean
  mediaStream: boolean
  dataChannel: boolean
  transceiver: boolean
}

export class VideoCodecUnsupportedError extends Error {
  readonly kind = 'codec-unsupported' as const

  constructor(codec: string) {
    super(`This browser cannot decode ${codec.toUpperCase()}`)
    this.name = 'VideoCodecUnsupportedError'
  }
}

export function effectiveVideoCodec(video: { codec: string; actual_codec?: string }): string {
  const actual = video.actual_codec?.toLowerCase()
  if (actual === 'h264' || actual === 'h265' || actual === 'mjpeg') return actual
  const configured = video.codec.toLowerCase()
  // Current Auto encoders resolve to H.264; older servers omit actual_codec.
  return configured === 'auto' ? 'h264' : configured
}

export function connectionVideoCodec(video: { codec: string }): string {
  // A successful config PATCH has already reset the encoder. actual_codec is
  // sampled telemetry and can still describe the old encoder for a second.
  // Both current Auto backends select H.264 when opening/resetting the encoder.
  const configured = video.codec.toLowerCase()
  return configured === 'auto' || configured === '' ? 'h264' : configured
}

export function videoCodecLabel(video: { codec: string; actual_codec?: string }): string {
  const actual = effectiveVideoCodec(video).toUpperCase()
  return video.codec.toLowerCase() === 'auto' ? `Auto (${actual})` : actual
}

export function webrtcVideoMimeToken(codecName: string): string | null {
  const value = codecName.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (value === 'h264' || value === 'avc') return 'h264'
  if (value === 'h265' || value === 'hevc') return 'h265'
  return null
}

export function supportsWebRTCClient(
  features: WebRTCClientFeatures = {
    peerConnection: typeof globalThis.RTCPeerConnection === 'function',
    mediaStream: typeof globalThis.MediaStream === 'function',
    dataChannel: typeof globalThis.RTCPeerConnection?.prototype?.createDataChannel === 'function',
    transceiver: typeof globalThis.RTCPeerConnection?.prototype?.addTransceiver === 'function',
  },
) {
  return features.peerConnection && features.mediaStream && features.dataChannel && features.transceiver
}

export function listReceiverVideoMimeTypes(): string[] {
  const receiver = globalThis.RTCRtpReceiver
  if (!receiver || typeof receiver.getCapabilities !== 'function') return []
  return (receiver.getCapabilities('video')?.codecs ?? []).map((codec) => codec.mimeType)
}

export function supportsWebRTCVideo(
  codecName: string,
  mimeTypes: readonly string[] = listReceiverVideoMimeTypes(),
) {
  const token = webrtcVideoMimeToken(codecName)
  if (!token) return false
  return mimeTypes.some((mime) => mime.toLowerCase().includes(token))
}

export async function probeWebRTCVideoSupport(codecName: string, timeoutMs = 3000): Promise<boolean> {
  let peer: RTCPeerConnection | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const token = webrtcVideoMimeToken(codecName)
    if (!token || !supportsWebRTCClient() || !supportsWebRTCVideo(codecName)) return false

    // Capabilities can advertise HEVC even when the browser cannot negotiate
    // it. Generate a receive-only offer without gathering ICE or contacting
    // the device, using the same codec preferences as the live connection.
    peer = new RTCPeerConnection({ iceServers: [] })
    const video = peer.addTransceiver('video', { direction: 'recvonly' })
    const preferred = preferredWebRTCCodecs(codecName, RTCRtpReceiver.getCapabilities('video')?.codecs ?? [])
    if (preferred) {
      try {
        video.setCodecPreferences(preferred)
      } catch {
        // Use the codecs that the browser includes in its default offer.
      }
    }
    const offer = await Promise.race([
      peer.createOffer(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Video codec probe timed out')), timeoutMs)
      }),
    ])
    const codecPattern = token === 'h265' ? '(?:H265|HEVC)' : 'H264'
    return new RegExp(`^a=rtpmap:\\d+\\s+${codecPattern}/90000(?:\\s|$)`, 'im').test(offer.sdp ?? '')
  } catch {
    return false
  } finally {
    if (timer !== undefined) clearTimeout(timer)
    peer?.close()
  }
}

let h265WebRTCProbe: Promise<boolean> | undefined

export function detectH265WebRTCVideoSupport() {
  h265WebRTCProbe ??= probeWebRTCVideoSupport('h265')
  return h265WebRTCProbe
}

export function preferredWebRTCCodecs<T extends { mimeType: string }>(
  codecName: string,
  codecs: readonly T[],
): T[] | null {
  const token = webrtcVideoMimeToken(codecName)
  if (!token || !codecs.length) return null
  const matching = codecs.filter((codec) => codec.mimeType.toLowerCase().includes(token))
  if (!matching.length) return null
  return [...matching, ...codecs.filter((codec) => !codec.mimeType.toLowerCase().includes(token))]
}

export function selectEncodedVideoTransport(input: {
  codec: string
  preferred: 'webrtc' | 'websocket'
  webrtcSupported: boolean
  webrtcCodecSupported: boolean
  websocketSupported: boolean
}): EncodedVideoTransportDecision {
  const codec = webrtcVideoMimeToken(input.codec)
  if (!codec) return { kind: 'unsupported' }

  if (input.preferred === 'websocket') {
    if (input.websocketSupported) return { kind: 'connect', transport: 'websocket' }
    return codec === 'h265'
      ? { kind: 'fallback', prompt: 'h265-unsupported' }
      : { kind: 'unsupported' }
  }

  if (!input.webrtcSupported) {
    if (input.websocketSupported) return { kind: 'fallback', prompt: 'webrtc-unsupported' }
    if (codec === 'h265') return { kind: 'fallback', prompt: 'h265-unsupported' }
    return { kind: 'unsupported' }
  }

  if (codec !== 'h265' || input.webrtcCodecSupported) {
    return { kind: 'connect', transport: 'webrtc' }
  }

  if (input.websocketSupported) return { kind: 'connect', transport: 'websocket' }
  return { kind: 'fallback', prompt: 'h265-unsupported' }
}
