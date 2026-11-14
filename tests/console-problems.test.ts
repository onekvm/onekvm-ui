import assert from 'node:assert/strict'

import {
  RECENT_INPUT_MS,
  createProblemTracker,
  recentInput,
  recentPress,
  type ConsoleProblemContext,
} from '../src/lib/console-problems.ts'

let flags = { first: false, second: false, relevant: true }
const problems = [
  { id: 'first', active: () => flags.first, relevant: () => flags.relevant },
  { id: 'second', active: () => flags.second },
]
const context = { status: null, input: { reportAt: 0, pressAt: 0 }, now: 0 } as ConsoleProblemContext
const tracker = createProblemTracker(problems)

assert.equal(tracker.update(context), null)

flags = { first: true, second: true, relevant: false }
assert.equal(tracker.update(context)?.id, 'second', 'an irrelevant problem does not block the next one')

flags.relevant = true
assert.equal(tracker.update(context)?.id, 'second', 'the shown problem stays while it holds')

tracker.dismiss()
assert.equal(tracker.update(context)?.id, 'first')
tracker.dismiss()
assert.equal(tracker.update(context), null, 'closed problems stay closed while they hold')

flags.second = false
assert.equal(tracker.update(context), null)
flags.second = true
assert.equal(tracker.update(context)?.id, 'second', 'a problem that cleared can be shown again')

flags = { first: false, second: false, relevant: true }
assert.equal(tracker.update(context), null, 'the dialog closes when the problem clears')
flags.first = true
assert.equal(tracker.update(context)?.id, 'first')

const now = 100_000
const at = (reportAt: number, pressAt: number) => ({ status: null, input: { reportAt, pressAt }, now }) as ConsoleProblemContext
assert.equal(recentInput(at(now - RECENT_INPUT_MS, 0)), true)
assert.equal(recentInput(at(now - RECENT_INPUT_MS - 1, 0)), false)
assert.equal(recentPress(at(now, now - 1000)), true)
assert.equal(recentPress(at(now, 0)), false)

console.log('console-problems tests passed')
