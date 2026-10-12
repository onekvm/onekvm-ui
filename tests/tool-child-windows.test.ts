import assert from 'node:assert/strict'
import { createToolChildWindows, type ToolChildWindow } from '../src/lib/tool-child-windows.ts'

const snapshots: string[][] = []
const windows = createToolChildWindows(ids => snapshots.push(ids))
const calls: string[] = []
function window(name: string, owner?: ToolChildWindow, modal = true): ToolChildWindow {
  return { owner, modal, focus: attention => calls.push(`${name}:focus:${attention}`), close: async () => { calls.push(`${name}:close`) } }
}
const editor = window('editor')
const releaseEditor = windows.register('macro', editor)
const confirm = window('confirm', editor)
const releaseConfirm = windows.register('macro', confirm)
assert.equal(windows.focus('macro', true), true)
assert.deepEqual(calls.splice(0), ['confirm:focus:true'], 'blocked owner routes attention to deepest modal')
assert.equal(windows.index('macro', editor), 0)
assert.equal(windows.index('macro', confirm), 1)
assert.equal(windows.blocked('macro', editor), true)
await windows.close('macro')
assert.deepEqual(calls.splice(0), ['confirm:close', 'editor:close'], 'descendants close before their owner')
assert.deepEqual(snapshots.at(-1), [])
const count = snapshots.length
releaseConfirm(); releaseEditor()
assert.equal(snapshots.length, count, 'late disposal is idempotent')

const modeless = window('inspector', undefined, false)
const releaseModeless = windows.register('macro', modeless)
assert.equal(windows.focus('macro'), false, 'modeless windows allow their owner to activate')
assert.equal(windows.blocked('macro'), false)
windows.activate('macro')
assert.equal(windows.active('macro'), undefined)
windows.activate('macro', modeless)
assert.equal(windows.active('macro'), modeless)
const dialog = window('dialog', modeless)
windows.register('macro', dialog)
assert.equal(windows.blocked('macro'), false, 'modality affects the immediate owner')
assert.equal(windows.blocked('macro', modeless), true)
windows.focus('macro', true, modeless)
assert.deepEqual(calls.splice(0), ['dialog:focus:true'])
await windows.close('macro')
assert.deepEqual(calls.splice(0), ['dialog:close', 'inspector:close'])
releaseModeless()
assert.throws(() => windows.register('macro', dialog), /owner is not registered/)

let finish!: () => void
const slow = window('slow')
slow.close = () => new Promise<void>(resolve => { calls.push('slow:closing'); finish = resolve })
windows.register('macro', editor)
windows.register('macro', slow)
const close = windows.close('macro')
await new Promise(resolve => setImmediate(resolve))
assert.deepEqual(calls.splice(0), ['slow:closing'])
assert.equal(windows.blocked('macro'), true, 'owner stays blocked during child leave')
finish()
await close
assert.deepEqual(calls.splice(0), ['editor:close'], 'owner waits for child transition completion')

const veto = window('veto')
veto.close = async force => force || false
windows.register('macro', editor)
windows.register('macro', veto)
assert.equal(await windows.close('macro'), false)
assert.equal(windows.blocked('macro'), true)
assert.deepEqual(calls, [], 'a veto preserves the owner')
assert.equal(await windows.close('macro', null, true), true)
assert.deepEqual(calls.splice(0), ['editor:close'])
windows.register('macro', editor)
assert.throws(() => windows.register('macro', editor), /already registered/)
windows.clear()
assert.equal(windows.active('macro'), undefined)
assert.equal(windows.focus('macro'), false)
assert.deepEqual(snapshots.at(-1), [])
console.log('tool windows: ownership, modal focus, ordered async close, veto and disposal passed')
