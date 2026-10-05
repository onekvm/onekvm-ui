import assert from 'node:assert/strict'

import {
  phoneUiActive,
  shouldAllowBrowserPinch,
  shouldPreventDoubleTapZoom,
} from '../src/lib/mobile-viewport.ts'

assert.equal(shouldPreventDoubleTapZoom({ t: 100, x: 10, y: 10 }, null, false), false)
assert.equal(shouldPreventDoubleTapZoom({ t: 200, x: 12, y: 11 }, { t: 100, x: 10, y: 10 }, false), true)
assert.equal(shouldPreventDoubleTapZoom({ t: 200, x: 12, y: 11 }, { t: 100, x: 10, y: 10 }, true), false)
assert.equal(shouldPreventDoubleTapZoom({ t: 500, x: 12, y: 11 }, { t: 100, x: 10, y: 10 }, false), false)
assert.equal(shouldPreventDoubleTapZoom({ t: 200, x: 80, y: 10 }, { t: 100, x: 10, y: 10 }, false), false)

const zoomable = { closest: (selector: string) => selector === '.console-stage.is-zoomable' ? {} : null }
const other = { closest: () => null }
assert.equal(shouldAllowBrowserPinch(zoomable), true)
assert.equal(shouldAllowBrowserPinch(other), false)
assert.equal(shouldAllowBrowserPinch(null), false)

assert.equal(phoneUiActive(390, 844), true)
assert.equal(phoneUiActive(844, 390), true)
assert.equal(phoneUiActive(667, 375), true)
assert.equal(phoneUiActive(760, 360), true)
assert.equal(phoneUiActive(761, 761), false)
assert.equal(phoneUiActive(1100, 500), true)
assert.equal(phoneUiActive(1101, 500), false)
assert.equal(phoneUiActive(900, 501), false)
assert.equal(phoneUiActive(1024, 768), false)
assert.equal(phoneUiActive(1920, 1080), false)

console.log('mobile-viewport tests passed')
