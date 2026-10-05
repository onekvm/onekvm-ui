import assert from 'node:assert/strict'

import { consumeConsoleBack } from '../src/lib/history-lock.ts'

const closed = {
  trackpad: false,
  account: false,
  keyboard: false,
  shortcuts: false,
  toolbar: false,
}

assert.deepEqual(consumeConsoleBack(true, { ...closed, trackpad: true }), { type: 'navigate-settings' })
assert.deepEqual(consumeConsoleBack(false, { ...closed, trackpad: true }), { type: 'close', overlay: 'trackpad' })
assert.deepEqual(consumeConsoleBack(false, { ...closed, toolbar: true }), { type: 'close', overlay: 'toolbar' })
assert.deepEqual(consumeConsoleBack(false, closed), { type: 'stay' })

console.log('history-lock tests passed')
