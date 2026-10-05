export type WebSocketVideoCodec = 'h264' | 'h265'

export function normalizeWebSocketVideoCodec(codec: string): WebSocketVideoCodec | null {
  const value = codec.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (value === 'h264' || value === 'avc') return 'h264'
  if (value === 'h265' || value === 'hevc') return 'h265'
  return null
}

export function supportsWebSocketVideo(codecName: string) {
  const codec = normalizeWebSocketVideoCodec(codecName)
  if (!codec || typeof MediaSource === 'undefined' || typeof MediaSource.isTypeSupported !== 'function') {
    return false
  }
  const candidates = codec === 'h264'
    ? ['video/mp4; codecs="avc1.42E01E"', 'video/mp4; codecs="avc1.640028"']
    // JMuxer opens an hvc1 SourceBuffer. Accepting hev1 alone cannot prove
    // that path works; NanoKVM's Main encoder currently signals level 5.0.
    : ['video/mp4; codecs="hvc1.1.6.L150.B0"']
  return candidates.some((candidate) => MediaSource.isTypeSupported(candidate))
}

let h265WebSocketProbe: Promise<boolean> | undefined

export function detectH265WebSocketVideoSupport() {
  h265WebSocketProbe ??= supportsWebSocketVideo('h265')
    ? import('./websocket-video-probe').then(({ probeH265WebSocketVideoSupport }) => probeH265WebSocketVideoSupport()).catch(() => false)
    : Promise.resolve(false)
  return h265WebSocketProbe
}
