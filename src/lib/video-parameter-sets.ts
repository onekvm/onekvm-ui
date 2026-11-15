import type { WebSocketVideoCodec } from '@/lib/websocket-video-support'

/**
 * The parameter-set NAL units (H.264 SPS/PPS, H.265 VPS/SPS/PPS) that precede
 * the first slice of an Annex-B access unit, as one comparable string. Empty
 * when the access unit carries none.
 */
export function videoParameterSets(codec: WebSocketVideoCodec, payload: Uint8Array) {
  let key = ''
  let start = nextStartCode(payload, 0)
  while (start >= 0) {
    const nal = start + (payload[start + 2] === 1 ? 3 : 4)
    const end = nextStartCode(payload, nal)
    if (nal >= payload.length) break
    const type = codec === 'h264' ? payload[nal]! & 0x1f : (payload[nal]! >> 1) & 0x3f
    const slice = codec === 'h264' ? type >= 1 && type <= 5 : type <= 31
    if (slice) break
    const parameterSet = codec === 'h264' ? type === 7 || type === 8 : type >= 32 && type <= 34
    if (parameterSet) {
      const unit = payload.subarray(nal, end < 0 ? payload.length : end)
      key += `${unit.length}:`
      for (const byte of unit) key += String.fromCharCode(byte)
    }
    start = end
  }
  return key
}

function nextStartCode(payload: Uint8Array, from: number) {
  for (let index = from; index + 2 < payload.length; index++) {
    if (payload[index] !== 0 || payload[index + 1] !== 0) continue
    if (payload[index + 2] === 1) return index
    if (payload[index + 2] === 0 && payload[index + 3] === 1) return index
  }
  return -1
}
