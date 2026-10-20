import assert from 'node:assert/strict'
import { createConsoleWindowStack } from '../src/lib/console-window-stack.ts'

let changes = 0
const stack = createConsoleWindowStack(() => { changes++ })
const performance = stack.register()
const macro = stack.register()
macro.reserve(3) // Parent, editor, and the editor's confirmation dialog.
const files = stack.register()
assert.deepEqual([performance.layer(), macro.layer(), files.layer()], [1000, 1002, 1008])
assert.equal(files.active(), true)

performance.raise()
assert.deepEqual([macro.layer(), files.layer(), performance.layer()], [1000, 1006, 1008])
assert.equal(performance.active(), true)
assert.equal(macro.active(), false)
assert.ok(macro.layer() + 4 < files.layer(), 'owned windows remain below the next group')

macro.raise()
assert.deepEqual([files.layer(), performance.layer(), macro.layer()], [1000, 1002, 1004])
assert.equal(macro.active(), true)
const before = changes
for (let i = 0; i < 1000; i++) macro.raise()
assert.equal(changes, before, 'raising the active group does not change ranks or notify')
assert.equal(macro.layer(), 1004)

macro.reserve(1)
performance.raise()
assert.deepEqual([files.layer(), macro.layer(), performance.layer()], [1000, 1002, 1004])
files.dispose()
assert.deepEqual([macro.layer(), performance.layer()], [1000, 1002], 'closing compacts layers')
const disposed = changes
files.dispose(); files.raise(); files.reserve(2)
assert.equal(changes, disposed, 'late disposal and activation are harmless')
performance.dispose()
assert.equal(macro.active(), true, 'closing the active group reveals the previous group')
assert.throws(() => macro.reserve(0), /Invalid window count/)
assert.throws(() => macro.reserve(1.5), /Invalid window count/)
macro.dispose()
assert.equal(stack.register().layer(), 1000)
console.log('console window stack tests passed')
