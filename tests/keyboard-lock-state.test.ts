import assert from 'node:assert/strict'
import { KeyboardLockTracker } from '../src/lib/keyboard-lock-state.ts'

const tracker = new KeyboardLockTracker()
const initial = { capsLock: true, numLock: false, scrollLock: false }

// Initial states and duplicate snapshots must not produce notifications.
assert.deepEqual(tracker.update(initial), [])
assert.deepEqual(tracker.update({ ...initial }), [])
assert.deepEqual(tracker.update({ ...initial, capsLock: false }), [{ lock: 'capsLock', on: false }])
assert.deepEqual(tracker.update({ capsLock: false, numLock: true, scrollLock: true }), [
  { lock: 'numLock', on: true },
  { lock: 'scrollLock', on: true },
])

// Losing a known state or reconnecting establishes a fresh silent baseline.
assert.deepEqual(tracker.update(null), [])
assert.deepEqual(tracker.update(initial), [])
assert.deepEqual(tracker.update({ capsLock: undefined, numLock: true, scrollLock: false }), [
  { lock: 'numLock', on: true },
])
assert.deepEqual(tracker.update({ capsLock: false, numLock: true, scrollLock: false }), [])

// Keep a snapshot so a caller mutating its object cannot hide a transition.
const mutable = { capsLock: true }
tracker.update(mutable)
mutable.capsLock = false
assert.deepEqual(tracker.update(mutable), [{ lock: 'capsLock', on: false }])

console.log('keyboard-lock-state tests passed')
