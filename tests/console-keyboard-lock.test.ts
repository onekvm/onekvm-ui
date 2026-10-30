import assert from 'node:assert/strict'

import { consoleFullscreenOptions, consoleKeyboardLockRetryDelaysMs, scheduleConsoleKeyboardLock, syncConsoleKeyboardLock, type ConsoleKeyboardLock } from '../src/lib/console-keyboard-lock.ts'

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

const scheduled: Array<() => void> = []
let fullscreen = true
const stop = scheduleConsoleKeyboardLock(
  () => fullscreen,
  keyboard,
  (callback) => {
    scheduled.push(callback)
    return () => {
      const index = scheduled.indexOf(callback)
      if (index >= 0) scheduled.splice(index, 1)
    }
  },
)
assert.equal(scheduled.length, consoleKeyboardLockRetryDelaysMs.length)
const flush = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve()
}
scheduled[0]!()
await flush()
assert.equal(calls.at(-1), 'lock')
fullscreen = false
const lengthBeforeSkippedRetry = calls.length
scheduled[1]!()
await flush()
assert.equal(calls.length, lengthBeforeSkippedRetry)
stop()
await flush()
assert.equal(calls.at(-1), 'unlock')
assert.equal(scheduled.length, 0)

console.log('console-keyboard-lock tests passed')
