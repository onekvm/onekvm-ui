import assert from 'node:assert/strict'
import { createWindowTasks, type WindowTask } from '../src/lib/window-tasks.ts'

let tasks: WindowTask[] = []
const registry = createWindowTasks(next => { tasks = next })
const first = registry.register(), second = registry.register()
let restored = ''
first.update({ title: 'OCR', restore: () => { restored = 'OCR' } })
second.update({ title: 'Settings', restore: () => { restored = 'Settings' } })
first.update({ title: '中文识别', progress: 50, restore: () => { restored = 'OCR' } })
assert.deepEqual(tasks.map(task => task.id), [first.id, second.id], 'updates preserve minimize order')
tasks[1]!.restore()
assert.equal(restored, 'Settings')
second.update(null)
assert.equal(tasks.length, 1, 'restoring removes only that minimized window')
first.dispose()
first.update({ title: 'stale', restore() {} })
assert.equal(tasks.length, 0, 'closing/unmounting clears taskbar entries and ignores stale updates')
second.dispose()
console.log('window taskbar ordering, restore callbacks and lifecycle cleanup: passed')
