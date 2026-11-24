import assert from 'node:assert/strict'

import {
  annexBUnits,
  avcToAnnexB,
  CAMERA_HEADER_SIZE,
  cameraBitrate,
  containRect,
  coverCrop,
  encodeCameraFrame,
  joinAnnexB,
  parameterSetsOf,
  parseAvcC,
  withParameterSets,
} from '../src/lib/camera-frame.ts'

const unit = new Uint8Array([0, 0, 0, 1, 0x65, 0x88, 0x84])
const frame = encodeCameraFrame(258n, 1280, 720, unit)
assert.equal(frame.length, CAMERA_HEADER_SIZE + unit.length)
assert.deepEqual([...frame.subarray(0, 8)], [0x4f, 0x4b, 0x43, 0x46, 1, 1, 0, 0])
const view = new DataView(frame.buffer)
assert.equal(view.getBigUint64(8), 258n)
assert.equal(view.getUint16(16), 1280)
assert.equal(view.getUint16(18), 720)
assert.equal(view.getUint32(20), unit.length)
assert.deepEqual([...frame.subarray(CAMERA_HEADER_SIZE)], [...unit])

// A 16:9 camera fills a 4:3 request by trimming the sides.
assert.deepEqual(coverCrop(1280, 720, 640, 480), { x: 160, y: 0, width: 960, height: 720 })
// A 4:3 camera fills a 16:9 request by trimming top and bottom.
assert.deepEqual(coverCrop(640, 480, 1280, 720), { x: 0, y: 60, width: 640, height: 360 })
assert.deepEqual(coverCrop(1920, 1080, 1280, 720), { x: 0, y: 0, width: 1920, height: 1080 })

// A screen or file keeps all of its picture, with bars where shapes differ.
assert.deepEqual(containRect(1920, 1080, 640, 480), { x: 0, y: 60, width: 640, height: 360 })
assert.deepEqual(containRect(1080, 1920, 1280, 720), { x: 438, y: 0, width: 405, height: 720 })
assert.deepEqual(containRect(2560, 1440, 1280, 720), { x: 0, y: 0, width: 1280, height: 720 })

assert.equal(cameraBitrate(1280, 720, 30, 16_192_000), 2_764_800)
assert.equal(cameraBitrate(1920, 1080, 30, 4_000_000), 4_000_000, 'the USB link caps the bitrate')
assert.equal(cameraBitrate(640, 360, 15, 16_192_000), 345_600)
assert.equal(cameraBitrate(320, 240, 15, 16_192_000), 250_000)
assert.equal(cameraBitrate(1280, 720, 30, 16_192_000, 0.5), 1_382_400)

const sps = new Uint8Array([0x67, 0x42, 0xe0, 0x28])
const pps = new Uint8Array([0x68, 0xce, 0x38, 0x80])
const idr = new Uint8Array([0x65, 0x88, 0x00, 0x00, 0x03, 0x01])
const slice = new Uint8Array([0x41, 0x9a, 0x00])

// 3- and 4-byte start codes; trailing zeros of a 4-byte code are not data.
const mixed = new Uint8Array([0, 0, 0, 1, ...sps, 0, 0, 1, ...pps, 0, 0, 0, 1, ...idr])
assert.deepEqual(annexBUnits(mixed).map(nal => [...nal]), [[...sps], [...pps], [...idr]])
assert.deepEqual([...joinAnnexB([sps, idr])], [0, 0, 0, 1, ...sps, 0, 0, 0, 1, ...idr])
assert.deepEqual(annexBUnits(new Uint8Array([1, 2, 3])), [])

// Length-prefixed chunks from an encoder without Annex B output.
const avc = new Uint8Array([0, 0, 0, 4, ...sps, 0, 0, 0, 6, ...idr])
assert.deepEqual([...avcToAnnexB(avc, 4)], [...joinAnnexB([sps, idr])])
assert.deepEqual([...avcToAnnexB(new Uint8Array([0, 6, ...idr]), 2)], [...joinAnnexB([idr])])
assert.deepEqual([...avcToAnnexB(new Uint8Array([0, 0, 0, 9, 1]), 4)], [], 'a truncated unit is dropped')

const avcC = new Uint8Array([1, 0x42, 0xe0, 0x28, 0xff, 0xe1, 0, 4, ...sps, 1, 0, 4, ...pps])
const config = parseAvcC(avcC)
assert.equal(config?.lengthSize, 4)
assert.deepEqual(config?.parameterSets.map(nal => [...nal]), [[...sps], [...pps]])
assert.equal(parseAvcC(avcC.subarray(0, 10)), null)
assert.equal(parseAvcC(new Uint8Array([0, 0, 0, 0, 0, 0, 0])), null)

assert.deepEqual(parameterSetsOf([sps, pps, idr]), [sps, pps])
assert.deepEqual(parameterSetsOf([sps, idr]), [], 'both SPS and PPS are needed')
assert.deepEqual(withParameterSets([idr], [sps, pps]), [sps, pps, idr])
assert.deepEqual(withParameterSets([sps, pps, idr], [sps, pps]), [sps, pps, idr])
assert.deepEqual(withParameterSets([slice], []), [slice])
