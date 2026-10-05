import assert from 'node:assert/strict'

import { consolePointerCursor, storedHideLocalCursor } from '../src/lib/console-pointer.ts'

assert.equal(storedHideLocalCursor(null), true)
assert.equal(storedHideLocalCursor('true'), true)
assert.equal(storedHideLocalCursor('false'), false)

assert.equal(consolePointerCursor(false, false, false), undefined)
assert.equal(consolePointerCursor(false, true, false), 'crosshair')
assert.equal(consolePointerCursor(true, false, false, true), 'none')
assert.equal(consolePointerCursor(true, true, false, true), 'none')
assert.equal(consolePointerCursor(true, false, false, false), undefined)
assert.equal(consolePointerCursor(true, true, false, false), undefined)
assert.equal(consolePointerCursor(true, true, true, true), undefined)
assert.equal(consolePointerCursor(false, true, true), undefined)

console.log('mouse cursor tests passed')
