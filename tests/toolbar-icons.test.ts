import assert from 'node:assert/strict'

import {
  defaultToolbarIcons,
  normalizeToolbarIcons,
  reorderToolbarIcon,
  setToolbarIconHidden,
  toolbarIconCssOrder,
  toolbarIconHidden,
  toolbarIconsEqual,
} from '../src/lib/toolbar-icons.ts'

const defaults = defaultToolbarIcons()
assert.equal(defaults.length, 21)
assert.equal(defaults[0]?.id, 'display')
assert.equal(defaults.at(-1)?.id, 'account')
assert.deepEqual(defaults.filter(icon => icon.hidden).map(icon => icon.id), [
  'caps_lock', 'num_lock', 'scroll_lock', 'virtual_keyboard', 'keyboard_text', 'ctrl_alt_del',
])

assert.deepEqual(normalizeToolbarIcons(undefined).map(icon => icon.id), defaults.map(icon => icon.id))
assert.equal(toolbarIconsEqual(undefined, []), true)

const mixed = normalizeToolbarIcons([
  { id: 'account', hidden: true },
  { id: 'mouse', hidden: true },
  { id: 'settings', hidden: true },
  { id: 'mouse', hidden: false },
  { id: 'future', hidden: true },
  { id: 'language', hidden: false },
])
assert.deepEqual(mixed.map(icon => icon.id), [
  'mouse', 'display', 'keyboard', 'caps_lock', 'num_lock', 'scroll_lock', 'virtual_keyboard', 'keyboard_text', 'ctrl_alt_del',
  'gamepad', 'power', 'audio', 'virtual_media',
  'account', 'notifications', 'collection', 'settings', 'language', 'performance', 'fullscreen', 'toolbox',
])
assert.equal(toolbarIconHidden(mixed, 'mouse'), true)
assert.equal(toolbarIconHidden(mixed, 'account'), true)
assert.equal(toolbarIconHidden(mixed, 'settings'), false)
assert.equal(toolbarIconCssOrder(mixed, 'mouse'), 2)
assert.equal(toolbarIconCssOrder(mixed, 'display'), 4)

const moved = reorderToolbarIcon(defaults, 'keyboard', 'display')
assert.deepEqual(moved.slice(0, 3).map(icon => icon.id), ['keyboard', 'display', 'mouse'])
assert.deepEqual(reorderToolbarIcon(defaults, 'display', 'fullscreen').map(icon => icon.id), defaults.map(icon => icon.id))

const hiddenPower = setToolbarIconHidden(defaults, 'power', true)
assert.equal(toolbarIconHidden(hiddenPower, 'power'), true)
assert.equal(setToolbarIconHidden(defaults, 'settings', true).some(icon => icon.id === 'settings' && icon.hidden), false)
assert.equal(toolbarIconHidden(setToolbarIconHidden(defaults, 'collection', true), 'collection'), false)
const collectionFirst = reorderToolbarIcon(defaults, 'collection', 'performance')
assert.ok(collectionFirst.findIndex(icon => icon.id === 'collection') < collectionFirst.findIndex(icon => icon.id === 'performance'))
assert.equal(toolbarIconsEqual(collectionFirst, normalizeToolbarIcons(JSON.parse(JSON.stringify(collectionFirst)))), true)
const oldIcons = defaults.filter(icon => icon.id !== 'collection')
const upgradedIcons = normalizeToolbarIcons(oldIcons)
assert.equal(upgradedIcons.findIndex(icon => icon.id === 'collection') + 1, upgradedIcons.findIndex(icon => icon.id === 'settings'))

const legacy = defaults.filter(icon => !['virtual_keyboard', 'keyboard_text', 'ctrl_alt_del'].includes(icon.id))
for (const id of ['virtual_keyboard', 'keyboard_text', 'ctrl_alt_del'] as const) {
  assert.equal(toolbarIconHidden(legacy, id), true)
  const enabled = setToolbarIconHidden(legacy, id, false)
  assert.equal(toolbarIconHidden(enabled, id), false)
  assert.equal(toolbarIconHidden(normalizeToolbarIcons(JSON.parse(JSON.stringify(enabled))), id), false)
  assert.equal(toolbarIconHidden(setToolbarIconHidden(enabled, id, true), id), true)
  assert.equal(toolbarIconHidden(defaultToolbarIcons(), id), true)
}

console.log('toolbar icon tests passed')
