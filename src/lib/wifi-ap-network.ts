export interface WifiApNetwork {
  address: string
  dhcp_enabled?: boolean
  dhcp_start: string
  dhcp_end: string
}

export const defaultWifiApNetwork: WifiApNetwork = {
  address: '192.168.77.1/24',
  dhcp_enabled: true,
  dhcp_start: '192.168.77.100',
  dhcp_end: '192.168.77.199',
}

function ipv4(value: string): number | null {
  if (!/^(0|[1-9]\d{0,2})(\.(0|[1-9]\d{0,2})){3}$/.test(value)) return null
  const octets = value.split('.').map(Number)
  if (octets.some((octet) => octet > 255)) return null
  return octets.reduce((address, octet) => address * 256 + octet, 0)
}

function privateAddress(address: number): boolean {
  return address >= 0x0a000000 && address <= 0x0affffff
    || address >= 0xac100000 && address <= 0xac1fffff
    || address >= 0xc0a80000 && address <= 0xc0a8ffff
}

export function wifiApNetworkError(network: WifiApNetwork): 'apAddressInvalid' | 'apRangeInvalid' | 'apRangeIncludesAddress' | null {
  const parts = network.address.split('/')
  const address = ipv4(parts[0] || '')
  const prefix = Number(parts[1])
  if (parts.length !== 2 || !/^\d+$/.test(parts[1] || '')
    || address === null || prefix < 8 || prefix > 30) return 'apAddressInvalid'
  const size = 2 ** (32 - prefix)
  const subnet = Math.floor(address / size) * size
  const broadcast = subnet + size - 1
  if (!privateAddress(subnet) || !privateAddress(broadcast)
    || address <= subnet || address >= broadcast) return 'apAddressInvalid'
  if (network.dhcp_enabled === false) return null
  const start = ipv4(network.dhcp_start)
  const end = ipv4(network.dhcp_end)
  if (start === null || end === null || start <= subnet || end >= broadcast || start > end) return 'apRangeInvalid'
  if (start <= address && address <= end) return 'apRangeIncludesAddress'
  return null
}
