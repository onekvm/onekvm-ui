import { AUDIO_HEADER_SIZE, parsePCMAudioFrame } from './websocket-audio-protocol'

const MAX_FRAME_BYTES = AUDIO_HEADER_SIZE + 38400
let failed = false

/** Decode one size-prefixed LZ4 block and reverse the PCM prediction. */
export function decodeLz4PCM(buffer: ArrayBuffer): ArrayBuffer {
  if (buffer.byteLength < 5 || buffer.byteLength > MAX_FRAME_BYTES + 512) throw new Error('Invalid LZ4 audio packet size')
  const length = new DataView(buffer).getUint32(0, true)
  if (length < AUDIO_HEADER_SIZE || length > MAX_FRAME_BYTES) throw new Error('Invalid PCM audio size')
  const input = new Uint8Array(buffer)
  const predicted = new Uint8Array(length)
  let source = 4
  let target = 0
  const extendedLength = (initial: number) => {
    let length = initial
    if (initial === 15) {
      let extra: number
      do {
        if (source >= input.length) throw new Error('Truncated LZ4 audio length')
        extra = input[source++]!
        length += extra
        if (length > MAX_FRAME_BYTES) throw new Error('Oversized LZ4 audio run')
      } while (extra === 255)
    }
    return length
  }
  while (source < input.length) {
    const token = input[source++]!
    const literals = extendedLength(token >>> 4)
    if (source + literals > input.length || target + literals > length) throw new Error('Invalid LZ4 audio literals')
    predicted.set(input.subarray(source, source + literals), target)
    source += literals
    target += literals
    if (source === input.length) break
    if (source + 2 > input.length) throw new Error('Truncated LZ4 audio offset')
    const offset = input[source]! | (input[source + 1]! << 8)
    source += 2
    const match = extendedLength(token & 15) + 4
    if (!offset || offset > target || target + match > length) throw new Error('Invalid LZ4 audio match')
    for (let index = 0; index < match; index++) {
      predicted[target] = predicted[target - offset]!
      target++
    }
  }
  if (target !== length) throw new Error('Incomplete LZ4 audio packet')
  const frame = parsePCMAudioFrame(predicted.buffer)
  if (!frame) throw new Error('Invalid predicted PCM audio packet')
  const output = new ArrayBuffer(length)
  new Uint8Array(output).set(predicted.subarray(0, AUDIO_HEADER_SIZE))
  const view = new DataView(output)
  const count = frame.payloadBytes / 2
  const perChannel = count / frame.channels
  const previous = [0, 0]
  for (let sample = 0; sample < perChannel; sample++) {
    let left = 0
    for (let channel = 0; channel < frame.channels; channel++) {
      const plane = channel * perChannel + sample
      const zigzag = predicted[AUDIO_HEADER_SIZE + plane]! | (predicted[AUDIO_HEADER_SIZE + count + plane]! << 8)
      const delta = (zigzag >>> 1) ^ -(zigzag & 1)
      let value = (previous[channel]! + delta) << 16 >> 16
      previous[channel] = value
      if (channel === 0) left = value
      else value = (value + left) << 16 >> 16
      view.setInt16(AUDIO_HEADER_SIZE + (sample * frame.channels + channel) * 2, value, true)
    }
  }
  return output
}

export class WebSocketLz4Decoder {
  static supported() { return !failed }
  private closed = false
  constructor(private readonly output: (buffer: ArrayBuffer) => void, private readonly error: () => void) {}
  decode(buffer: ArrayBuffer) {
    if (this.closed) return
    try { this.output(decodeLz4PCM(buffer)) } catch {
      failed = true
      this.closed = true
      this.error()
    }
  }
  destroy() { this.closed = true }
}
