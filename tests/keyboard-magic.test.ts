import assert from 'node:assert/strict'

import { MagicComposer, mapKeyboardCode, routeKeyboardKey } from '../src/lib/keyboard-magic.ts'

const plain = { rightControlAsMeta: false, swapCommandCtrl: false }
const swapped = { rightControlAsMeta: false, swapCommandCtrl: true }
const both = { rightControlAsMeta: true, swapCommandCtrl: true }

assert.equal(mapKeyboardCode('ControlLeft', swapped), 'MetaLeft')
assert.equal(mapKeyboardCode('MetaRight', swapped), 'ControlRight')
assert.equal(mapKeyboardCode('ControlLeft', plain), 'ControlLeft')
assert.equal(mapKeyboardCode('ControlRight', both), 'MetaLeft')
assert.equal(mapKeyboardCode('ControlLeft', both), 'MetaLeft')
assert.equal(mapKeyboardCode('AltLeft', swapped), 'AltLeft')

let now = 0
const composer = new MagicComposer(() => now)
function press(physical: string, down: boolean, repeat = false, options = plain) {
  return routeKeyboardKey(composer, { physical, down, repeat, magicKey: 'ControlRight', ...options })
}
function record(physical: string, down: boolean, at: number, repeat = false) {
  now = at
  const routed = press(physical, down, repeat)
  assert.equal(routed.kind, 'magic')
  if (routed.kind !== 'magic') throw new Error('Expected Magic Key to consume the input')
  assert.deepEqual(routed.effect.frames, [], 'Recording must not send anything to the remote host')
  return routed.effect
}

// Capture repeated normal keys and their intervals after tapping Magic once.
record('ControlRight', true, 0)
record('ControlRight', false, 50)
record('AltLeft', true, 100)
record('AltLeft', false, 150)
record('Tab', true, 200)
record('Tab', false, 250)
record('Tab', true, 900)
record('Tab', false, 950)
record('Tab', true, 2450)
record('Tab', false, 2500)
assert.deepEqual(composer.hint().sequence, Array.from({ length: 3 }, () => ['AltLeft', 'Tab']))
const confirmed = press('ControlRight', true)
assert.equal(confirmed.kind, 'magic')
if (confirmed.kind === 'magic') {
  assert.deepEqual(confirmed.effect.frames, [
    { codes: ['AltLeft'], delayMS: 0 },
    { codes: ['AltLeft', 'Tab'], delayMS: 100 },
    { codes: ['AltLeft'], delayMS: 50 },
    { codes: ['AltLeft', 'Tab'], delayMS: 650 },
    { codes: ['AltLeft'], delayMS: 50 },
    { codes: ['AltLeft', 'Tab'], delayMS: 1500 },
    { codes: ['AltLeft'], delayMS: 50 },
    { codes: [], delayMS: 20 },
  ])
  assert.equal(confirmed.effect.hint.active, false)
}
assert.equal(composer.started, false)
press('ControlRight', false)
assert.equal(press('Tab', true).kind, 'passthrough', 'Sending once must exit composition')

// Starting a new composition must not retain the old sequence. Confirming
// before releasing a captured key must still produce a final release report.
record('ControlRight', true, 3000)
record('ControlRight', false, 3050)
record('KeyA', true, 3100)
record('KeyA', true, 3150, true)
record('KeyA', true, 3160) // Duplicate keydown without a keyup is not another tap.
const held = press('ControlRight', true)
if (held.kind === 'magic') {
  assert.deepEqual(held.effect.frames, [
    { codes: ['KeyA'], delayMS: 0 },
    { codes: [], delayMS: 100 },
  ])
}

// Magic autorepeat cannot confirm, and Esc cancels without sending a shortcut.
record('ControlRight', true, 4000)
record('MetaLeft', true, 4100)
record('ControlRight', true, 4200, true)
assert.equal(composer.started, true)
record('Escape', true, 4300)
assert.equal(composer.started, false)
assert.equal(press('KeyA', true).kind, 'passthrough')

// Empty compositions exit silently; focus/setting resets discard recorded keys.
record('ControlRight', true, 5000)
record('ControlRight', false, 5050)
record('ControlRight', true, 5100)
assert.equal(composer.started, false)
record('ControlRight', true, 5200)
record('KeyA', true, 5300)
composer.reset()
record('ControlRight', true, 5400)
record('ControlRight', true, 5500)
assert.equal(composer.started, false)

// Map the recorded chord, but never send the physical Magic Key itself.
assert.deepEqual(press('MetaLeft', true, false, swapped), { kind: 'passthrough', code: 'ControlLeft' })
press('ControlRight', true, false, swapped)
press('MetaLeft', true, false, swapped)
press('MetaLeft', false, false, swapped)
const command = press('ControlRight', true, false, swapped)
if (command.kind === 'magic') {
  assert.deepEqual(command.effect.frames[0]?.codes, ['ControlLeft'])
  assert.deepEqual(command.effect.frames.at(-1)?.codes, [])
}

console.log('keyboard-magic tests passed')
