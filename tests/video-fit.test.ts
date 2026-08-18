import assert from 'node:assert/strict'

import { mapAbsoluteMouse, parseVideoFit } from '../src/lib/video-fit.ts'

assert.equal(parseVideoFit(null), 'original')
assert.equal(parseVideoFit('stretch'), 'stretch')
assert.equal(parseVideoFit('nope'), 'original')

const contain = { left: 0, top: 0, width: 2000, height: 1000 }
const center = mapAbsoluteMouse(1000, 500, contain, 1920, 1080, 'original')
assert.equal(center.inside, true)
assert.ok(Math.abs(center.x - 0x4000) <= 2)
assert.ok(Math.abs(center.y - 0x4000) <= 2)

const letterbox = mapAbsoluteMouse(10, 10, contain, 1920, 1080, 'original')
assert.equal(letterbox.inside, false)

const stretchCorner = mapAbsoluteMouse(0, 0, contain, 1920, 1080, 'stretch')
assert.equal(stretchCorner.inside, true)
assert.equal(stretchCorner.x, 1)
assert.equal(stretchCorner.y, 1)

const stretchFar = mapAbsoluteMouse(2000, 1000, contain, 1920, 1080, 'stretch')
assert.equal(stretchFar.inside, true)
assert.equal(stretchFar.x, 0x7fff)
assert.equal(stretchFar.y, 0x7fff)

console.log('video-fit tests passed')
