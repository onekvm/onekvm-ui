import type { IPv4Mode, ManagedNetworkInterface, NetworkConfig } from '@/api/client'

export type ManagedTunnelKind = Exclude<ManagedNetworkInterface['kind'], 'vlan'>

export const DEFAULT_FALLBACK_IPV4 = '192.168.233.1/24'
export const DEFAULT_DISCOVERY_URL = 'https://find.onekvm.org'

export function ipv4ModeUsesDHCP(mode: IPv4Mode | string) {
  return mode === 'dhcp' || mode === 'dhcp-static'
}

export function ipv4ModeUsesStaticAddress(mode: IPv4Mode | string) {
  return mode === 'static' || mode === 'dhcp-static'
}

export function usesCustomDNS(config: NetworkConfig) {
  return config.use_custom_dns ?? (config.dns || []).length > 0
}

export function usesCustomDiscoveryURL(config: NetworkConfig) {
  return config.use_custom_discovery_url ?? Boolean(config.discovery_url?.trim() && config.discovery_url.trim() !== DEFAULT_DISCOVERY_URL)
}

/**
 * Return the IPv4 address the first-run setup can use after applying config.
 * A management VLAN stores that address on the VLAN interface while the
 * physical device itself is deliberately disabled.
 */
export function configuredIPv4Address(config: NetworkConfig) {
  const candidates = [
    ...(ipv4ModeUsesStaticAddress(config.ipv4_mode) ? [config.ipv4_address] : []),
    ...(config.interfaces || [])
      .filter((networkInterface) => ipv4ModeUsesStaticAddress(networkInterface.ipv4_mode))
      .map((networkInterface) => networkInterface.ipv4_address),
  ]
  return candidates
    .map((value) => value.trim().split('/')[0])
    .find(Boolean) || ''
}

export function configuredStaticAddresses(config: NetworkConfig) {
  const addresses = new Set<string>()
  const add = (mode: string, value: string) => {
    if (mode === 'static' || mode === 'dhcp-static') {
      const address = value.trim().split('/')[0]
      if (address) addresses.add(address)
    }
  }
  add(config.ipv4_mode, config.ipv4_address)
  add(config.ipv6_mode, config.ipv6_address)
  for (const networkInterface of config.interfaces || []) {
    add(networkInterface.ipv4_mode, networkInterface.ipv4_address)
    add(networkInterface.ipv6_mode, networkInterface.ipv6_address)
  }
  return [...addresses]
}

export function defaultNetworkConfig(): NetworkConfig {
  return {
    device: 'eth0',
    mac_address: '',
    ipv4_mode: 'dhcp-static',
    ipv4_address: DEFAULT_FALLBACK_IPV4,
    ipv4_gateway: '',
    dns: [],
    use_custom_dns: false,
    ipv6_enabled: true,
    ipv6_mode: 'slaac',
    ipv6_address: '',
    ipv6_gateway: '',
    route_metric: 100,
		static_routes: [],
    wifi_ssid: '',
    hostname: '',
    mdns: true,
    discovery_enabled: true,
    use_custom_discovery_url: false,
    discovery_url: DEFAULT_DISCOVERY_URL,
    dnssec: 'no',
    http_port: 80,
    https_port: 443,
    tls_enabled: true,
    tls_auto_redirect: true,
    tls_cert_path: '/etc/onekvm/tls/server.crt',
    tls_key_path: '/etc/onekvm/tls/server.key',
    wireguard: [],
    interfaces: [],
    vpn: [],
    proxy: { http: '', https: '', no_proxy: '' },
    webrtc: {},
  }
}

export function cloneNetworkConfig(config: NetworkConfig): NetworkConfig {
  return {
    ...config,
    dns: [...(config.dns || [])],
		static_routes: (config.static_routes || []).map((route) => ({ ...route })),
    wireguard: (config.wireguard || []).map((wireGuard) => ({
      ...wireGuard,
      addresses: [...(wireGuard.addresses || [])],
      peers: (wireGuard.peers || []).map((peer) => ({ ...peer, allowed_ips: [...(peer.allowed_ips || [])] })),
    })),
		interfaces: (config.interfaces || []).map((networkInterface) => ({ ...networkInterface })),
    vpn: (config.vpn || []).map((client) => ({ ...client })),
    proxy: { ...(config.proxy || {}) },
    webrtc: {
      ...(config.webrtc || {}),
      turn_servers: config.webrtc?.turn_servers?.map((server) => ({ ...server })),
    },
  }
}

export function defaultManagedTunnel(kind: ManagedTunnelKind, name: string): ManagedNetworkInterface {
  const overlay = kind === 'vxlan' || kind === 'geneve'
  const encapOnly = kind === 'fou' || kind === 'bareudp'
  return {
    kind,
    name,
    parent: '',
    vlan_id: 0,
    local: '',
    remote: '',
    key: '',
    vni: overlay ? 1 : 0,
    port: 0,
    group: '',
    protocol: kind === 'fou' ? 'ipip' : '',
    ether_type: kind === 'bareudp' ? 'ipv4' : '',
    ipv4_mode: encapOnly ? 'disabled' : 'dhcp',
    ipv4_address: '',
    ipv4_gateway: '',
    ipv6_mode: 'disabled',
    ipv6_address: '',
    ipv6_gateway: '',
    route_metric: 100,
  }
}

export function networkConfigSnapshot(config: NetworkConfig) {
  return JSON.stringify(cloneNetworkConfig(config))
}

export function isNetworkConfigDirty(config: NetworkConfig, savedSnapshot: string) {
  return Boolean(savedSnapshot) && networkConfigSnapshot(config) !== savedSnapshot
}

// A management VLAN carries the address selected in the first-run wizard.
// The physical parent only transports tagged frames and does not also acquire
// an untagged management address.
export function withManagementVLAN(config: NetworkConfig, vlanID: number): NetworkConfig {
  return {
    ...cloneNetworkConfig(config),
    ipv4_mode: 'disabled',
    ipv4_address: '',
    ipv4_gateway: '',
    ipv6_enabled: false,
    ipv6_mode: 'disabled',
    ipv6_address: '',
    ipv6_gateway: '',
    interfaces: [{
      kind: 'vlan',
      name: `vlan${vlanID}`,
      parent: config.device,
      vlan_id: vlanID,
      ipv4_mode: config.ipv4_mode,
      ipv4_address: config.ipv4_address,
      ipv4_gateway: config.ipv4_gateway,
      ipv6_mode: config.ipv6_mode,
      ipv6_address: config.ipv6_address,
      ipv6_gateway: config.ipv6_gateway,
      route_metric: config.route_metric,
    }],
  }
}

const dnsServerNamePattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/

function validDNSPort(value: string) {
  return /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 65535
}

function parseDNSEndpoint(value: string, allowSNI: boolean) {
  const separator = value.indexOf('#')
  let address = value
  let name = ''
  if (separator !== -1) {
    if (!allowSNI) return false
    address = value.slice(0, separator)
    name = value.slice(separator + 1)
    if (!name || !dnsServerNamePattern.test(name)) return false
  }
  if (!address) return false
  if (address.startsWith('[')) {
    const end = address.indexOf(']')
    if (end < 0) return false
    const ip = address.slice(1, end)
    const rest = address.slice(end + 1)
    if (!isIPv6(ip)) return false
    return !rest || (rest.startsWith(':') && validDNSPort(rest.slice(1)))
  }
  if (isIPv4(address) || isIPv6(address)) return true
  const colon = address.lastIndexOf(':')
  if (colon < 0) return false
  return isIPv4(address.slice(0, colon)) && validDNSPort(address.slice(colon + 1))
}

export function isDNSServer(value: string) {
  const server = value.trim()
  if (!server) return false
  const schemeEnd = server.indexOf('://')
  if (schemeEnd !== -1) {
    const scheme = server.slice(0, schemeEnd).toLowerCase()
    if (scheme === 'https') {
      try {
        const parsed = new URL(server)
        return parsed.protocol === 'https:' && Boolean(parsed.host)
      } catch {
        return false
      }
    }
    if (scheme === 'h3' || scheme === 'quic' || scheme === 'sdns') return false
    const endpoint = server.slice(schemeEnd + 3).replace(/\/+$/, '')
    if (scheme === 'tls') return parseDNSEndpoint(endpoint, true)
    if (scheme === 'udp' || scheme === 'tcp') return parseDNSEndpoint(endpoint, false)
    return false
  }
  return parseDNSEndpoint(server, true)
}

export function isIPv4(value: string) {
  const parts = value.split('.')
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

export function isIPv6(value: string) {
  if (!value.includes(':')) return false
  try {
    new URL(`http://[${value}]/`)
    return true
  } catch {
    return false
  }
}

export function validCIDR(value: string, family: 4 | 6) {
  const [address, prefix, ...rest] = value.split('/')
  if (rest.length || prefix === '' || !/^\d+$/.test(prefix)) return false
  const length = Number(prefix)
  return family === 4
    ? isIPv4(address) && length >= 0 && length <= 32
    : isIPv6(address) && length >= 0 && length <= 128
}

export function isNetworkConfigValid(config: NetworkConfig) {
  if (!/^[A-Za-z0-9_.:@-]+$/.test(config.device) || config.route_metric < 0) return false
  if (config.discovery_enabled !== false && usesCustomDiscoveryURL(config) && !validDiscoveryURL(config.discovery_url ?? '')) return false
  if (!validMACAddress(config.mac_address)) return false
  if (ipv4ModeUsesStaticAddress(config.ipv4_mode)) {
    if (!validCIDR(config.ipv4_address, 4)) return false
    if (config.ipv4_gateway && !isIPv4(config.ipv4_gateway)) return false
  }
  if (config.ipv6_mode === 'static') {
    if (!validCIDR(config.ipv6_address, 6)) return false
    if (config.ipv6_gateway && !isIPv6(config.ipv6_gateway)) return false
  }
  if (usesCustomDNS(config) && (!(config.dns || []).length || !(config.dns || []).every((server) => isDNSServer(server)))) return false
  const names = new Set<string>()
  for (const wireGuard of config.wireguard || []) {
    if (!/^[A-Za-z0-9_.:@-]+$/.test(wireGuard.name) || wireGuard.name === config.device || names.has(wireGuard.name)) return false
    names.add(wireGuard.name)
    if ((wireGuard.private_key && !validWireGuardKey(wireGuard.private_key)) || !validWireGuardKey(wireGuard.public_key) ||
        wireGuard.listen_port < 0 || wireGuard.listen_port > 65535) return false
    if (!wireGuard.addresses.length || wireGuard.addresses.some((address) => !validCIDR(address, address.includes(':') ? 6 : 4))) return false
    for (const peer of wireGuard.peers) {
      if (!validWireGuardKey(peer.public_key) || (peer.preshared_key && !validWireGuardKey(peer.preshared_key))) return false
      if (!peer.allowed_ips.length || peer.allowed_ips.some((address) => !validCIDR(address, address.includes(':') ? 6 : 4))) return false
      if (peer.endpoint && !validEndpoint(peer.endpoint)) return false
      if (peer.persistent_keepalive < 0 || peer.persistent_keepalive > 65535) return false
    }
  }
  for (const networkInterface of config.interfaces || []) {
    if (!/^[A-Za-z0-9_.:@-]+$/.test(networkInterface.name) ||
        names.has(networkInterface.name) || networkInterface.name === config.device) return false
    names.add(networkInterface.name)
    if (networkInterface.kind === 'vlan') {
      if (networkInterface.parent !== config.device || networkInterface.vlan_id < 1 || networkInterface.vlan_id > 4094) return false
    } else if (networkInterface.kind === 'gre' || networkInterface.kind === 'ipip' || networkInterface.kind === 'sit' || networkInterface.kind === 'gretap') {
      if (!isIPv4(networkInterface.local || '') && !isIPv6(networkInterface.local || '')) return false
      if (!isIPv4(networkInterface.remote || '') && !isIPv6(networkInterface.remote || '')) return false
      if ((networkInterface.kind === 'gre' || networkInterface.kind === 'gretap') && networkInterface.key && !validTunnelKey(networkInterface.key)) return false
    } else if (networkInterface.kind === 'vxlan') {
      if ((networkInterface.vni || 0) < 1 || (networkInterface.vni || 0) > 16777215) return false
      if (!networkInterface.remote && !networkInterface.group) return false
      if (networkInterface.remote && !isIPv4(networkInterface.remote) && !isIPv6(networkInterface.remote)) return false
      if (networkInterface.group && !isIPv4(networkInterface.group) && !isIPv6(networkInterface.group)) return false
      if (networkInterface.port && (networkInterface.port < 1 || networkInterface.port > 65535)) return false
    } else if (networkInterface.kind === 'geneve') {
      if ((networkInterface.vni || 0) < 1 || (networkInterface.vni || 0) > 16777215) return false
      if (!networkInterface.remote || (!isIPv4(networkInterface.remote) && !isIPv6(networkInterface.remote))) return false
      if (networkInterface.port && (networkInterface.port < 1 || networkInterface.port > 65535)) return false
    } else if (networkInterface.kind === 'fou') {
      if (!(networkInterface.port && networkInterface.port >= 1 && networkInterface.port <= 65535)) return false
      if (!validFOUProtocol(networkInterface.protocol || '')) return false
      if (networkInterface.local && !isIPv4(networkInterface.local) && !isIPv6(networkInterface.local)) return false
      if (networkInterface.remote && !isIPv4(networkInterface.remote) && !isIPv6(networkInterface.remote)) return false
    } else if (networkInterface.kind === 'bareudp') {
      if (!(networkInterface.port && networkInterface.port >= 1 && networkInterface.port <= 65535)) return false
      if (!validBareUDPEtherType(networkInterface.ether_type || '')) return false
    } else {
      return false
    }
    if (ipv4ModeUsesStaticAddress(networkInterface.ipv4_mode) && (!validCIDR(networkInterface.ipv4_address, 4) ||
        (networkInterface.ipv4_gateway && !isIPv4(networkInterface.ipv4_gateway)))) return false
    if (networkInterface.ipv6_mode === 'static' && (!validCIDR(networkInterface.ipv6_address, 6) ||
        (networkInterface.ipv6_gateway && !isIPv6(networkInterface.ipv6_gateway)))) return false
		if (networkInterface.route_metric < 0) return false
	}
  for (const client of config.vpn || []) {
    if (!/^[A-Za-z0-9_.:@-]+$/.test(client.name) || names.has(client.name) || client.name === config.device) return false
    names.add(client.name)
    if (client.kind === 'openvpn') {
      if (!client.config?.trim()) {
        if (!client.remote?.trim()) return false
        const port = client.port || 1194
        if (port < 1 || port > 65535) return false
        const proto = (client.protocol || 'udp').toLowerCase()
        if (proto !== 'udp' && proto !== 'tcp') return false
      }
    } else if (client.kind === 'pppoe') {
      if (!client.username?.trim()) return false
    } else if (client.kind === 'pptp' || client.kind === 'l2tp') {
      if (!client.remote?.trim() || !client.username?.trim()) return false
    } else {
      return false
    }
  }
	const destinations = new Set<string>()
	const routeInterfaces = new Set([
		config.device,
		...(config.wireguard || []).map(({ name }) => name),
		...(config.interfaces || []).map(({ name }) => name),
    ...(config.vpn || []).map(({ name }) => name),
	])
	for (const route of config.static_routes || []) {
		const family = route.destination.includes(':') ? 6 : 4
		if (!validCIDR(route.destination, family) || (family === 4 ? !isIPv4(route.next_hop) : !isIPv6(route.next_hop))) return false
		if (route.interface && !routeInterfaces.has(route.interface)) return false
		if (route.metric < 0 || destinations.has(route.destination)) return false
		destinations.add(route.destination)
	}
  if (!validProxyURL(config.proxy?.http) || !validProxyURL(config.proxy?.https)) return false
  if (!validIceURL(config.webrtc?.stun, 'stun') || !validIceURL(config.webrtc?.turn, 'turn')) return false
  if (config.webrtc?.turn?.trim() && (!config.webrtc.turn_username?.trim() || !config.webrtc.turn_credential?.trim())) return false
  for (const server of config.webrtc?.turn_servers || []) {
    if (!validIceURL(server.url, 'turn') || !server.url.trim() || !server.username.trim() || !server.credential.trim()) return false
  }
  return true
}

export function validProxyURL(value: string | undefined) {
  const url = value?.trim()
  if (!url) return true
  try {
    const parsed = new URL(url)
    return ['http:', 'https:', 'socks5:', 'socks4:'].includes(parsed.protocol) && Boolean(parsed.host)
  } catch {
    return false
  }
}

export function validDiscoveryURL(value: string) {
  if (!value || value.length > 2048) return false
  try {
    const parsed = new URL(value)
    return ['http:', 'https:'].includes(parsed.protocol) && Boolean(parsed.hostname)
      && !parsed.username && !parsed.password
  } catch {
    return false
  }
}

export function validIceURL(value: string | undefined, kind: 'stun' | 'turn') {
  const urls = (value || '').split(/\r?\n/).map((url) => url.trim()).filter(Boolean)
  return urls.every((url) => {
    const lower = url.toLowerCase()
    if (kind === 'stun') return /^(stuns?:)?[^/\s]+$/.test(lower)
    return /^(turns?:)?[^/\s]+$/.test(lower)
  })
}

export function validMACAddress(value: string | undefined) {
  if (!value) return true
  if (!/^[0-9a-f]{2}(?::[0-9a-f]{2}){5}$/i.test(value)) return false
  const octets = value.split(':').map((octet) => Number.parseInt(octet, 16))
  return (octets[0] & 1) === 0 && octets.some((octet) => octet !== 0)
}

export function validHostname(value: string) {
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(value.trim())
}

export function validWireGuardKey(value: string) {
  try {
    return atob(value).length === 32
  } catch {
    return false
  }
}

export function validEndpoint(value: string) {
  if (/^\[[0-9a-fA-F:]+\]:\d+$/.test(value)) return Number(value.slice(value.lastIndexOf(':') + 1)) <= 65535
  const match = value.match(/^([^:\s]+):(\d+)$/)
  return !!match && Number(match[2]) >= 1 && Number(match[2]) <= 65535
}

function validTunnelKey(value: string) {
  if (/^\d+$/.test(value) && Number(value) <= 0xffffffff) return true
  return isIPv4(value)
}

function validFOUProtocol(value: string) {
  if (!value) return false
  if (['ipip', 'gre', 'sit', 'ip', 'ipv6', 'ipv4'].includes(value.toLowerCase())) return true
  return /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 255
}

function validBareUDPEtherType(value: string) {
  return ['ipv4', 'ipv6', 'mpls-uc', 'mpls-mc'].includes(value.toLowerCase())
}

/** Canonical product / protocol display names (not raw UPPERCASE). */
const NETWORK_KIND_LABELS: Record<string, string> = {
  wireguard: 'WireGuard',
  vlan: 'VLAN',
  gre: 'GRE',
  ipip: 'IPIP',
  sit: 'SIT',
  vxlan: 'VXLAN',
  geneve: 'Geneve',
  fou: 'FOU',
  bareudp: 'BareUDP',
  gretap: 'GRETAP',
  openvpn: 'OpenVPN',
  pppoe: 'PPPoE',
  pptp: 'PPTP',
  l2tp: 'L2TP',
}

export function networkKindLabel(kind: string): string {
  return NETWORK_KIND_LABELS[kind.toLowerCase()] || kind
}
