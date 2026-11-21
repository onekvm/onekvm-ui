import assert from 'node:assert/strict'

import { mapAbsoluteMouse } from '../src/lib/video-fit.ts'
import {
  TouchpadGesture,
  parseTouchInput,
  touchpadHidDelta,
} from '../src/lib/touchpad-gestures.ts'

assert.equal(parseTouchInput(null, true), 'touchpad')
assert.equal(parseTouchInput(null, false), 'direct')
assert.equal(parseTouchInput('direct', true), 'direct')
assert.equal(parseTouchInput('touchpad', false), 'touchpad')
assert.equal(parseTouchInput('bogus', false), 'direct')

// Tap: left click.
let gesture = new TouchpadGesture()
assert.deepEqual(gesture.down(1, 100, 100), [])
assert.equal(gesture.waitingForHold, true)
assert.deepEqual(gesture.move(1, 104, 103), [])
assert.deepEqual(gesture.up(1), [{ kind: 'click', button: 'left' }])
assert.equal(gesture.active, false)

// Slide: moves the cursor, no click.
gesture = new TouchpadGesture()
gesture.down(1, 100, 100)
assert.deepEqual(gesture.move(1, 120, 100), [{ kind: 'move', dx: 20, dy: 0 }])
assert.equal(gesture.waitingForHold, false)
assert.deepEqual(gesture.hold(), [])
assert.deepEqual(gesture.move(1, 125, 90), [{ kind: 'move', dx: 5, dy: -10 }])
assert.deepEqual(gesture.up(1), [])

// Long press: right click on lift.
gesture = new TouchpadGesture()
gesture.down(1, 100, 100)
assert.deepEqual(gesture.hold(), [{ kind: 'held' }])
assert.deepEqual(gesture.move(1, 103, 101), [])
assert.deepEqual(gesture.up(1), [{ kind: 'click', button: 'right' }])

// Long press then slide: drag with the left button.
gesture = new TouchpadGesture()
gesture.down(1, 100, 100)
gesture.hold()
assert.deepEqual(gesture.move(1, 100, 130), [{ kind: 'press' }, { kind: 'move', dx: 0, dy: 30 }])
assert.deepEqual(gesture.down(2, 200, 130), [], 'a second finger does not interrupt a drag')
assert.deepEqual(gesture.move(2, 200, 200), [])
assert.deepEqual(gesture.up(2), [])
assert.deepEqual(gesture.up(1), [{ kind: 'release' }])

// Two fingers: natural scrolling, no click and no cursor movement.
gesture = new TouchpadGesture()
gesture.down(1, 100, 100)
gesture.down(2, 160, 100)
assert.equal(gesture.waitingForHold, false)
assert.deepEqual(gesture.hold(), [])
assert.deepEqual(gesture.move(1, 100, 120), [])
assert.deepEqual(gesture.move(2, 160, 130), [{ kind: 'wheel', delta: 1 }])
assert.deepEqual(gesture.move(1, 100, 20), [{ kind: 'wheel', delta: -1 }, { kind: 'wheel', delta: -1 }])
assert.deepEqual(gesture.up(1), [])
assert.deepEqual(gesture.move(2, 300, 300), [], 'the last finger does not move the cursor')
assert.deepEqual(gesture.up(2), [])
assert.equal(gesture.active, false)
assert.deepEqual(gesture.down(3, 10, 10), [])
assert.deepEqual(gesture.up(3), [{ kind: 'click', button: 'left' }])

// Cancel never clicks, but ends a drag.
gesture = new TouchpadGesture()
gesture.down(1, 100, 100)
assert.deepEqual(gesture.cancel(), [])
gesture.down(1, 100, 100)
gesture.hold()
gesture.move(1, 140, 100)
assert.deepEqual(gesture.cancel(), [{ kind: 'release' }])
assert.equal(gesture.active, false)

// HID deltas match the absolute mapping, including letterboxing and rotation.
const rect = { left: 0, top: 0, width: 400, height: 400 }
for (const rotation of [0, 90, 180, 270] as const) {
  const delta = touchpadHidDelta(40, -20, rect, 1920, 1080, 'stretch', rotation)
  const from = mapAbsoluteMouse(200, 200, rect, 1920, 1080, 'stretch', rotation)
  const to = mapAbsoluteMouse(240, 180, rect, 1920, 1080, 'stretch', rotation)
  assert.ok(Math.abs(delta.x - (to.x - from.x)) <= 1, `x at ${rotation}`)
  assert.ok(Math.abs(delta.y - (to.y - from.y)) <= 1, `y at ${rotation}`)
}
assert.deepEqual(touchpadHidDelta(10, 10, { width: 0, height: 0 }, 1920, 1080, 'stretch'), { x: 0, y: 0 })

console.log('touchpad gesture tests passed')
