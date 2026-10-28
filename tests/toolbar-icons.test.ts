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
assert.equal(defaults.length, 13)
assert.equal(defaults[0]?.id, 'display')
assert.equal(defaults.at(-1)?.id, 'account')
assert.equal(defaults.every(icon => !icon.hidden), true)

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
  'mouse', 'display', 'keyboard', 'gamepad', 'power', 'audio', 'virtual_media',
  'account', 'settings', 'language', 'performance', 'fullscreen', 'toolbox',
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

console.log('toolbar icon tests passed')
