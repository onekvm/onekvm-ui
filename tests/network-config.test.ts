import assert from 'node:assert/strict'
import type { ManagedNetworkInterface } from '../src/api/client.ts'

import {
  availablePhysicalInterfaces,
  defaultManagedTunnel,
  defaultNetworkConfig,
  configuredIPv4Address,
  configuredStaticAddresses,
  isNetworkConfigDirty,
  isNetworkConfigValid,
  networkConfigSnapshot,
  usesCustomDiscoveryURL,
  physicalInterfaceConfig,
  updatePhysicalInterface,
  updatePrimaryInterface,
  withManagementVLAN,
} from '../src/lib/network.ts'

const base = defaultNetworkConfig()
const primary = physicalInterfaceConfig(base, base.primary_interface)
const withPrimary = (value: Partial<ManagedNetworkInterface>) => updatePhysicalInterface(base, base.primary_interface, { ...primary, ...value })
assert.equal(primary.ipv4_mode, 'dhcp-static', 'default IPv4 mode is DHCP plus fallback')
assert.equal(primary.ipv4_address, '192.168.233.10/24', 'default fallback IPv4 address is assigned')
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
assert.equal(configuredIPv4Address(base), '192.168.233.10', 'primary fallback IPv4 is used for redirect')
assert.deepEqual(configuredStaticAddresses(base), ['192.168.233.10'])
assert.equal(
  configuredIPv4Address({
    ...base,
    interfaces: [{ ...primary, ipv4_mode: 'disabled', ipv4_address: '' }, {
      kind: 'vlan', name: 'vlan10', parent: 'eth0', vlan_id: 10,
      ipv4_mode: 'static', ipv4_address: '192.0.2.10/24', ipv4_gateway: '',
      ipv6_mode: 'disabled', ipv6_address: '', ipv6_gateway: '', route_metric: 100,
    }],
  }),
  '192.0.2.10',
  'management VLAN IPv4 is used for redirect',
)
assert.equal(isNetworkConfigValid(withPrimary({ ipv4_mode: 'dhcp', ipv4_address: '' })), true, 'DHCP-only remains valid')
assert.equal(isNetworkConfigValid(withPrimary({ ipv4_mode: 'dhcp-static', ipv4_address: '' })), false, 'DHCP plus fallback requires an address')
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
assert.equal(isNetworkConfigValid({ ...base, interfaces: [...base.interfaces, fou] }), false, 'FOU without port is invalid')
assert.equal(
  isNetworkConfigValid({ ...base, interfaces: [...base.interfaces, { ...fou, port: 5555 }] }),
  true,
  'FOU with port is valid',
)

const bareudp = defaultManagedTunnel('bareudp', 'bareudp0')
assert.equal(bareudp.port, 0)
assert.equal(isNetworkConfigValid({ ...base, interfaces: [...base.interfaces, bareudp] }), false, 'BareUDP without port is invalid')
assert.equal(
  isNetworkConfigValid({ ...base, interfaces: [...base.interfaces, { ...bareudp, port: 6635 }] }),
  true,
  'BareUDP with port is valid',
)

const vxlan = defaultManagedTunnel('vxlan', 'vxlan0')
assert.equal(vxlan.ipv4_mode, 'dhcp')
assert.equal(isNetworkConfigValid({ ...base, interfaces: [...base.interfaces, vxlan] }), false, 'VXLAN without remote is invalid')
assert.equal(
  isNetworkConfigValid({ ...base, interfaces: [...base.interfaces, { ...vxlan, remote: '198.51.100.20' }] }),
  true,
  'VXLAN with remote is valid',
)

const gre = defaultManagedTunnel('gre', 'gre0')
assert.equal(gre.ipv4_mode, 'dhcp')
assert.equal(isNetworkConfigValid({ ...base, interfaces: [...base.interfaces, gre] }), false, 'GRE without endpoints is invalid')
assert.equal(
  isNetworkConfigValid({
    ...base,
    interfaces: [...base.interfaces, { ...gre, local: '203.0.113.10', remote: '198.51.100.20' }],
  }),
  true,
  'GRE with endpoints is valid',
)

const dirty = { ...base, interfaces: [...base.interfaces, { ...vxlan, remote: '198.51.100.20' }] }
assert.equal(isNetworkConfigDirty(dirty, networkConfigSnapshot(base)), true, 'added interface is dirty')
assert.equal(isNetworkConfigDirty(base, ''), false, 'empty snapshot is not dirty')

const secondary = updatePhysicalInterface(base, 'eth1', {
  ...physicalInterfaceConfig(base, 'eth1'),
  ipv4_mode: 'static', ipv4_address: '192.0.2.20/24', route_metric: 250,
})
assert.equal(secondary.primary_interface, 'eth0', 'configuring another port preserves the primary')
assert.equal(physicalInterfaceConfig(secondary, 'eth0').ipv4_address, primary.ipv4_address, 'primary address is preserved')
assert.equal(physicalInterfaceConfig(secondary, 'eth1').ipv4_address, '192.0.2.20/24')
assert.equal(isNetworkConfigValid(secondary), true, 'multiple physical ports are valid')
const editedPrimary = updatePhysicalInterface(secondary, 'eth0', { ...physicalInterfaceConfig(secondary, 'eth0'), route_metric: 90 })
assert.equal(physicalInterfaceConfig(editedPrimary, 'eth1').route_metric, 250, 'primary edits preserve the second port')
assert.equal(isNetworkConfigValid({ ...secondary, interfaces: secondary.interfaces.map(link => link.name === 'eth1' ? { ...link, mac_address: 'invalid' } : link) }), false)
assert.equal(isNetworkConfigValid({ ...secondary, interfaces: [...secondary.interfaces, secondary.interfaces[0]!] }), false)
assert.equal(isNetworkConfigValid({ ...secondary, interfaces: [...secondary.interfaces, {
  kind: 'vlan', name: 'vlan20', parent: 'eth1', vlan_id: 20,
  ipv4_mode: 'dhcp', ipv4_address: '', ipv4_gateway: '',
  ipv6_mode: 'disabled', ipv6_address: '', ipv6_gateway: '', route_metric: 250,
}] }), true, 'VLANs may attach to a secondary physical port')

console.log('network-config tests passed')

// Configuring wlan0 moves it from live links to managed links; do not add a placeholder.
const liveWifi = { name: 'wlan0', up: true, configured: false, mac: '02:00:00:00:00:01',
  addresses: ['192.0.2.20/24'], port_type: 'physical' as const, link_speed_mbps: 0 }
const configuredWifi = updatePhysicalInterface(base, 'wlan0', physicalInterfaceConfig(base, 'wlan0'))
for (const live of [[], [liveWifi]]) {
  const before = availablePhysicalInterfaces(live, base, true)
  assert.equal(before.filter(link => link.name === 'wlan0').length, 1, 'unconfigured Wi-Fi is shown once, even before discovery')
  const after = availablePhysicalInterfaces(live, configuredWifi, true)
  assert.equal(after.filter(link => link.name === 'wlan0').length, 0, 'configured Wi-Fi is rendered only by the managed list')
  assert.equal(after.filter(link => link.name === 'ap0').length, 1, 'AP placeholder remains available')
  assert.equal(configuredWifi.interfaces.filter(link => link.name === 'wlan0').length, 1)
}
assert.equal(availablePhysicalInterfaces([liveWifi], updatePrimaryInterface(base, { ...primary, name: 'wlan0' }), true)
  .filter(link => link.name === 'wlan0').length, 0, 'primary Wi-Fi is rendered by the managed list')
assert.equal(availablePhysicalInterfaces([], base, false).some(link => link.name === 'wlan0'), false,
  'machines without Wi-Fi do not receive placeholders')

const vlan = withManagementVLAN(secondary, 10)
assert.equal(isNetworkConfigValid(vlan), true)
assert.equal(physicalInterfaceConfig(vlan, 'eth0').ipv4_mode, 'disabled')
assert.equal(physicalInterfaceConfig(vlan, 'eth1').ipv4_address, '192.0.2.20/24')
assert.equal(vlan.interfaces.find(link => link.kind === 'vlan')?.ipv4_address, primary.ipv4_address)
const renamed = updatePrimaryInterface(vlan, { ...physicalInterfaceConfig(vlan, 'eth0'), name: 'eth1' })
assert.equal(renamed.primary_interface, 'eth1')
assert.equal(renamed.interfaces.filter(link => link.name === 'eth1').length, 1)
assert.equal(renamed.interfaces.find(link => link.kind === 'vlan')?.parent, 'eth1')
assert.equal(isNetworkConfigValid(renamed), true)
assert.equal(isNetworkConfigValid({ ...base, primary_interface: 'missing' }), false)
