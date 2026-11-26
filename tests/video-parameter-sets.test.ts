import assert from 'node:assert/strict'

import { videoParameterSets } from '../src/lib/video-parameter-sets.ts'

const annexB = (...units: number[][]) => Uint8Array.from(units.flatMap((unit, index) => [...(index % 2 ? [0, 0, 1] : [0, 0, 0, 1]), ...unit]))

// H.264: AUD, SPS, PPS, SEI, IDR slice.
const sps1080 = [0x67, 0x64, 0x00, 0x28, 0xac, 0x2b]
const sps720 = [0x67, 0x64, 0x00, 0x1f, 0xac, 0x2b]
const pps = [0x68, 0xee, 0x3c, 0x80]
const idr = [0x65, 0x88, 0x84, 0x00, 0x00, 0x03, 0x01]
const h264 = (sps: number[], slice = idr) => annexB([0x09, 0xf0], sps, pps, [0x06, 0x05, 0x01], slice)

const first = videoParameterSets('h264', h264(sps1080))
assert.notEqual(first, '', 'SPS and PPS are found')
assert.equal(videoParameterSets('h264', h264(sps1080, [0x65, 0x99, 0x00, 0x00, 0x00, 0x01, 0x67])), first, 'Slice contents do not count')
assert.notEqual(videoParameterSets('h264', h264(sps720)), first, 'A new SPS is a change')
assert.notEqual(videoParameterSets('h264', annexB(sps1080, [0x68, 0xee, 0x3c, 0x81], idr)), videoParameterSets('h264', annexB(sps1080, pps, idr)), 'A new PPS is a change')
assert.equal(videoParameterSets('h264', annexB([0x41, 0x9a, 0x00])), '', 'A P frame has no parameter sets')
assert.equal(videoParameterSets('h264', new Uint8Array(4)), '')
assert.equal(videoParameterSets('h264', Uint8Array.of(0, 0, 1)), '', 'A truncated start code is ignored')

// H.265: VPS, SPS, PPS, IDR_W_RADL.
const vps = [0x40, 0x01, 0x0c, 0x01]
const hevcSps = (level: number) => [0x42, 0x01, 0x01, 0x01, level]
const hevcPps = [0x44, 0x01, 0xc1, 0x72]
const hevcIdr = [0x26, 0x01, 0xaf, 0x00]
const hevc = videoParameterSets('h265', annexB(vps, hevcSps(0x7b), hevcPps, hevcIdr))
assert.notEqual(hevc, '')
assert.equal(videoParameterSets('h265', annexB(vps, hevcSps(0x7b), hevcPps, [0x26, 0x01, 0x00, 0x00])), hevc)
assert.notEqual(videoParameterSets('h265', annexB(vps, hevcSps(0x5d), hevcPps, hevcIdr)), hevc)
assert.equal(videoParameterSets('h265', annexB([0x02, 0x01, 0xd0])), '', 'A trailing picture has no parameter sets')

console.log('video-parameter-sets tests passed')
