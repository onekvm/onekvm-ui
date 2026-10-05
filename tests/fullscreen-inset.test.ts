import assert from 'node:assert/strict'

import { fullscreenTopInsetPx, IPAD_STATUS_BAR_PX, isIpadLikeUserAgent } from '../src/lib/fullscreen-inset.ts'

assert.equal(isIpadLikeUserAgent('Mozilla/5.0 (iPad; CPU OS 17_0)', 'iPad', 5), true)
assert.equal(isIpadLikeUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 5), true)
assert.equal(isIpadLikeUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 0), false)
assert.equal(isIpadLikeUserAgent('Mozilla/5.0 (Linux; Android 14)', 'Linux armv8l', 5), false)

assert.equal(fullscreenTopInsetPx({ fullscreen: false, safeTop: 47, visualOffsetTop: 0, ipad: true }), 0)
assert.equal(fullscreenTopInsetPx({ fullscreen: true, safeTop: 47, visualOffsetTop: 0, ipad: true }), 47)
assert.equal(fullscreenTopInsetPx({ fullscreen: true, safeTop: 0, visualOffsetTop: 12, ipad: true }), 12)
assert.equal(fullscreenTopInsetPx({ fullscreen: true, safeTop: 0, visualOffsetTop: 0, ipad: true }), IPAD_STATUS_BAR_PX)
assert.equal(fullscreenTopInsetPx({ fullscreen: true, safeTop: 0, visualOffsetTop: 0, ipad: false }), 0)

console.log('fullscreen-inset tests passed')
