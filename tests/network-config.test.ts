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
  cloneNetworkConfig,
  vpnClientConfig,
  vpnInterfaceConfig,
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

const mixed = {
  ...base,
  interfaces: [
    ...base.interfaces,
    { kind: 'wireguard' as const, name: 'wg0', private_key: '',
      public_key: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', addresses: ['10.0.0.2/24'], listen_port: 51820,
      peers: [{ public_key: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', preshared_key: '', endpoint: '', allowed_ips: ['10.0.0.0/24'], persistent_keepalive: 0 }] },
    { kind: 'pppoe' as const, name: 'ppp0', parent: 'eth0', username: 'user', password: 'secret', disabled: true },
  ],
}
assert.equal(isNetworkConfigValid(mixed), true, 'all interface kinds share one collection')
assert.equal(configuredIPv4Address(mixed), configuredIPv4Address(base), 'VPN entries do not replace physical management addressing')
const mixedClone = cloneNetworkConfig(mixed)
const clonedWG = mixedClone.interfaces.find(item => item.kind === 'wireguard')!
if (clonedWG.kind !== 'wireguard') throw new Error('missing WireGuard interface')
clonedWG.addresses.push('10.1.0.2/24')
clonedWG.peers[0]!.allowed_ips.push('10.1.0.0/24')
assert.equal(mixed.interfaces[1]!.kind === 'wireguard' && mixed.interfaces[1].addresses.length, 1, 'cloning separates WireGuard address lists')
assert.equal(isNetworkConfigDirty(mixedClone, networkConfigSnapshot(mixed)), true, 'nested WireGuard changes are detected')
const renamedMixed = updatePrimaryInterface(mixed, { ...primary, name: 'eth1' })
assert.equal(renamedMixed.interfaces.find(item => item.kind === 'pppoe')?.parent, 'eth1', 'renaming the primary preserves VPN parents')
assert.deepEqual(vpnInterfaceConfig(vpnClientConfig({ kind: 'pppoe', name: 'ppp0', disabled: true })), { kind: 'pppoe', name: 'ppp0', disabled: true })
assert.equal(isNetworkConfigValid({ ...mixed, interfaces: [...mixed.interfaces, { kind: 'pppoe', name: 'wg0', username: 'user' }] }), false, 'duplicate names are rejected across interface kinds')
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

// Roles come from discovered links, including an inactive AP reported by Core.
const liveWifi = { name: 'wlp2s0', up: true, configured: false, mac: '02:00:00:00:00:01',
  addresses: ['192.0.2.20/24'], port_type: 'physical' as const, link_speed_mbps: 0, wifi_role: 'station' as const }
const ap = { ...liveWifi, name: 'onekvm-ap1', up: false, addresses: [], port_type: 'virtual' as const, wifi_role: 'ap' as const }
const configuredWifi = updatePhysicalInterface(base, liveWifi.name, physicalInterfaceConfig(base, liveWifi.name))
const before = availablePhysicalInterfaces([liveWifi, ap], base, true)
assert.equal(before.find(link => link.name === liveWifi.name)?.kind, 'wifi_station')
assert.equal(before.find(link => link.name === ap.name)?.kind, 'wifi_ap')
const after = availablePhysicalInterfaces([liveWifi, ap], configuredWifi, true)
assert.equal(after.some(link => link.name === liveWifi.name), false, 'configured links appear only in the managed list')
assert.equal(after.filter(link => link.name === ap.name).length, 1)
assert.deepEqual(availablePhysicalInterfaces([], base, true), [], 'never invent interface names')

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
