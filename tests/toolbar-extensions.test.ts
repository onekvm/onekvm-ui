import assert from 'node:assert/strict'

import { isToolbarSlot, sortToolbarItems, TOOLBAR_SLOTS } from '../src/lib/toolbar-extensions.ts'

assert.deepEqual([...TOOLBAR_SLOTS], ['device-controls', 'actions-start', 'actions-end'])
assert.equal(isToolbarSlot('device-controls'), true)
assert.equal(isToolbarSlot('account'), false)

const sorted = sortToolbarItems([
  { extensionId: 'example-one', order: 20, slot: 'device-controls' },
  { extensionId: 'example-two', order: 10, slot: 'device-controls' },
  { extensionId: 'example-one', order: 10, slot: 'actions-start' },
])
assert.equal(sorted[0].extensionId, 'example-one')
assert.equal(sorted[0].slot, 'actions-start')
assert.equal(sorted[1].extensionId, 'example-two')
assert.equal(sorted[2].extensionId, 'example-one')
assert.equal(sorted[2].order, 20)

console.log('toolbar-extensions tests passed')
