// Pure helpers for the camera WebSocket; see onekvm-core docs/websocket-camera-v1.md.
export const CAMERA_SUBPROTOCOL = 'onekvm.camera.v1'
export const CAMERA_HEADER_SIZE = 24

/** H.264 profiles to try, most widely decodable first; level 4.0 covers 1080p30. */
export const CAMERA_H264_CODECS = ['avc1.42E028', 'avc1.4D4028', 'avc1.640028']

/** `OKCF | 1 | codec 1 (H.264 Annex B) | 0 0 | sequence | width | height | length`, big endian. */
export function encodeCameraFrame(sequence: bigint, width: number, height: number, unit: Uint8Array): Uint8Array {
  const frame = new Uint8Array(CAMERA_HEADER_SIZE + unit.length)
  frame.set([0x4f, 0x4b, 0x43, 0x46, 1, 1, 0, 0])
  const view = new DataView(frame.buffer)
  view.setBigUint64(8, sequence)
  view.setUint16(16, width)
  view.setUint16(18, height)
  view.setUint32(20, unit.length)
  frame.set(unit, CAMERA_HEADER_SIZE)
  return frame
}

export interface Rect { x: number; y: number; width: number; height: number }

/** Centre crop of a source frame that fills the target without stretching. */
export function coverCrop(sourceWidth: number, sourceHeight: number, width: number, height: number): Rect {
  if (sourceWidth <= 0 || sourceHeight <= 0) return { x: 0, y: 0, width: sourceWidth, height: sourceHeight }
  const scale = Math.max(width / sourceWidth, height / sourceHeight)
  const cropWidth = Math.min(sourceWidth, width / scale)
  const cropHeight = Math.min(sourceHeight, height / scale)
  return { x: (sourceWidth - cropWidth) / 2, y: (sourceHeight - cropHeight) / 2, width: cropWidth, height: cropHeight }
}

/** Where the whole source goes inside the target, centred with bars. */
export function containRect(sourceWidth: number, sourceHeight: number, width: number, height: number): Rect {
  if (sourceWidth <= 0 || sourceHeight <= 0) return { x: 0, y: 0, width, height }
  const scale = Math.min(width / sourceWidth, height / sourceHeight)
  const fitWidth = Math.round(sourceWidth * scale)
  const fitHeight = Math.round(sourceHeight * scale)
  return { x: Math.round((width - fitWidth) / 2), y: Math.round((height - fitHeight) / 2), width: fitWidth, height: fitHeight }
}

/** Encoder bitrate for the host's format: 0.1 bit per pixel, within the USB link. */
export function cameraBitrate(width: number, height: number, fps: number, maxBitrate: number, scale = 1) {
  const target = Math.round(width * height * fps * 0.1 * scale)
  const ceiling = maxBitrate > 0 ? maxBitrate : Number.MAX_SAFE_INTEGER
  return Math.max(250_000, Math.min(ceiling, target))
}

const START_CODE = [0, 0, 0, 1]

/** NAL units of an Annex B buffer, without start codes. */
export function annexBUnits(data: Uint8Array): Uint8Array[] {
  const units: Uint8Array[] = []
  let start = -1
  for (let index = 0; index + 2 < data.length; index++) {
    if (data[index] !== 0 || data[index + 1] !== 0 || data[index + 2] !== 1) continue
    if (start >= 0) units.push(data.subarray(start, trimZeros(data, start, index)))
    start = index + 3
    index += 2
  }
  if (start >= 0 && start < data.length) units.push(data.subarray(start))
  return units
}

// A 4-byte start code leaves its leading zero on the previous unit.
function trimZeros(data: Uint8Array, start: number, end: number) {
  while (end > start && data[end - 1] === 0) end--
  return end
}

export function joinAnnexB(units: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(units.reduce((total, unit) => total + START_CODE.length + unit.length, 0))
  let offset = 0
  for (const unit of units) {
    out.set(START_CODE, offset)
    out.set(unit, offset + START_CODE.length)
    offset += START_CODE.length + unit.length
  }
  return out
}

/** Length-prefixed (avc) NAL units to Annex B. */
export function avcToAnnexB(data: Uint8Array, lengthSize: number): Uint8Array {
  const units: Uint8Array[] = []
  let offset = 0
  while (offset + lengthSize <= data.length) {
    let length = 0
    for (let index = 0; index < lengthSize; index++) length = length * 256 + data[offset + index]!
    offset += lengthSize
    if (length === 0 || offset + length > data.length) break
    units.push(data.subarray(offset, offset + length))
    offset += length
  }
  return joinAnnexB(units)
}

export interface AvcConfig { lengthSize: number; parameterSets: Uint8Array[] }

/** SPS/PPS and the NAL length size from an avcC record (`decoderConfig.description`). */
export function parseAvcC(description: Uint8Array): AvcConfig | null {
  if (description.length < 7 || description[0] !== 1) return null
  const lengthSize = (description[4]! & 3) + 1
  const parameterSets: Uint8Array[] = []
  let offset = 5
  for (const countMask of [0x1f, 0xff]) {
    if (offset >= description.length) return null
    const count = description[offset]! & countMask
    offset += 1
    for (let index = 0; index < count; index++) {
      if (offset + 2 > description.length) return null
      const length = (description[offset]! << 8) | description[offset + 1]!
      offset += 2
      if (offset + length > description.length) return null
      parameterSets.push(description.subarray(offset, offset + length))
      offset += length
    }
  }
  return { lengthSize, parameterSets }
}

const nalType = (unit: Uint8Array) => (unit[0] ?? 0) & 0x1f

/** The SPS and PPS units of an access unit, if it carries both. */
export function parameterSetsOf(units: Uint8Array[]): Uint8Array[] {
  const sets = units.filter(unit => nalType(unit) === 7 || nalType(unit) === 8)
  return sets.some(unit => nalType(unit) === 7) && sets.some(unit => nalType(unit) === 8) ? sets : []
}

/**
 * A keyframe ready to send: the controlled device's decoder may start at any
 * IDR picture, so one without SPS/PPS gets the latest known ones in front.
 */
export function withParameterSets(units: Uint8Array[], parameterSets: Uint8Array[]): Uint8Array[] {
  if (parameterSets.length === 0 || units.some(unit => nalType(unit) === 7)) return units
  return [...parameterSets, ...units]
}
