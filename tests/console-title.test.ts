import assert from 'node:assert/strict'

import type { PersonalizationConfig } from '../src/api/client.ts'
import {
  normalizeConsoleSubtitleParts,
  resolveConsoleSubtitle,
  resolveConsoleTitle,
  validPersonalizationText,
} from '../src/lib/console-title.ts'

const identity = {
  device_name: 'Lab KVM',
  console_title_source: 'device_name' as const,
  custom_console_title: 'Rack 3',
  console_subtitle_parts: ['device_model'] as const,
  custom_console_subtitle: 'Primary rack',
  dim_windows_on_kvm_focus: true,
  connection_animation: true,
} satisfies PersonalizationConfig

assert.equal(resolveConsoleTitle(identity, 'onekvm-pcie'), 'Lab KVM')
assert.equal(resolveConsoleTitle({ ...identity, console_title_source: 'hostname' }, 'onekvm-pcie'), 'onekvm-pcie')
assert.equal(resolveConsoleTitle({ ...identity, console_title_source: 'custom' }, 'onekvm-pcie'), 'Rack 3')
assert.equal(resolveConsoleTitle({ ...identity, console_title_source: 'custom', custom_console_title: '' }, 'onekvm-pcie'), 'onekvm-pcie')
assert.equal(resolveConsoleTitle(undefined, '', 'setup-host'), 'setup-host')
assert.equal(resolveConsoleTitle(undefined, ''), 'OneKVM')

assert.deepEqual(normalizeConsoleSubtitleParts(undefined), ['device_model'])
assert.deepEqual(normalizeConsoleSubtitleParts({ show_device_model: false }), [])
assert.deepEqual(
  normalizeConsoleSubtitleParts({ ...identity, console_subtitle_parts: ['custom', 'hostname', 'custom'] }),
  ['hostname', 'custom'],
)

assert.equal(resolveConsoleSubtitle(undefined, 'onekvm-pcie', 'NanoKVM PCIe'), 'NanoKVM PCIe')
assert.equal(resolveConsoleSubtitle({ ...identity, console_subtitle_parts: ['hostname'] }, 'onekvm-pcie', 'NanoKVM PCIe'), 'onekvm-pcie')
assert.equal(resolveConsoleSubtitle({ ...identity, console_subtitle_parts: ['device_model'] }, 'onekvm-pcie', 'NanoKVM PCIe'), 'NanoKVM PCIe')
assert.equal(resolveConsoleSubtitle({ ...identity, console_subtitle_parts: ['custom'] }, 'onekvm-pcie', 'NanoKVM PCIe'), 'Primary rack')
assert.equal(
  resolveConsoleSubtitle(
    { ...identity, console_subtitle_parts: ['custom', 'device_model', 'hostname'] },
    'onekvm-pcie',
    'NanoKVM PCIe',
  ),
  'onekvm-pcie · NanoKVM PCIe · Primary rack',
)
assert.equal(resolveConsoleSubtitle({ ...identity, console_subtitle_parts: [] }, 'onekvm-pcie', 'NanoKVM PCIe'), '')
assert.equal(resolveConsoleSubtitle({ show_device_model: false }, 'onekvm-pcie', 'NanoKVM PCIe'), '')
assert.equal(
  resolveConsoleSubtitle(
    { ...identity, console_subtitle_parts: ['hostname', 'custom'], custom_console_subtitle: '' },
    'onekvm-pcie',
    'NanoKVM PCIe',
  ),
  'onekvm-pcie',
)

assert.equal(validPersonalizationText('设备 3'), true)
assert.equal(validPersonalizationText(''), false)
assert.equal(validPersonalizationText('', false), true)
assert.equal(validPersonalizationText('bad\nname'), false)
assert.equal(validPersonalizationText('unsafe\u202ename'), false)
assert.equal(validPersonalizationText('x'.repeat(65)), false)

console.log('console title tests passed')
