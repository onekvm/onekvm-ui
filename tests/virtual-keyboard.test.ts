import assert from 'node:assert/strict'

import {
  applyKeyLabels,
  baseMainRows,
  desktopKeyboardRows,
  functionRow,
  layoutLabels,
  mobileLayerRows,
  mobileModifierRow,
  mobileKeyboardModifiers,
  mobileRowClass,
  nextKeyboardLayer,
  parseVirtualKeyboardMode,
} from '../src/lib/virtual-keyboard.ts'

assert.equal(nextKeyboardLayer('letters', 'fn'), 'fn')
assert.equal(nextKeyboardLayer('fn', 'fn'), 'letters')
assert.equal(nextKeyboardLayer('numbers', 'letters'), 'letters')

const letters = mobileLayerRows('letters')
assert.equal(letters[0].length, 10)
assert.equal(letters[1].length, 9)
assert.equal(mobileRowClass(letters[1]), 'is-home')
assert.equal(letters[2][0].code, 'ShiftLeft')
assert.equal(letters[2][0].modifier, 2)
assert.equal(letters[2].at(-1)?.code, 'Backspace')
assert.equal(letters[3].some((item) => item.kind === 'layer' && item.layer === 'numbers'), true)
assert.equal(letters[3].some((item) => item.code === 'Space'), true)
assert.equal(letters[3].some((item) => item.code === 'Enter'), true)

const numbers = mobileLayerRows('numbers')
assert.equal(numbers[0].map((item) => item.code).join(','), 'Digit1,Digit2,Digit3,Digit4,Digit5,Digit6,Digit7,Digit8,Digit9,Digit0')
assert.equal(numbers[3].some((item) => item.kind === 'layer' && item.layer === 'letters'), true)

const fn = mobileLayerRows('fn')
assert.equal(fn[0].map((item) => item.label).join(''), 'F1F2F3F4F5F6')
assert.equal(fn[1].map((item) => item.label).join(''), 'F7F8F9F10F11F12')
assert.equal(fn[2].length, 6)
assert.equal(fn.length, 4)

assert.equal(mobileModifierRow.some((item) => item.modifier === 1), true)
assert.equal(mobileModifierRow.some((item) => item.code === 'Tab'), true)
assert.equal(mobileModifierRow.some((item) => item.code === 'ShiftLeft'), false)
assert.equal(mobileModifierRow.some((item) => item.kind === 'layer' && item.layer === 'fn'), true)

const german = applyKeyLabels(letters, layoutLabels.de || {})
assert.equal(german[0].find((item) => item.code === 'KeyY')?.label, 'Z')

// Every desktop row must fill the same 15-unit typing block, including modifiers.
for (const row of baseMainRows) {
  assert.equal(row.reduce((units, item) => units + (item.units ?? 1), 0), 15)
}
const desktopKeys = [...functionRow, ...baseMainRows.flat()]
assert.equal(new Set(desktopKeys.map((item) => item.code)).size, desktopKeys.length)
assert.equal(desktopKeys.find((item) => item.code === 'MetaRight')?.modifier, 128)
assert.equal(desktopKeys.some((item) => item.code === 'ScrollLock'), true)

assert.equal(parseVirtualKeyboardMode(null), 'win')
assert.equal(parseVirtualKeyboardMode('invalid'), 'win')
assert.equal(parseVirtualKeyboardMode('win'), 'win')
assert.equal(parseVirtualKeyboardMode('mac'), 'mac')

const macRows = desktopKeyboardRows('mac')
assert.deepEqual(macRows.at(-1)?.map((item) => item.label), ['Ctrl', 'Opt', 'Cmd', 'Space', 'Cmd', 'Opt', 'Ctrl'])
assert.deepEqual(macRows.at(-1)?.map((item) => item.modifier), [1, 4, 8, undefined, 128, 64, 16])
for (const mode of ['mac', 'win'] as const) {
  const rows = desktopKeyboardRows(mode)
  for (const row of rows) assert.equal(row.reduce((units, item) => units + (item.units ?? 1), 0), 15)
  const keys = [...functionRow, ...rows.flat()]
  assert.equal(new Set(keys.map((item) => item.code)).size, keys.length)
  const germanRows = applyKeyLabels(rows, layoutLabels.de || {})
  assert.equal(germanRows[1].find((item) => item.code === 'KeyY')?.label, 'Z')
  assert.equal(germanRows.at(-1)?.find((item) => item.code === 'MetaLeft')?.label, mode === 'mac' ? 'Cmd' : 'Win')
}
const macMobile = mobileKeyboardModifiers('mac')
assert.equal(macMobile.find((item) => item.code === 'AltLeft')?.label, 'Opt')
assert.equal(macMobile.find((item) => item.code === 'AltLeft')?.modifier, 4)
assert.equal(macMobile.find((item) => item.code === 'MetaLeft')?.label, 'Cmd')
assert.equal(macMobile.find((item) => item.code === 'MetaLeft')?.modifier, 8)
assert.equal(mobileKeyboardModifiers('win').find((item) => item.code === 'MetaLeft')?.label, 'Win')
assert.equal(desktopKeyboardRows('win').at(-1)?.find((item) => item.code === 'MetaLeft')?.label, 'Win')

console.log('virtual-keyboard tests passed')
