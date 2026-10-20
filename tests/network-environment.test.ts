import assert from 'node:assert/strict'

import { IP_TUNNELS_MARKETPLACE_ID, networkEnvironmentAvailable } from '../src/lib/network-environment.ts'
import { marketplaceInstallPackageFromRecord } from '../src/lib/marketplace-install.ts'

// Marketplace IDs use hyphens while the schema capability uses an underscore.
assert.equal(networkEnvironmentAvailable({ ip_tunnels: true }, IP_TUNNELS_MARKETPLACE_ID), true)
assert.equal(networkEnvironmentAvailable({ 'ip-tunnels': true }, IP_TUNNELS_MARKETPLACE_ID), false)
assert.equal(networkEnvironmentAvailable({ ip_tunnels: false }, IP_TUNNELS_MARKETPLACE_ID), false)
assert.equal(networkEnvironmentAvailable(undefined, IP_TUNNELS_MARKETPLACE_ID), false)
assert.equal(networkEnvironmentAvailable({}, IP_TUNNELS_MARKETPLACE_ID), false)
assert.equal(networkEnvironmentAvailable({ wireguard: true }, 'wireguard'), true)
assert.equal(networkEnvironmentAvailable({}, 'wireguard'), false)
for (const id of ['openvpn', 'pppoe', 'pptp', 'l2tp'] as const) {
  assert.equal(networkEnvironmentAvailable({ [id]: true }, id), true)
  assert.equal(networkEnvironmentAvailable({ [id]: false }, id), false)
}
const pkg = marketplaceInstallPackageFromRecord({
  id: IP_TUNNELS_MARKETPLACE_ID,
  package: 'onekvm-extension-ip-tunnels',
  name: 'IP Tunnels',
  version: '0.1.0',
}, IP_TUNNELS_MARKETPLACE_ID)
assert.equal(pkg?.packageName, 'onekvm-extension-ip-tunnels')
console.log('Network environment availability and marketplace matching passed')
