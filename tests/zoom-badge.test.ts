import assert from 'node:assert/strict'

import { ZOOM_BADGE_HIDE_MS, zoomBadgeVisible } from '../src/lib/zoom-badge.ts'

assert.equal(zoomBadgeVisible(1, false, 0), false)
assert.equal(zoomBadgeVisible(1.02, true, 8000), true)
assert.equal(zoomBadgeVisible(2, false, 0), true)
assert.equal(zoomBadgeVisible(2, false, ZOOM_BADGE_HIDE_MS - 1), true)
assert.equal(zoomBadgeVisible(2, false, ZOOM_BADGE_HIDE_MS), false)

console.log('zoom-badge tests passed')
