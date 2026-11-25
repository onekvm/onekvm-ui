import assert from 'node:assert/strict'

import {
  RECENT_INPUT_MS,
  createProblemTracker,
  recentInput,
  recentKeyboard,
  recentMouse,
  recentPress,
  type ConsoleProblemContext,
} from '../src/lib/console-problems.ts'
import { problemAnchorPoint } from '../src/lib/console-problem-anchor.ts'

let flags = { first: false, second: false, relevant: true }
const problems = [
  { id: 'first', active: () => flags.first, relevant: () => flags.relevant },
  { id: 'second', active: () => flags.second },
]
const context = { status: null, input: { reportAt: 0, pressAt: 0, keyboardAt: 0, mouseAt: 0 }, now: 0 } as ConsoleProblemContext
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
const at = (reportAt: number, pressAt: number, keyboardAt = 0, mouseAt = 0) =>
  ({ status: null, input: { reportAt, pressAt, keyboardAt, mouseAt }, now }) as ConsoleProblemContext
assert.equal(recentInput(at(now - RECENT_INPUT_MS, 0)), true)
assert.equal(recentInput(at(now - RECENT_INPUT_MS - 1, 0)), false)
assert.equal(recentPress(at(now, now - 1000)), true)
assert.equal(recentPress(at(now, 0)), false)
assert.equal(recentKeyboard(at(now, 0, now - 1000, 0)), true)
assert.equal(recentKeyboard(at(now, 0, 0, now)), false, 'mouse motion does not count as typing')
assert.equal(recentMouse(at(now, 0, 0, now - RECENT_INPUT_MS)), true)
assert.equal(recentMouse(at(now, 0, now, 0)), false, 'typing does not count as mouse input')

// The popover starts where the button's own popover would.
const button = { left: 100, top: 10, right: 132, bottom: 42 }
assert.deepEqual(problemAnchorPoint(button, 'bottom-end'), { x: 132, y: 42 })
assert.deepEqual(problemAnchorPoint(button, 'bottom-start'), { x: 100, y: 42 })
assert.deepEqual(problemAnchorPoint(button, 'top-end'), { x: 132, y: 10 })
assert.deepEqual(problemAnchorPoint(button, 'right-start'), { x: 132, y: 10 })
assert.deepEqual(problemAnchorPoint(button, 'left-start'), { x: 100, y: 10 })

console.log('console-problems tests passed')
