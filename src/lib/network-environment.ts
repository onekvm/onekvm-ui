export const IP_TUNNELS_MARKETPLACE_ID = 'ip-tunnels'

const environmentCapabilities = {
  wireguard: 'wireguard',
  'ip-tunnels': 'ip_tunnels',
  openvpn: 'openvpn',
  pppoe: 'pppoe',
  pptp: 'pptp',
  l2tp: 'l2tp',
} as const

export type NetworkEnvironmentId = keyof typeof environmentCapabilities

export function networkEnvironmentAvailable(
  capabilities: Record<string, boolean> | undefined,
  id: NetworkEnvironmentId,
) {
  return capabilities?.[environmentCapabilities[id]] === true
}
