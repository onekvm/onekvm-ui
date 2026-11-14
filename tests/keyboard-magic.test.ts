import assert from 'node:assert/strict'

import { MAGIC_DOUBLE_TAP_MS, MagicComposer, mapKeyboardCode, routeKeyboardKey, type MagicEffect } from '../src/lib/keyboard-magic.ts'

const plain = { rightControlAsMeta: false, swapCommandCtrl: false }
const swapped = { rightControlAsMeta: false, swapCommandCtrl: true }
const both = { rightControlAsMeta: true, swapCommandCtrl: true }
assert.equal(mapKeyboardCode('ControlLeft', swapped), 'MetaLeft')
assert.equal(mapKeyboardCode('MetaRight', swapped), 'ControlRight')
assert.equal(mapKeyboardCode('ControlLeft', plain), 'ControlLeft')
assert.equal(mapKeyboardCode('ControlRight', both), 'MetaLeft')
assert.equal(mapKeyboardCode('AltLeft', swapped), 'AltLeft')

let now = 0
const composer = new MagicComposer(() => now)
function key(physical: string, down: boolean, at: number, repeat = false, options = plain) {
  now = at
  return routeKeyboardKey(composer, { physical, down, repeat, magicKey: 'ControlRight', ...options })
}
function tap(code: string, at: number, options = plain): MagicEffect {
  const routed = key(code, true, at, false, options)
  key(code, false, at + 20, false, options)
  assert.equal(routed.kind, 'magic')
  if (routed.kind !== 'magic') throw new Error('Expected local recording')
  return routed.effect
}
function doubleTap(at: number, options = plain) {
  assert.deepEqual(tap('ControlRight', at, options).frames, [], 'The first tap must not send')
  return tap('ControlRight', at + 100, options)
}
function record(code: string, at: number) {
  assert.deepEqual(tap(code, at).frames, [], 'Recorded keys must not reach the remote host')
}

// A single Magic tap stays idle. Other input breaks a possible double-tap.
tap('ControlRight', 0)
assert.equal(composer.started, false)
assert.equal(key('KeyA', true, 30).kind, 'passthrough')
tap('ControlRight', 100)
assert.equal(composer.started, false)
composer.reset()
tap('ControlRight', 500)
tap('ControlRight', 500 + MAGIC_DOUBLE_TAP_MS + 1)
assert.equal(composer.started, false, 'Slow taps must not enter recording')
composer.reset()

// The requested example: Ctrl+B, one Magic tap, %, then double Magic to send.
doubleTap(1000)
assert.equal(composer.started, true)
record('ControlLeft', 1200)
record('KeyB', 1400)
record('ControlRight', 1500)
assert.equal(composer.started, true, 'A single tap must insert a pause, not exit')
assert.equal(composer.hint().sequence?.at(-1), 100)
record('ShiftLeft', 1600)
record('Digit5', 1700)
assert.deepEqual(composer.hint().sequence, [['ControlLeft', 'KeyB'], 100, ['ShiftLeft', 'Digit5']])
const sent = doubleTap(2000)
assert.deepEqual(sent.frames, [
  { codes: ['ControlLeft', 'KeyB'], delayMS: 0 },
  { codes: [], delayMS: 20 },
  { codes: ['ShiftLeft', 'Digit5'], delayMS: 100 },
  { codes: [], delayMS: 20 },
])
assert.equal(composer.started, false)
assert.equal(sent.hint.active, false)
assert.equal(key('KeyA', true, 2300).kind, 'passthrough')

// Repeated keys within one group retain their intervals and latched modifiers.
doubleTap(3000)
record('AltLeft', 3200)
record('Tab', 3300)
record('Tab', 3970)
const repeated = doubleTap(5000)
assert.deepEqual(repeated.frames, [
  { codes: ['AltLeft', 'Tab'], delayMS: 0 },
  { codes: ['AltLeft'], delayMS: 20 },
  { codes: ['AltLeft', 'Tab'], delayMS: 650 },
  { codes: [], delayMS: 20 },
])

// Separate single taps add pauses. The exit double-tap contributes no pause.
doubleTap(6000)
record('KeyB', 6200)
record('ControlRight', 6300)
record('ControlRight', 6800)
record('KeyB', 7000)
const twoPauses = doubleTap(7500)
assert.equal(twoPauses.frames[2]?.delayMS, 200)
assert.deepEqual(twoPauses.frames.map(frame => frame.codes), [['KeyB'], [], ['KeyB'], []])

doubleTap(8000)
record('ControlRight', 8200)
record('KeyA', 8300)
assert.deepEqual(doubleTap(9000).frames[0], { codes: ['KeyA'], delayMS: 100 }, 'Leading pauses must delay the first key')

// Autorepeat and duplicate keydowns never count as a double-tap or a new key.
tap('ControlRight', 10000)
assert.equal(key('ControlRight', true, 10100, true).kind, 'magic')
assert.equal(composer.started, false)
composer.reset()
doubleTap(11000)
key('KeyA', true, 11200)
key('KeyA', true, 11220, true)
key('KeyA', true, 11230)
const held = doubleTap(11500)
assert.deepEqual(held.frames, [{ codes: ['KeyA'], delayMS: 0 }, { codes: [], delayMS: 100 }])

doubleTap(12000)
record('MetaLeft', 12200)
record('ControlRight', 12300)
record('Escape', 12400)
assert.equal(composer.started, false)
assert.deepEqual(doubleTap(12500).frames, [])
assert.deepEqual(doubleTap(13000).frames, [], 'An empty recording must exit silently')

doubleTap(14000)
record('KeyA', 14200)
composer.reset()
assert.deepEqual(doubleTap(14500).frames, [])
assert.deepEqual(doubleTap(15000).frames, [], 'Reset must discard pending taps and recorded keys')

// Modifier-only shortcuts and mapping still work; the Magic Key is never sent.
doubleTap(16000, swapped)
tap('MetaLeft', 16200, swapped)
assert.deepEqual(doubleTap(16500, swapped).frames, [
  { codes: ['ControlLeft'], delayMS: 0 }, { codes: [], delayMS: 100 },
])
console.log('keyboard-magic tests passed')
