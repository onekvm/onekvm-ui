import assert from 'node:assert/strict'
import { KeyboardReportState } from '../src/lib/keyboard-report-state.ts'

let report = { keys: [] as number[], modifiers: 0 }
let reportsSent = 0
const keyboard = new KeyboardReportState((keys, modifiers) => {
  report = { keys, modifiers }
  reportsSent++
})

// A virtual Command can be combined with a physical letter. Releasing the
// letter must leave Command held until it is toggled off or the window closes.
keyboard.set('virtual', [], 8)
keyboard.set('physical', [4])
assert.deepEqual(report, { keys: [4], modifiers: 8 })
keyboard.release('physical')
assert.deepEqual(report, { keys: [], modifiers: 8 })
keyboard.release('virtual')
assert.deepEqual(report, { keys: [], modifiers: 0 })

// Releasing a key or modifier from one source must preserve the other source.
keyboard.set('physical', [4], 1)
keyboard.set('virtual', [4, 5], 1 | 64)
assert.deepEqual(report, { keys: [4, 5], modifiers: 1 | 64 })
keyboard.release('virtual')
assert.deepEqual(report, { keys: [4], modifiers: 1 })

// Temporary chords are released without overwriting either keyboard's state.
keyboard.set('virtual-chord', [76], 1 | 4)
assert.deepEqual(report, { keys: [4, 76], modifiers: 1 | 4 })
keyboard.release('virtual-chord')
assert.deepEqual(report, { keys: [4], modifiers: 1 })
keyboard.set('physical', [])
assert.deepEqual(report, { keys: [], modifiers: 0 })

const keys = [6]
keyboard.set('physical', keys, 128)
keys.push(7)
keyboard.set('virtual', [], 4)
assert.deepEqual(report, { keys: [6], modifiers: 128 | 4 })
keyboard.release('physical')
keyboard.release('virtual')
assert.deepEqual(report, { keys: [], modifiers: 0 })

// Release all must send a release report even when local state is already empty.
const previousReports = reportsSent
keyboard.release('virtual', 'virtual-chord')
assert.equal(reportsSent, previousReports + 1)
assert.deepEqual(report, { keys: [], modifiers: 0 })

console.log('keyboard-report-state tests passed')
