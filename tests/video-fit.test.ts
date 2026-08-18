import assert from 'node:assert/strict'

import { mapAbsoluteMouse, parseVideoFit } from '../src/lib/video-fit.ts'

assert.equal(parseVideoFit(null), 'stretch')
assert.equal(parseVideoFit('original'), 'original')
assert.equal(parseVideoFit('nope'), 'stretch')

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

console.log('video-fit tests passed')
