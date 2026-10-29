import assert from 'node:assert/strict'

import { consoleFullscreenOptions, syncConsoleKeyboardLock, type ConsoleKeyboardLock } from '../src/lib/console-keyboard-lock.ts'

assert.equal(consoleFullscreenOptions().navigationUI, 'hide')
assert.equal(consoleFullscreenOptions().keyboardLock, true)

const calls: string[] = []
const keyboard: ConsoleKeyboardLock = {
  lock: async () => { calls.push('lock') },
  unlock: () => { calls.push('unlock') },
}

await syncConsoleKeyboardLock(false, keyboard)
assert.deepEqual(calls, ['unlock'])
await syncConsoleKeyboardLock(true, keyboard)
assert.deepEqual(calls, ['unlock', 'lock'])
await syncConsoleKeyboardLock(true, undefined)

let releaseLock: (() => void) | undefined
const deferred: ConsoleKeyboardLock = {
  lock: () => new Promise<void>((resolve) => {
    calls.push('lock-wait')
    releaseLock = resolve
  }),
  unlock: () => { calls.push('unlock-after') },
}
const waiting = syncConsoleKeyboardLock(true, deferred)
const queued = syncConsoleKeyboardLock(false, deferred)
await Promise.resolve()
assert.deepEqual(calls.slice(), ['unlock', 'lock', 'lock-wait'])
releaseLock!()
await waiting
await queued
assert.deepEqual(calls.slice(), ['unlock', 'lock', 'lock-wait', 'unlock-after'])

const failing: ConsoleKeyboardLock = {
  lock: async () => { throw new Error('denied') },
  unlock: () => { calls.push('unlock-after-deny') },
}
await assert.rejects(syncConsoleKeyboardLock(true, failing))
await syncConsoleKeyboardLock(false, failing)
assert.equal(calls.at(-1), 'unlock-after-deny')

console.log('console-keyboard-lock tests passed')
