import assert from 'node:assert/strict'

import {
  hidHostAlert,
  hidIndicatorState,
  hidReportIsPress,
  usbInputDisconnected,
  usbInputStalled,
} from '../src/lib/hid-status.ts'

assert.equal(hidIndicatorState(null), 'waiting')
assert.equal(hidIndicatorState(undefined), 'waiting')
assert.equal(hidIndicatorState({ available: false, connected: false }), 'error')
assert.equal(hidIndicatorState({ available: false, connected: true }), 'error')
assert.equal(hidIndicatorState({ available: true, connected: true }), 'ready')
assert.equal(hidIndicatorState({ available: true, connected: false }), 'error')

assert.equal(hidHostAlert(null), null)
assert.equal(hidHostAlert({ available: true, connected: true }), null)
assert.equal(hidHostAlert({ available: true, connected: false }), 'disconnected')
assert.equal(hidHostAlert({ available: false, connected: false }), 'unavailable')

const connected = { available: true, connected: true }
assert.equal(usbInputDisconnected(null), false)
assert.equal(usbInputDisconnected({ available: false, connected: false }), false)
assert.equal(usbInputDisconnected({ available: true, connected: false }), true)
assert.equal(usbInputDisconnected(connected), false)
assert.equal(usbInputStalled(connected), false)
assert.equal(usbInputStalled({ ...connected, write_stalled: true }), true)
assert.equal(usbInputStalled({ available: true, connected: false, write_stalled: true }), false)
assert.equal(usbInputStalled({ available: false, connected: true, write_stalled: true }), false)

assert.equal(hidReportIsPress(Uint8Array.of(1, 0, 0, 4, 0, 0, 0, 0)), true)
assert.equal(hidReportIsPress(Uint8Array.of(1, 2, 0, 0, 0, 0, 0, 0)), true)
assert.equal(hidReportIsPress(new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0])), false)
assert.equal(hidReportIsPress(Uint8Array.of(2, 0, 5, 5, 0)), false)
assert.equal(hidReportIsPress(Uint8Array.of(2, 0, 0, 0, 1)), true)
assert.equal(hidReportIsPress(Uint8Array.of(3, 1, 0, 0, 0, 0)), true)
assert.equal(hidReportIsPress(Uint8Array.of(3, 0, 1, 2, 3, 4)), false)
assert.equal(hidReportIsPress(Uint8Array.of(4, 0, 1, 8, 0, 0, 0, 0, 0, 0)), true)
assert.equal(hidReportIsPress(Uint8Array.of(4, 0, 0, 8, 128, 128, 128, 128, 0, 0)), false)

console.log('hid-status tests passed')
