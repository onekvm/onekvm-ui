import assert from 'node:assert/strict'

import { resolveConsoleTitle, validPersonalizationText } from '../src/lib/console-title.ts'

const identity = {
  device_name: 'Lab KVM',
  console_title_source: 'device_name' as const,
  custom_console_title: 'Rack 3',
}

assert.equal(resolveConsoleTitle(identity, 'onekvm-107'), 'Lab KVM')
assert.equal(resolveConsoleTitle({ ...identity, console_title_source: 'hostname' }, 'onekvm-107'), 'onekvm-107')
assert.equal(resolveConsoleTitle({ ...identity, console_title_source: 'custom' }, 'onekvm-107'), 'Rack 3')
assert.equal(resolveConsoleTitle({ ...identity, console_title_source: 'custom', custom_console_title: '' }, 'onekvm-107'), 'onekvm-107')
assert.equal(resolveConsoleTitle(undefined, '', 'setup-host'), 'setup-host')
assert.equal(resolveConsoleTitle(undefined, ''), 'OneKVM')

assert.equal(validPersonalizationText('设备 107'), true)
assert.equal(validPersonalizationText(''), false)
assert.equal(validPersonalizationText('', false), true)
assert.equal(validPersonalizationText('bad\nname'), false)
assert.equal(validPersonalizationText('unsafe\u202ename'), false)
assert.equal(validPersonalizationText('x'.repeat(65)), false)

console.log('console title tests passed')
