import assert from 'node:assert/strict'

import {
  TOUCHSCREEN_MAX_CONTACTS,
  TouchscreenContacts,
  encodeTouchReport,
  mouseModesFor,
  parseMouseMode,
} from '../src/lib/touchscreen.ts'

// On a touch device Touchscreen takes the place of Relative, and back.
assert.deepEqual(mouseModesFor(true), ['absolute', 'touchscreen'])
assert.deepEqual(mouseModesFor(false), ['absolute', 'relative'])
assert.equal(parseMouseMode('relative', true), 'touchscreen')
assert.equal(parseMouseMode('touchscreen', true), 'touchscreen')
assert.equal(parseMouseMode('touchscreen', false), 'relative')
assert.equal(parseMouseMode('relative', false), 'relative')
assert.equal(parseMouseMode('absolute', true), 'absolute')
assert.equal(parseMouseMode(null, true), 'absolute')
assert.equal(parseMouseMode('other', false), 'absolute')

// One finger: touching while down, lifted once, then nothing to send.
let contacts = new TouchscreenContacts()
assert.equal(contacts.pending, false)
assert.deepEqual(contacts.report(), [])
assert.equal(contacts.down(41, 100, 200), true)
assert.equal(contacts.active, true)
assert.deepEqual(contacts.report(), [{ id: 0, flags: 1, x: 100, y: 200 }])
assert.equal(contacts.move(41, 100, 200), false)
assert.equal(contacts.move(41, 150, 250), true)
assert.deepEqual(contacts.report(), [{ id: 0, flags: 1, x: 150, y: 250 }])
assert.equal(contacts.up(41), true)
assert.equal(contacts.active, false)
assert.equal(contacts.pending, true)
assert.deepEqual(contacts.report(), [{ id: 0, flags: 0, x: 150, y: 250 }])
assert.equal(contacts.pending, false)
assert.deepEqual(contacts.report(), [])
assert.equal(contacts.up(41), false)
assert.equal(contacts.move(41, 1, 1), false)

// Unknown pointers and repeated downs are ignored.
contacts = new TouchscreenContacts()
assert.equal(contacts.move(7, 1, 1), false)
assert.equal(contacts.up(7), false)
assert.equal(contacts.down(7, 1, 1), true)
assert.equal(contacts.down(7, 2, 2), false)
assert.deepEqual(contacts.report(), [{ id: 0, flags: 1, x: 1, y: 1 }])

// Two fingers: every report lists all touching contacts; ids follow lowest free.
contacts = new TouchscreenContacts()
contacts.down(10, 1000, 1000)
contacts.down(11, 2000, 2000)
assert.deepEqual(contacts.report(), [
  { id: 0, flags: 1, x: 1000, y: 1000 },
  { id: 1, flags: 1, x: 2000, y: 2000 },
])
contacts.move(11, 2100, 2100)
assert.deepEqual(contacts.report(), [
  { id: 0, flags: 1, x: 1000, y: 1000 },
  { id: 1, flags: 1, x: 2100, y: 2100 },
])
contacts.up(10)
assert.deepEqual(contacts.report(), [
  { id: 0, flags: 0, x: 1000, y: 1000 },
  { id: 1, flags: 1, x: 2100, y: 2100 },
])
assert.deepEqual(contacts.report(), [{ id: 1, flags: 1, x: 2100, y: 2100 }])
// Id 0 is free again after its lift was reported.
contacts.down(12, 3000, 3000)
assert.deepEqual(contacts.report(), [
  { id: 0, flags: 1, x: 3000, y: 3000 },
  { id: 1, flags: 1, x: 2100, y: 2100 },
])

// A lifted id stays taken until its lift is reported.
contacts = new TouchscreenContacts()
contacts.down(1, 5, 5)
contacts.report()
contacts.up(1)
contacts.down(2, 6, 6)
assert.deepEqual(contacts.report(), [
  { id: 0, flags: 0, x: 5, y: 5 },
  { id: 1, flags: 1, x: 6, y: 6 },
])

// Ten fingers at most; an eleventh is ignored until an id frees up.
contacts = new TouchscreenContacts()
for (let finger = 0; finger < TOUCHSCREEN_MAX_CONTACTS; finger += 1) {
  assert.equal(contacts.down(100 + finger, finger, finger), true)
}
assert.equal(contacts.down(200, 9, 9), false)
assert.equal(contacts.has(200), false)
assert.equal(contacts.move(200, 1, 1), false)
let report = contacts.report()
assert.equal(report.length, TOUCHSCREEN_MAX_CONTACTS)
assert.deepEqual(report.map(contact => contact.id), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
contacts.up(103)
assert.equal(contacts.down(201, 50, 50), false)
report = contacts.report()
assert.deepEqual(report.find(contact => contact.id === 3), { id: 3, flags: 0, x: 3, y: 3 })
assert.equal(contacts.down(201, 50, 50), true)
assert.deepEqual(contacts.report().find(contact => contact.id === 3), { id: 3, flags: 1, x: 50, y: 50 })

// Cancel lifts every contact once.
contacts = new TouchscreenContacts()
assert.equal(contacts.cancel(), false)
contacts.down(1, 10, 10)
contacts.down(2, 20, 20)
contacts.report()
assert.equal(contacts.cancel(), true)
assert.equal(contacts.active, false)
assert.deepEqual(contacts.report(), [
  { id: 0, flags: 0, x: 10, y: 10 },
  { id: 1, flags: 0, x: 20, y: 20 },
])
assert.equal(contacts.cancel(), false)
assert.deepEqual(contacts.report(), [])
assert.equal(contacts.down(3, 30, 30), true)
assert.deepEqual(contacts.report(), [{ id: 0, flags: 1, x: 30, y: 30 }])

// Report bytes: [5, n, n × (id, flags, x LE, y LE)]; never empty.
assert.equal(encodeTouchReport([]), null)
assert.deepEqual(
  [...encodeTouchReport([{ id: 0, flags: 1, x: 0x1234, y: 0x7fff }])!],
  [5, 1, 0, 1, 0x34, 0x12, 0xff, 0x7f],
)
assert.deepEqual(
  [...encodeTouchReport([
    { id: 2, flags: 0, x: -5, y: 40000 },
    { id: 9, flags: 1, x: 16383.6, y: Number.NaN },
  ])!],
  [5, 2, 2, 0, 0, 0, 0xff, 0x7f, 9, 1, 0x00, 0x40, 0, 0],
)
const many = Array.from({ length: 12 }, (_, id) => ({ id, flags: 1, x: id, y: id }))
const capped = encodeTouchReport(many)!
assert.equal(capped[1], TOUCHSCREEN_MAX_CONTACTS)
assert.equal(capped.length, 2 + TOUCHSCREEN_MAX_CONTACTS * 6)

console.log('touchscreen tests passed')
