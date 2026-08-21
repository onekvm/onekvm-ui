export type EncodedVideoTransport = 'webrtc' | 'websocket' | 'unsupported'

export class VideoCodecUnsupportedError extends Error {
  readonly kind = 'codec-unsupported' as const

  constructor(codec: string) {
    super(`This browser cannot decode ${codec.toUpperCase()}`)
    this.name = 'VideoCodecUnsupportedError'
  }
}

export function webrtcVideoMimeToken(codecName: string): string | null {
  const value = codecName.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (value === 'h264' || value === 'avc') return 'h264'
  if (value === 'h265' || value === 'hevc') return 'h265'
  return null
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
  websocketSupported: boolean
}): EncodedVideoTransport {
  if (input.preferred === 'websocket' && input.websocketSupported) return 'websocket'
  if (input.codec.toLowerCase() !== 'h265' || input.webrtcSupported) return 'webrtc'
  if (input.websocketSupported) return 'websocket'
  return 'unsupported'
}
