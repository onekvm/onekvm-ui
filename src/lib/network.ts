import type { NetworkConfig } from '@/api/client'

export function defaultNetworkConfig(): NetworkConfig {
  return {
    device: 'eth0',
    mac_address: '',
    ipv4_mode: 'dhcp',
    ipv4_address: '',
    ipv4_gateway: '',
    dns: [],
    ipv6_enabled: true,
    ipv6_mode: 'slaac',
    ipv6_address: '',
    ipv6_gateway: '',
    route_metric: 100,
		static_routes: [],
    wifi_ssid: '',
    hostname: '',
    http_port: 80,
    https_port: 443,
    tls_enabled: true,
    tls_auto_redirect: true,
    tls_cert_path: '/etc/onekvm/tls/server.crt',
    tls_key_path: '/etc/onekvm/tls/server.key',
    wireguard: [],
    interfaces: [],
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
  }
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
  if (!validMACAddress(config.mac_address)) return false
  if (config.ipv4_mode === 'static') {
    if (!validCIDR(config.ipv4_address, 4)) return false
    if (config.ipv4_gateway && !isIPv4(config.ipv4_gateway)) return false
  }
  if (config.ipv6_mode === 'static') {
    if (!validCIDR(config.ipv6_address, 6)) return false
    if (config.ipv6_gateway && !isIPv6(config.ipv6_gateway)) return false
  }
  if (!(config.dns || []).every((server) => isIPv4(server) || isIPv6(server))) return false
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
    if (networkInterface.kind !== 'vlan' || !/^[A-Za-z0-9_.:@-]+$/.test(networkInterface.name) ||
        names.has(networkInterface.name) || networkInterface.name === config.device ||
        networkInterface.parent !== config.device || networkInterface.vlan_id < 1 || networkInterface.vlan_id > 4094) return false
    names.add(networkInterface.name)
    if (networkInterface.ipv4_mode === 'static' && (!validCIDR(networkInterface.ipv4_address, 4) ||
        (networkInterface.ipv4_gateway && !isIPv4(networkInterface.ipv4_gateway)))) return false
    if (networkInterface.ipv6_mode === 'static' && (!validCIDR(networkInterface.ipv6_address, 6) ||
        (networkInterface.ipv6_gateway && !isIPv6(networkInterface.ipv6_gateway)))) return false
		if (networkInterface.route_metric < 0) return false
	}
	const destinations = new Set<string>()
	const routeInterfaces = new Set([
		config.device,
		...(config.wireguard || []).map(({ name }) => name),
		...(config.interfaces || []).map(({ name }) => name),
	])
	for (const route of config.static_routes || []) {
		const family = route.destination.includes(':') ? 6 : 4
		if (!validCIDR(route.destination, family) || (family === 4 ? !isIPv4(route.next_hop) : !isIPv6(route.next_hop))) return false
		if (route.interface && !routeInterfaces.has(route.interface)) return false
		if (route.metric < 0 || destinations.has(route.destination)) return false
		destinations.add(route.destination)
	}
  return true
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
