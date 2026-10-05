import assert from 'node:assert/strict'

import {
  STREAM_HISTORY_CAPACITY,
  areaPath,
  bitrateScaleMax,
  formatLatencyUs,
  formatSampleTime,
  fpsScaleMax,
  latencyMs,
  latencyScaleMax,
  latencyStackParts,
  latencyStackBands,
  latencyKnownTotal,
  latencyStackTotal,
  linePath,
  nearestSampleIndex,
  niceCeiling,
  pushStreamSample,
  sampleX,
  sampleY,
  stackedBandPath,
} from '../src/lib/video-stream-chart.ts'

const first = pushStreamSample([], { t: 1, fps: 60, bitrate: 8000 })
assert.equal(first.length, 1)
assert.equal(first[0].fps, 60)

let filled = first
for (let index = 0; index < STREAM_HISTORY_CAPACITY + 5; index++) {
  filled = pushStreamSample(filled, { t: index + 2, fps: 30, bitrate: 1000 })
}
assert.equal(filled.length, STREAM_HISTORY_CAPACITY)
assert.equal(filled[0].t, 7)
assert.equal(pushStreamSample(filled, { t: 99, fps: 1, bitrate: 1 }, 0).length, 0)

assert.equal(niceCeiling(0, 1000), 1000)
assert.equal(niceCeiling(60, 60), 100)
assert.equal(niceCeiling(61, 60), 100)
assert.equal(niceCeiling(1200, 1000), 2000)

assert.equal(fpsScaleMax([], 0), 60)
assert.equal(fpsScaleMax([24], 24), 24)
assert.equal(fpsScaleMax([60], 60), 60)
assert.equal(fpsScaleMax([80], 60), 60)
assert.equal(fpsScaleMax([80], 30), 30)

assert.equal(bitrateScaleMax([]), 1000)
assert.equal(bitrateScaleMax([800]), 1000)
assert.equal(bitrateScaleMax([8000]), 10_000)

assert.equal(sampleX(0, 1, 240), 240)
assert.equal(sampleX(0, 2, 240), 0)
assert.equal(sampleX(1, 2, 240), 240)
assert.equal(sampleX(STREAM_HISTORY_CAPACITY - 1, STREAM_HISTORY_CAPACITY, 240), 240)
assert.equal(sampleY(0, 60, 72), 72)
assert.equal(sampleY(60, 60, 72), 0)
assert.equal(sampleY(120, 60, 72), 0)

const one = linePath([60], 60, 240, 72)
assert.equal(one.startsWith('M0 '), true)
assert.equal(one.includes('L240.00 '), true)

const two = linePath([0, 60], 60, 240, 72)
assert.equal(two.startsWith('M'), true)
assert.equal(two.includes(' L'), true)

const area = areaPath([0, 60], 60, 240, 72)
assert.equal(area.endsWith(' Z'), true)
assert.equal(linePath([], 60, 240, 72), '')
assert.equal(areaPath([], 60, 240, 72), '')

assert.equal(nearestSampleIndex(240, 2, 240), 1)
assert.equal(nearestSampleIndex(0, 0, 240), -1)
assert.equal(formatSampleTime(0), '--:--:--')
assert.match(formatSampleTime(Date.UTC(2026, 0, 1, 7, 8, 9)), /\d{2}:\d{2}:\d{2}/)

assert.equal(latencyMs(9106), 9.106)
assert.equal(latencyMs(0), 0)
assert.equal(formatLatencyUs(0), '-')
assert.equal(formatLatencyUs(9106), '9.1 ms')
assert.equal(formatLatencyUs(16000), '16 ms')

const latencySample = {
  t: 1, capture: 16.7, encode: 9.1, ice: 2, jitter: 4, decode: 5, present: 8,
}
assert.equal(Math.round(latencyKnownTotal(latencySample) * 10) / 10, 33.8)
assert.equal(Math.round(latencyStackTotal(latencySample) * 10) / 10, 33.8)
const parts = latencyStackParts(latencySample)
assert.equal(parts.capture, 16.7)
assert.equal(parts.encode, 9.1)
assert.equal(parts.present, 0)
assert.equal(Math.round((parts.jitter + parts.decode) * 10) / 10, 8)
const oversubscribed = latencyStackParts({ ...latencySample, jitter: 40, decode: 20, present: 30 })
assert.equal(oversubscribed.present, 0)
assert.equal(Math.round((oversubscribed.jitter + oversubscribed.decode) * 10) / 10, 30)
assert.equal(
  latencyKnownTotal({ t: 1, capture: 0.02, encode: 1.7, ice: 0, jitter: 328, decode: 0, present: 0 }),
  329.72,
)
assert.equal(latencyScaleMax([latencySample]), 50)

const band = stackedBandPath([10, 20], [0, 0], 20, 240, 72)
assert.equal(band.endsWith(' Z'), true)
assert.equal(stackedBandPath([], [], 20, 240, 72), '')
const oneBand = stackedBandPath([10], [0], 20, 240, 72)
assert.equal(oneBand.startsWith('M0 '), true)
assert.equal(oneBand.includes(' L0 '), true)
assert.equal(oneBand.includes('L240.00'), true)

const bands = latencyStackBands([latencySample], 50, 240, 72)
assert.equal(Boolean(bands.capture && bands.encode && bands.present), true)

console.log('video-stream-chart tests passed')
