import assert from 'node:assert/strict'

import {
  fromStandardGamepad,
  gamepadReportsEqual,
  hatFromDpad,
  idleGamepadReport,
} from '../src/lib/gamepad.ts'

assert.equal(hatFromDpad(true, false, false, false), 0)
assert.equal(hatFromDpad(true, false, false, true), 1)
assert.equal(hatFromDpad(false, false, false, true), 2)
assert.equal(hatFromDpad(false, true, false, true), 3)
assert.equal(hatFromDpad(false, true, false, false), 4)
assert.equal(hatFromDpad(false, true, true, false), 5)
assert.equal(hatFromDpad(false, false, true, false), 6)
assert.equal(hatFromDpad(true, false, true, false), 7)
assert.equal(hatFromDpad(false, false, false, false), 8)
assert.equal(hatFromDpad(true, true, false, false), 8)

const idle = idleGamepadReport()
assert.equal(idle.hat, 8)
assert.equal(idle.lx, 128)
assert.equal(idle.buttons, 0)
assert.equal(gamepadReportsEqual(idle, idleGamepadReport()), true)

const pad = {
  buttons: Array.from({ length: 17 }, (_, index) => ({
    pressed: [0, 3, 9, 12, 16].includes(index),
    value: index === 6 ? 0.5 : index === 7 ? 1 : 0,
  })),
  axes: [-1, 1, 0, 0.5],
} as unknown as Gamepad

const report = fromStandardGamepad(pad)
assert.equal(report.buttons, (1 << 0) | (1 << 3) | (1 << 9) | (1 << 10))
assert.equal(report.hat, 0)
assert.equal(report.lx, 0)
assert.equal(report.ly, 255)
assert.equal(report.rx, 128)
assert.equal(report.ry, 191)
assert.equal(report.lt, 128)
assert.equal(report.rt, 255)
assert.equal(gamepadReportsEqual(report, idle), false)

console.log('gamepad tests passed')
