import assert from 'node:assert/strict'

import {
  canvasDeviceSize,
  formatCanvasScale,
  formatCanvasSize,
  mapAbsoluteMouse,
  originalCssSize,
  paintedCssSize,
  parseVideoFit,
  parseVideoRotation,
  rotatedVideoSize,
  unrotateMouseDelta,
  type VideoRotation,
} from '../src/lib/video-fit.ts'

assert.equal(parseVideoFit(null), 'stretch')
assert.equal(parseVideoFit('original'), 'original')
assert.equal(parseVideoFit('nope'), 'stretch')
assert.equal(parseVideoRotation(null), 0)
assert.equal(parseVideoRotation('90'), 90)
assert.equal(parseVideoRotation('180'), 180)
assert.equal(parseVideoRotation('270'), 270)
assert.equal(parseVideoRotation('45'), 0)

// Host top-left stays host top-left after every display rotation. Use a
// portrait stage for quarter turns and check the opposite corner as well.
const rotatedCorners: Array<[VideoRotation, number, number, number, number]> = [
  [0, 0, 0, 1920, 1080],
  [90, 1080, 0, 0, 1920],
  [180, 1920, 1080, 0, 0],
  [270, 0, 1920, 1080, 0],
]
for (const [rotation, x, y, farX, farY] of rotatedCorners) {
  const size = rotatedVideoSize(1920, 1080, rotation)
  const rect = { left: 40, top: 20, ...size }
  for (const fit of ['original', 'stretch'] as const) {
    assert.deepEqual(mapAbsoluteMouse(x + 40, y + 20, rect, 1920, 1080, fit, rotation), {
      inside: true, x: 1, y: 1,
    })
    assert.deepEqual(mapAbsoluteMouse(farX + 40, farY + 20, rect, 1920, 1080, fit, rotation), {
      inside: true, x: 0x7fff, y: 0x7fff,
    })
  }
}
const rotatedLetterbox = { left: 0, top: 0, width: 2000, height: 1000 }
assert.equal(mapAbsoluteMouse(10, 500, rotatedLetterbox, 1920, 1080, 'stretch', 90).inside, false)
assert.ok(Math.abs(mapAbsoluteMouse(1000, 500, rotatedLetterbox, 1920, 1080, 'stretch', 90).x - 0x4000) <= 1)
// A rightward drag in a clockwise-rotated display moves upward on the host.
assert.deepEqual(unrotateMouseDelta(30, 10, 90), { x: 10, y: -30 })
assert.deepEqual(unrotateMouseDelta(30, 10, 180), { x: -30, y: -10 })
assert.deepEqual(unrotateMouseDelta(30, 10, 270), { x: -10, y: 30 })
assert.deepEqual(unrotateMouseDelta(30, 10, 0), { x: 30, y: 10 })
assert.deepEqual(originalCssSize(1080, 1920, 2), { width: 540, height: 960 })

const stage = { left: 0, top: 0, width: 2000, height: 1000 }
const stretchCenter = mapAbsoluteMouse(1000, 500, stage, 1920, 1080, 'stretch')
assert.equal(stretchCenter.inside, true)
assert.ok(Math.abs(stretchCenter.x - 0x4000) <= 2)
assert.ok(Math.abs(stretchCenter.y - 0x4000) <= 2)

const letterbox = mapAbsoluteMouse(10, 10, stage, 1920, 1080, 'stretch')
assert.equal(letterbox.inside, false)

const native = { left: 40, top: 20, width: 1920, height: 1080 }
const originalCorner = mapAbsoluteMouse(40, 20, native, 1920, 1080, 'original')
assert.equal(originalCorner.inside, true)
assert.equal(originalCorner.x, 1)
assert.equal(originalCorner.y, 1)

const originalFar = mapAbsoluteMouse(1960, 1100, native, 1920, 1080, 'original')
assert.equal(originalFar.inside, true)
assert.equal(originalFar.x, 0x7fff)
assert.equal(originalFar.y, 0x7fff)

assert.deepEqual(originalCssSize(1920, 1080, 1), { width: 1920, height: 1080 })
assert.deepEqual(originalCssSize(1920, 1080, 2), { width: 960, height: 540 })
assert.deepEqual(originalCssSize(1920, 1080, 1.5), { width: 1280, height: 720 })
assert.deepEqual(originalCssSize(1920, 1080, 0), { width: 1920, height: 1080 })

const hidpi = { left: 0, top: 0, width: 960, height: 540 }
const hidpiCorner = mapAbsoluteMouse(0, 0, hidpi, 1920, 1080, 'original')
assert.equal(hidpiCorner.x, 1)
assert.equal(hidpiCorner.y, 1)
const hidpiFar = mapAbsoluteMouse(960, 540, hidpi, 1920, 1080, 'original')
assert.equal(hidpiFar.x, 0x7fff)
assert.equal(hidpiFar.y, 0x7fff)

assert.deepEqual(paintedCssSize(960, 540, 1920, 1080, 'original'), { width: 960, height: 540 })
assert.deepEqual(paintedCssSize(1280, 535, 1920, 1080, 'stretch'), {
  width: 535 * (1920 / 1080),
  height: 535,
})
assert.deepEqual(canvasDeviceSize(960, 540, 2), { width: 1920, height: 1080 })
assert.equal(formatCanvasSize(1920, 1080), '1920 × 1080')
assert.equal(formatCanvasSize(0, 0), '-')
assert.equal(formatCanvasScale(1920, 1080, 1920, 1080), undefined)
assert.equal(formatCanvasScale(960, 540, 1920, 1080), '0.50×')
assert.equal(formatCanvasScale(0, 0, 1920, 1080), undefined)

console.log('video-fit tests passed')
