import assert from 'node:assert/strict'

import {
  clampContentCursor,
  clampPan,
  clampZoom,
  containFittedSize,
  contentPointFromScreen,
  cursorToScreen,
  distance,
  midpoint,
  nudgeContentCursor,
  oneToOneZoom,
  panBy,
  viewForCursor,
  viewOverflows,
  viewportTransform,
  zoomAround,
} from '../src/lib/viewport-zoom.ts'

assert.equal(clampZoom(0.2), 1)
assert.equal(clampZoom(8), 4)
assert.equal(clampZoom(2), 2)

const mid = midpoint(0, 0, 100, 40)
assert.equal(mid.x, 50)
assert.equal(mid.y, 20)
assert.equal(distance(0, 0, 3, 4), 5)

const identity = zoomAround({ scale: 1, x: 0, y: 0 }, 2, 100, 50)
assert.equal(identity.scale, 2)
assert.equal(identity.x, -100)
assert.equal(identity.y, -50)

const clamped = clampPan({ scale: 2, x: 40, y: 10 }, 200, 100)
assert.equal(clamped.x, 0)
assert.equal(clamped.y, 0)

const panned = panBy({ scale: 2, x: 0, y: 0 }, -50, -20, 200, 100)
assert.equal(panned.x, -50)
assert.equal(panned.y, -20)

const reset = clampPan({ scale: 1, x: -20, y: -10 }, 200, 100)
assert.equal(reset.scale, 1)
assert.equal(reset.x, 0)
assert.equal(reset.y, 0)

assert.equal(viewportTransform({ scale: 1, x: 0, y: 0 }), undefined)
assert.equal(viewportTransform({ scale: 2, x: -10, y: -4 }), 'translate3d(-10px, -4px, 0) scale(2)')

assert.equal(containFittedSize(1920, 1080, 390, 500).width, 390)
assert.equal(oneToOneZoom(1920, 1080, 390, 500), 4)
assert.equal(viewOverflows(1), false)
assert.equal(viewOverflows(2), true)

const centered = viewForCursor({ x: 100, y: 50 }, 2, 200, 100)
assert.equal(centered.x, -100)
assert.equal(centered.y, -50)

const edge = viewForCursor({ x: 0, y: 0 }, 2, 200, 100)
assert.equal(edge.x, 0)
assert.equal(edge.y, 0)

const nudged = nudgeContentCursor({ x: 100, y: 50 }, 20, -10, 2, 200, 100)
assert.equal(nudged.x, 110)
assert.equal(nudged.y, 45)

assert.deepEqual(clampContentCursor({ x: -4, y: 80 }, 200, 100), { x: 0, y: 80 })
assert.deepEqual(contentPointFromScreen({ scale: 2, x: -100, y: -50 }, 100, 50), { x: 100, y: 50 })
assert.deepEqual(cursorToScreen({ scale: 2, x: -100, y: -50 }, { x: 100, y: 50 }), { x: 100, y: 50 })

console.log('viewport-zoom tests passed')
