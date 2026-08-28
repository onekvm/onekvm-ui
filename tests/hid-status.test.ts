import assert from 'node:assert/strict'

import { hidHostAlert, hidIndicatorState } from '../src/lib/hid-status.ts'

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

console.log('hid-status tests passed')
