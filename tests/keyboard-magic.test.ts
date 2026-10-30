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

function press(composer: MagicComposer, physical: string, down: boolean, repeat = false) {
  return routeKeyboardKey(composer, {
    physical,
    down,
    repeat,
    magicKey: 'ControlRight',
    ...plain,
  })
}

const tap = new MagicComposer()
assert.equal(press(tap, 'ControlRight', true).kind, 'magic')
assert.equal(tap.started, true)
assert.deepEqual(tap.hint().codes, [])
press(tap, 'ControlRight', false)
const alt = press(tap, 'AltLeft', true)
assert.equal(alt.kind, 'magic')
if (alt.kind === 'magic') assert.deepEqual(alt.effect.down, ['AltLeft'])
const tabDown = press(tap, 'Tab', true)
if (tabDown.kind === 'magic') {
  assert.deepEqual(tabDown.effect.down, ['Tab'])
  assert.deepEqual(tabDown.effect.hint.codes, ['AltLeft', 'Tab'])
}
const tabUp = press(tap, 'Tab', false)
if (tabUp.kind === 'magic') {
  assert.deepEqual(tabUp.effect.up, ['Tab'])
  assert.deepEqual(tabUp.effect.releaseMods, ['AltLeft'])
  assert.equal(tabUp.effect.hint.active, false)
}
assert.equal(tap.started, false)

const held = new MagicComposer()
press(held, 'ControlRight', true)
press(held, 'AltLeft', true)
press(held, 'Tab', true)
const tabRelease = press(held, 'Tab', false)
if (tabRelease.kind === 'magic') {
  assert.deepEqual(tabRelease.effect.up, ['Tab'])
  assert.deepEqual(tabRelease.effect.releaseMods, [])
  assert.deepEqual(tabRelease.effect.hint.codes, ['AltLeft'])
}
press(held, 'Tab', true)
const magicUp = press(held, 'ControlRight', false)
if (magicUp.kind === 'magic') {
  assert.deepEqual(magicUp.effect.releaseMods, ['AltLeft'])
  assert.equal(magicUp.effect.hint.active, false)
}

const modsOnly = new MagicComposer()
press(modsOnly, 'ControlRight', true)
press(modsOnly, 'ControlRight', false)
press(modsOnly, 'MetaLeft', true)
const again = press(modsOnly, 'ControlRight', true)
if (again.kind === 'magic') {
  assert.deepEqual(again.effect.releaseMods, ['MetaLeft'])
  assert.equal(again.effect.hint.active, false)
}
assert.equal(press(modsOnly, 'KeyA', true).kind, 'passthrough')

const repeat = new MagicComposer()
press(repeat, 'ControlRight', true)
press(repeat, 'AltLeft', true)
const repeated = press(repeat, 'ControlRight', true, true)
if (repeated.kind === 'magic') {
  assert.deepEqual(repeated.effect.releaseMods, [])
  assert.equal(repeat.mods.includes('AltLeft'), true)
}

const swapChord = new MagicComposer()
const swappedMeta = routeKeyboardKey(swapChord, {
  physical: 'MetaLeft',
  down: true,
  repeat: false,
  magicKey: 'ControlRight',
  ...swapped,
})
assert.equal(swappedMeta.kind, 'passthrough')
if (swappedMeta.kind === 'passthrough') assert.equal(swappedMeta.code, 'ControlLeft')
routeKeyboardKey(swapChord, { physical: 'ControlRight', down: true, repeat: false, magicKey: 'ControlRight', ...swapped })
const command = routeKeyboardKey(swapChord, {
  physical: 'MetaLeft',
  down: true,
  repeat: false,
  magicKey: 'ControlRight',
  ...swapped,
})
if (command.kind === 'magic') assert.deepEqual(command.effect.down, ['ControlLeft'])

console.log('keyboard-magic tests passed')
