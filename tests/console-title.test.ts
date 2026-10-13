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
} satisfies PersonalizationConfig

assert.equal(resolveConsoleTitle(identity, 'onekvm-107'), 'Lab KVM')
assert.equal(resolveConsoleTitle({ ...identity, console_title_source: 'hostname' }, 'onekvm-107'), 'onekvm-107')
assert.equal(resolveConsoleTitle({ ...identity, console_title_source: 'custom' }, 'onekvm-107'), 'Rack 3')
assert.equal(resolveConsoleTitle({ ...identity, console_title_source: 'custom', custom_console_title: '' }, 'onekvm-107'), 'onekvm-107')
assert.equal(resolveConsoleTitle(undefined, '', 'setup-host'), 'setup-host')
assert.equal(resolveConsoleTitle(undefined, ''), 'OneKVM')

assert.deepEqual(normalizeConsoleSubtitleParts(undefined), ['device_model'])
assert.deepEqual(normalizeConsoleSubtitleParts({ show_device_model: false }), [])
assert.deepEqual(
  normalizeConsoleSubtitleParts({ ...identity, console_subtitle_parts: ['custom', 'hostname', 'custom'] }),
  ['hostname', 'custom'],
)

assert.equal(resolveConsoleSubtitle(undefined, 'onekvm-107', 'NanoKVM PCIe'), 'NanoKVM PCIe')
assert.equal(resolveConsoleSubtitle({ ...identity, console_subtitle_parts: ['hostname'] }, 'onekvm-107', 'NanoKVM PCIe'), 'onekvm-107')
assert.equal(resolveConsoleSubtitle({ ...identity, console_subtitle_parts: ['device_model'] }, 'onekvm-107', 'NanoKVM PCIe'), 'NanoKVM PCIe')
assert.equal(resolveConsoleSubtitle({ ...identity, console_subtitle_parts: ['custom'] }, 'onekvm-107', 'NanoKVM PCIe'), 'Primary rack')
assert.equal(
  resolveConsoleSubtitle(
    { ...identity, console_subtitle_parts: ['custom', 'device_model', 'hostname'] },
    'onekvm-107',
    'NanoKVM PCIe',
  ),
  'onekvm-107 · NanoKVM PCIe · Primary rack',
)
assert.equal(resolveConsoleSubtitle({ ...identity, console_subtitle_parts: [] }, 'onekvm-107', 'NanoKVM PCIe'), '')
assert.equal(resolveConsoleSubtitle({ show_device_model: false }, 'onekvm-107', 'NanoKVM PCIe'), '')
assert.equal(
  resolveConsoleSubtitle(
    { ...identity, console_subtitle_parts: ['hostname', 'custom'], custom_console_subtitle: '' },
    'onekvm-107',
    'NanoKVM PCIe',
  ),
  'onekvm-107',
)

assert.equal(validPersonalizationText('设备 107'), true)
assert.equal(validPersonalizationText(''), false)
assert.equal(validPersonalizationText('', false), true)
assert.equal(validPersonalizationText('bad\nname'), false)
assert.equal(validPersonalizationText('unsafe\u202ename'), false)
assert.equal(validPersonalizationText('x'.repeat(65)), false)

console.log('console title tests passed')
