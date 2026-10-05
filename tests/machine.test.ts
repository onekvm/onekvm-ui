import assert from 'node:assert/strict'

import { machineDisplayName } from '../src/lib/machine.ts'

assert.equal(machineDisplayName(null), '-')
assert.equal(machineDisplayName({ machine: 'picokvm' }), 'picokvm')
assert.equal(
  machineDisplayName({ vendor: 'Luckfox', name: 'PicoKVM' }),
  'Luckfox PicoKVM',
)
assert.equal(
  machineDisplayName({ vendor: 'Sipeed', name: 'NanoKVM', variant: 'pcie' }),
  'Sipeed NanoKVM PCIe',
)
assert.equal(
  machineDisplayName({ vendor: 'Sipeed', name: 'Sipeed NanoKVM', variant: 'cube' }),
  'Sipeed NanoKVM Cube',
)
assert.equal(machineDisplayName({ machine: 'nanokvm', variant: 'pcie' }), 'nanokvm PCIe')

console.log('machine tests passed')
