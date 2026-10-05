import assert from 'node:assert/strict'

import {
  SETTINGS_INDEX,
  advancedSettingsHash,
  advancedSettingsRouteFromHash,
  cloudSettingsTarget,
  settingsSidebarActive,
  settingsSidebarGroupActive,
  groupSettingsSections,
  isAdvancedSettingsHash,
  isSettingsIndex,
  settingsAppActive,
  settingsBackTarget,
  settingsGroupTone,
} from '../src/lib/settings-nav.ts'

assert.equal(isSettingsIndex(''), true)
assert.equal(isSettingsIndex(SETTINGS_INDEX), true)
assert.equal(isSettingsIndex('network'), false)

assert.equal(settingsGroupTone('device'), 'device')
assert.equal(settingsGroupTone('network'), 'network')
assert.equal(settingsGroupTone('extensions'), 'extensions')
assert.equal(settingsGroupTone('admin'), 'admin')
assert.equal(settingsGroupTone('other'), 'device')

const grouped = groupSettingsSections([
  { key: 'system' },
  { key: 'files' },
  { key: 'display' },
  { key: 'keyboard' },
  { key: 'usb' },
  { key: 'network' },
  { key: 'cloud' },
  { key: 'extension:cloud', parent: 'cloud' },
  { key: 'plugins' },
  { key: 'extension:oled', parent: 'plugins' },
  { key: 'services' },
  { key: 'logs' },
  { key: 'resources' },
  { key: 'sessions' },
  { key: 'users' },
  { key: 'hdmi' },
  { key: 'time' },
  { key: 'update' },
])

assert.deepEqual(grouped.map((group) => group.id), ['device', 'network', 'extensions', 'admin'])
assert.deepEqual(grouped[0].items.map((item) => item.key), ['system', 'display', 'keyboard', 'usb'])
assert.deepEqual(grouped[1].items.map((item) => item.key), ['network', 'time'])
assert.deepEqual(grouped[2].items.map((item) => item.key), [
  'cloud',
  'plugins',
  'extension:oled',
])
assert.deepEqual(grouped[3].items.map((item) => item.key), [
  'services',
  'logs',
  'resources',
  'sessions',
  'users',
  'files',
  'hdmi',
  'update',
])

const withoutOptional = groupSettingsSections([
  { key: 'system' },
  { key: 'display' },
  { key: 'network' },
  { key: 'plugins' },
  { key: 'update' },
])
assert.deepEqual(withoutOptional[0].items.map((item) => item.key), ['system', 'display'])
assert.equal(withoutOptional.some((group) => group.items.some((item) => item.key === 'users')), false)
assert.deepEqual(withoutOptional.at(-1)?.items.map((item) => item.key), ['update'])

assert.equal(settingsSidebarActive('network', 'network'), true)
assert.equal(settingsSidebarActive('cloud', 'cloud'), true)
assert.equal(settingsSidebarActive('cloud', 'extension:cloud', 'cloud'), true)
assert.equal(settingsSidebarActive('plugins', 'extension:cloud', 'cloud'), false)
assert.equal(settingsSidebarActive('extension:oled', 'extension:oled', 'plugins'), true)
assert.equal(settingsSidebarGroupActive('cloud', 'extension:cloud', 'cloud'), false)
assert.equal(settingsSidebarGroupActive('plugins', 'extension:oled', 'plugins'), true)
assert.equal(settingsSidebarGroupActive('plugins', 'plugins', 'plugins'), false)

assert.equal(cloudSettingsTarget('cloud'), 'extension:cloud')
assert.equal(cloudSettingsTarget(' cloud-jetkvm '), 'extension:cloud-jetkvm')
assert.equal(cloudSettingsTarget(null), 'cloud')
assert.equal(cloudSettingsTarget(''), 'cloud')

assert.equal(settingsBackTarget(SETTINGS_INDEX), null)
assert.equal(settingsBackTarget('network'), SETTINGS_INDEX)
assert.equal(settingsBackTarget('extension:cloud', 'cloud'), 'cloud')
assert.equal(settingsBackTarget('extension:oled', 'plugins'), 'plugins')

assert.equal(settingsAppActive(760), true)
assert.equal(settingsAppActive(761), false)
assert.equal(settingsAppActive(844, 390), true)
assert.equal(settingsAppActive(1024, 768), false)
assert.equal(isAdvancedSettingsHash('#/settings/advanced'), true)
assert.equal(isAdvancedSettingsHash('#/settings/advanced/network'), true)
assert.equal(isAdvancedSettingsHash('#/settings'), false)
assert.equal(advancedSettingsRouteFromHash('#/settings/advanced', true), '')
assert.equal(advancedSettingsRouteFromHash('#/settings/advanced', false), 'system')
assert.equal(advancedSettingsRouteFromHash('#/settings/advanced/', true), '')
assert.equal(advancedSettingsRouteFromHash('#/settings/advanced/network', true), 'network')
assert.equal(advancedSettingsHash(''), '/settings/advanced')
assert.equal(advancedSettingsHash('network'), '/settings/advanced/network')

console.log('settings-nav tests passed')
