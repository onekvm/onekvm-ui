export const AUDIO_HEADER_SIZE = 32
const MAGIC = [0x4f, 0x4b, 0x41, 0x46]

export interface PCMAudioFrame {
  sequence: bigint
  sampleRate: number
  channels: number
  samples: number
  payloadBytes: number
}

export function parsePCMAudioFrame(buffer: ArrayBuffer): PCMAudioFrame | null {
  if (buffer.byteLength < AUDIO_HEADER_SIZE) return null
  const bytes = new Uint8Array(buffer)
  if (!MAGIC.every((value, index) => bytes[index] === value) || bytes[4] !== 1 || bytes[5] !== 1 || bytes[7] !== 0) return null
  const view = new DataView(buffer)
  const channels = bytes[6]!
  const sampleRate = view.getUint32(24)
  const payloadBytes = view.getUint32(28)
  if (![1, 2].includes(channels) || sampleRate < 8000 || sampleRate > 96000 ||
    payloadBytes !== buffer.byteLength - AUDIO_HEADER_SIZE || payloadBytes === 0 ||
    payloadBytes % (channels * 2) !== 0) return null
  const samples = payloadBytes / (channels * 2)
  if (samples > sampleRate / 10) return null
  return { sequence: view.getBigUint64(8), sampleRate, channels, samples, payloadBytes }
}

export function microphonePCMFrame(payload: ArrayBuffer, sequence: bigint, ptsUs: number): ArrayBuffer {
  const frame = new ArrayBuffer(AUDIO_HEADER_SIZE + payload.byteLength)
  new Uint8Array(frame).set([...MAGIC, 1, 1, 1, 0])
  const view = new DataView(frame)
  view.setBigUint64(8, sequence)
  view.setBigUint64(16, BigInt(Math.max(0, Math.round(ptsUs))))
  view.setUint32(24, 48000)
  view.setUint32(28, payload.byteLength)
  new Uint8Array(frame, AUDIO_HEADER_SIZE).set(new Uint8Array(payload))
  return frame
}

export interface OpusAudioFrame {
  sequence: bigint
  ptsUs: number
  sampleRate: number
  channels: number
  payloadBytes: number
}

export function parseOpusAudioFrame(buffer: ArrayBuffer): OpusAudioFrame | null {
  if (buffer.byteLength <= AUDIO_HEADER_SIZE || buffer.byteLength > AUDIO_HEADER_SIZE + 4000) return null
  const bytes = new Uint8Array(buffer)
  if (!MAGIC.every((value, index) => bytes[index] === value) || bytes[4] !== 1 || bytes[5] !== 2 || bytes[7] !== 0) return null
  const view = new DataView(buffer)
  const pts = view.getBigUint64(16)
  const channels = bytes[6]!
  const payloadBytes = view.getUint32(28)
  if (![1, 2].includes(channels) || view.getUint32(24) !== 48000 || payloadBytes !== buffer.byteLength - AUDIO_HEADER_SIZE || pts > BigInt(Number.MAX_SAFE_INTEGER)) return null
  return { sequence: view.getBigUint64(8), ptsUs: Number(pts), sampleRate: 48000, channels, payloadBytes }
}
