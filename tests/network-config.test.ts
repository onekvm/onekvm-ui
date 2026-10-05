import assert from 'node:assert/strict'

import {
  defaultManagedTunnel,
  defaultNetworkConfig,
  configuredIPv4Address,
  configuredStaticAddresses,
  isNetworkConfigDirty,
  isNetworkConfigValid,
  networkConfigSnapshot,
  usesCustomDiscoveryURL,
} from '../src/lib/network.ts'

const base = defaultNetworkConfig()
assert.equal(base.ipv4_mode, 'dhcp-static', 'default IPv4 mode is DHCP plus fallback')
assert.equal(base.ipv4_address, '192.168.233.1/24', 'default fallback IPv4 address is assigned')
assert.equal(base.discovery_url, 'https://find.onekvm.org', 'default discovery page is configured')
assert.equal(base.discovery_enabled, true, 'discovery is enabled by default')
assert.equal(base.use_custom_discovery_url, false, 'custom URL is folded by default')
assert.equal(isNetworkConfigValid(base), true, 'default config is valid')
assert.equal(usesCustomDiscoveryURL({ ...base, use_custom_discovery_url: undefined, discovery_url: 'https://finder.example/devices' }), true, 'legacy custom URL stays active')
assert.equal(isNetworkConfigValid({ ...base, use_custom_discovery_url: true, discovery_url: 'https://finder.example/devices' }), true, 'custom discovery page is valid')
assert.equal(isNetworkConfigValid({ ...base, use_custom_discovery_url: true, discovery_url: 'javascript:alert(1)' }), false, 'non-web discovery URL is rejected')
assert.equal(isNetworkConfigValid({ ...base, use_custom_discovery_url: true, discovery_url: 'https://user:secret@finder.example' }), false, 'discovery URL credentials are rejected')
assert.equal(isNetworkConfigValid({ ...base, use_custom_discovery_url: false, discovery_url: 'javascript:alert(1)' }), true, 'folded custom URL does not block saving')
assert.equal(isNetworkConfigValid({ ...base, discovery_enabled: false, use_custom_discovery_url: true, discovery_url: '' }), true, 'disabled discovery does not block saving')
assert.equal(configuredIPv4Address(base), '192.168.233.1', 'top-level fallback IPv4 is used for redirect')
assert.deepEqual(configuredStaticAddresses(base), ['192.168.233.1'])
assert.equal(
  configuredIPv4Address({
    ...base,
    ipv4_mode: 'disabled',
    ipv4_address: '',
    interfaces: [{
      kind: 'vlan', name: 'vlan10', parent: 'eth0', vlan_id: 10,
      ipv4_mode: 'static', ipv4_address: '192.0.2.10/24', ipv4_gateway: '',
      ipv6_mode: 'disabled', ipv6_address: '', ipv6_gateway: '', route_metric: 100,
    }],
  }),
  '192.0.2.10',
  'management VLAN IPv4 is used for redirect',
)
assert.equal(isNetworkConfigValid({ ...base, ipv4_mode: 'dhcp', ipv4_address: '' }), true, 'DHCP-only remains valid')
assert.equal(isNetworkConfigValid({ ...base, ipv4_mode: 'dhcp-static', ipv4_address: '' }), false, 'DHCP plus fallback requires an address')
assert.equal(isNetworkConfigValid({ ...base, proxy: { http: 'not-a-url' } }), false, 'invalid proxy is rejected')
assert.equal(isNetworkConfigValid({ ...base, proxy: { http: 'http://proxy.example:8080' } }), true, 'http proxy is valid')
assert.equal(
  isNetworkConfigValid({ ...base, webrtc: { turn_servers: [{ url: 'turn:turn.example:3478', username: '', credential: '' }] } }),
  false,
  'TURN without credentials is rejected',
)
assert.equal(
  isNetworkConfigValid({
    ...base,
    webrtc: {
      stun: 'stun:stun.l.google.com:19302',
      turn_servers: [{ url: 'turn:turn.example:3478', username: 'kvm', credential: 'secret' }],
    },
  }),
  true,
  'STUN and TURN with credentials are valid',
)
assert.equal(
  isNetworkConfigValid({
    ...base,
    webrtc: {
      stun: 'stun:stun.example:3478\nstun:backup.example:3478',
      turn_servers: [
        { url: 'turn:turn.example:3478', username: 'primary', credential: 'primary-secret' },
        { url: 'turns:backup.example:5349', username: 'backup', credential: 'backup-secret' },
      ],
    },
  }),
  true,
  'multiple STUN servers and independently authenticated TURN servers are valid',
)
assert.equal(
  isNetworkConfigValid({
    ...base,
    webrtc: {
      turn: 'turn:legacy.example:3478\nturns:legacy-backup.example:5349',
      turn_username: 'legacy',
      turn_credential: 'legacy-secret',
    },
  }),
  true,
  'legacy shared-credential TURN configuration remains valid',
)
assert.equal(
  isNetworkConfigValid({
    ...base,
    webrtc: { stun: 'stun:stun.example:3478\nhttps://invalid.example' },
  }),
  false,
  'an invalid ICE server line is rejected',
)
assert.equal(
  isNetworkConfigValid({
    ...base,
    webrtc: { turn_servers: [{ url: 'https://invalid.example', username: 'kvm', credential: 'secret' }] },
  }),
  false,
  'an invalid TURN server URL is rejected',
)
assert.equal(isNetworkConfigDirty(base, networkConfigSnapshot(base)), false, 'unchanged config is not dirty')
const omittedOptionalServices = { ...base, proxy: undefined, webrtc: undefined }
assert.equal(
  isNetworkConfigDirty(
    { ...omittedOptionalServices, proxy: {}, webrtc: {} },
    networkConfigSnapshot(omittedOptionalServices),
  ),
  false,
  'empty proxy and ICE objects are equivalent to omitted configuration',
)

const fou = defaultManagedTunnel('fou', 'fou0')
assert.equal(fou.port, 0)
assert.equal(fou.ipv4_mode, 'disabled')
assert.equal(isNetworkConfigValid({ ...base, interfaces: [fou] }), false, 'FOU without port is invalid')
assert.equal(
  isNetworkConfigValid({ ...base, interfaces: [{ ...fou, port: 5555 }] }),
  true,
  'FOU with port is valid',
)

const bareudp = defaultManagedTunnel('bareudp', 'bareudp0')
assert.equal(bareudp.port, 0)
assert.equal(isNetworkConfigValid({ ...base, interfaces: [bareudp] }), false, 'BareUDP without port is invalid')
assert.equal(
  isNetworkConfigValid({ ...base, interfaces: [{ ...bareudp, port: 6635 }] }),
  true,
  'BareUDP with port is valid',
)

const vxlan = defaultManagedTunnel('vxlan', 'vxlan0')
assert.equal(vxlan.ipv4_mode, 'dhcp')
assert.equal(isNetworkConfigValid({ ...base, interfaces: [vxlan] }), false, 'VXLAN without remote is invalid')
assert.equal(
  isNetworkConfigValid({ ...base, interfaces: [{ ...vxlan, remote: '198.51.100.20' }] }),
  true,
  'VXLAN with remote is valid',
)

const gre = defaultManagedTunnel('gre', 'gre0')
assert.equal(gre.ipv4_mode, 'dhcp')
assert.equal(isNetworkConfigValid({ ...base, interfaces: [gre] }), false, 'GRE without endpoints is invalid')
assert.equal(
  isNetworkConfigValid({
    ...base,
    interfaces: [{ ...gre, local: '203.0.113.10', remote: '198.51.100.20' }],
  }),
  true,
  'GRE with endpoints is valid',
)

const dirty = { ...base, interfaces: [{ ...vxlan, remote: '198.51.100.20' }] }
assert.equal(isNetworkConfigDirty(dirty, networkConfigSnapshot(base)), true, 'added interface is dirty')
assert.equal(isNetworkConfigDirty(base, ''), false, 'empty snapshot is not dirty')

console.log('network-config tests passed')
