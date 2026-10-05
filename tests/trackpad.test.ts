import assert from 'node:assert/strict'

import {
  TRACKPAD_PANEL_MIN_WIDTH,
  TRACKPAD_STICK_SIZE_DEFAULT,
  TRACKPAD_SURFACE_MIN,
  clampTrackpadHeight,
  clampTrackpadPanelWidth,
  clampTrackpadPercent,
  clampTrackpadStickSize,
  extraFingerScrolls,
  latchPadPressAllowed,
  trackpadHoldMs,
  trackpadTapSlop,
  maxTrackpadSurface,
  padReleaseKind,
  parseTrackpadFlag,
  parseTrackpadHeight,
  parseTrackpadPercent,
  scaledTrackpadDelta,
  trackpadJoystickMetrics,
  trackpadKnobNudge,
  trackpadPinchSize,
  trackpadPlacePercent,
  trackpadPointerMoved,
} from '../src/lib/trackpad.ts'

assert.equal(trackpadPointerMoved(0, 0, 3, 4), false)
assert.equal(trackpadPointerMoved(0, 0, 8, 8), true)
assert.equal(trackpadTapSlop('mouse'), 10)
assert.equal(trackpadTapSlop('touch'), 18)
assert.equal(trackpadHoldMs('mouse'), 220)
assert.equal(trackpadHoldMs('touch'), 280)
assert.equal(trackpadPointerMoved(0, 0, 12, 0, trackpadTapSlop('touch')), false)
assert.equal(trackpadPointerMoved(0, 0, 18, 0, trackpadTapSlop('touch')), true)
assert.equal(extraFingerScrolls(0), true)
assert.equal(extraFingerScrolls(1), false)
assert.equal(latchPadPressAllowed(false, 0, false), true)
assert.equal(latchPadPressAllowed(false, 1, false), false)
assert.equal(latchPadPressAllowed(true, 0, false), false)
assert.equal(latchPadPressAllowed(false, 0, true), false)
assert.equal(padReleaseKind(false, false), 'tap')
assert.equal(padReleaseKind(true, false), 'idle')
assert.equal(padReleaseKind(true, true), 'release-press')
assert.equal(padReleaseKind(false, true), 'release-press')
assert.deepEqual(scaledTrackpadDelta(10, -4), { dx: 13.5, dy: -5.4 })

assert.equal(parseTrackpadHeight(null), null)
assert.equal(parseTrackpadHeight('180'), 180)
assert.equal(clampTrackpadHeight(40, 300), TRACKPAD_SURFACE_MIN)
assert.equal(clampTrackpadHeight(900, 300), 300)
assert.ok(maxTrackpadSurface(800) > TRACKPAD_SURFACE_MIN)

assert.equal(parseTrackpadFlag(null), null)
assert.equal(parseTrackpadFlag('1'), true)
assert.equal(parseTrackpadFlag('0'), false)
assert.equal(clampTrackpadPercent(-4), 0)
assert.equal(clampTrackpadPercent(140), 100)
assert.equal(parseTrackpadPercent('50'), 50)
assert.equal(clampTrackpadStickSize(10), 64)
assert.equal(clampTrackpadStickSize(400), 168)
assert.equal(clampTrackpadPanelWidth(100, 800), TRACKPAD_PANEL_MIN_WIDTH)
assert.equal(clampTrackpadPanelWidth(900, 800), 784)
assert.equal(trackpadJoystickMetrics(TRACKPAD_STICK_SIZE_DEFAULT).knob, 96)
assert.deepEqual(trackpadKnobNudge(40, 0, 10), { x: 10, y: 0 })
assert.deepEqual(trackpadPlacePercent(50, 25, { left: 0, top: 0, width: 100, height: 100 }), { x: 50, y: 25 })
assert.equal(trackpadPinchSize(96, 100, 150), 144)
assert.equal(trackpadPinchSize(96, 0, 150), 96)

console.log('trackpad tests passed')
