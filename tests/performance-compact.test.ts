import assert from 'node:assert/strict'

import {
  formatCompactBitrate,
  formatCompactResolution,
  performanceAudioVisible,
} from '../src/lib/performance-compact.ts'
import { compactChartPaths } from '../src/lib/video-stream-chart.ts'

assert.equal(formatCompactBitrate(0), '0')
assert.equal(formatCompactBitrate(96), '96k')
assert.equal(formatCompactBitrate(4200), '4.2M')
assert.equal(formatCompactBitrate(18500), '19M')
assert.equal(formatCompactResolution(0, 0), '—')
assert.equal(formatCompactResolution(1920, 1080), '1920×1080')

const paths = compactChartPaths([
  { fps: 30, bitrate: 1000 },
  { fps: 60, bitrate: 4000 },
], 60, 72, 20)
assert.ok(paths.fps.includes('M'))
assert.ok(paths.bitrate.includes('L'))
assert.ok(paths.fpsArea.endsWith('Z'))

assert.equal(performanceAudioVisible(false, true), false)
assert.equal(performanceAudioVisible(false, false), false)
assert.equal(performanceAudioVisible(true, false), false)
assert.equal(performanceAudioVisible(true, true), true)

console.log('performance-compact tests passed')
