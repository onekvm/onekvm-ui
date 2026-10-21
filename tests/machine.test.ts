import assert from 'node:assert/strict'

import { machineDisplayName } from '../src/lib/machine.ts'

assert.equal(machineDisplayName(null), '-')
assert.equal(machineDisplayName({ machine: 'picokvm' }), 'picokvm')
assert.equal(
  machineDisplayName({ vendor: 'Luckfox', name: 'PicoKVM' }),
  'Luckfox PicoKVM',
)
assert.equal(
  machineDisplayName({ vendor: 'Sipeed', name: 'NanoKVM', variant: 'pcie', variant_label: 'PCIe' }),
  'Sipeed NanoKVM PCIe',
)
assert.equal(
  machineDisplayName({ vendor: 'Sipeed', name: 'Sipeed NanoKVM', variant: 'cube', variant_label: 'Cube' }),
  'Sipeed NanoKVM Cube',
)
assert.equal(machineDisplayName({ machine: 'nanokvm', variant: 'pcie', variant_label: 'PCIe' }), 'nanokvm PCIe')

assert.equal(machineDisplayName({ variant: 'pcie' }), '- pcie')
assert.equal(machineDisplayName({ machine: 'new-board', variant: 'rev2', variant_label: 'Revision 2' }), 'new-board Revision 2')

console.log('machine tests passed')
