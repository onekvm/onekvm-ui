import type { WifiIpConfig, WifiProfileSettings } from '@/api/client'
import { ipv4ModeUsesStaticAddress, isIPv4, isIPv6, validCIDR } from './network.ts'

export function defaultWifiIpConfig(): WifiIpConfig {
  return { ipv4_mode: 'dhcp', ipv4_address: '', ipv4_gateway: '', ipv6_mode: 'slaac',
    ipv6_address: '', ipv6_gateway: '', route_metric: 200 }
}

export function wifiIpConfigValid(ip: WifiIpConfig): boolean {
  return ['disabled', 'dhcp', 'dhcp-static', 'static'].includes(ip.ipv4_mode)
    && ['disabled', 'slaac', 'dhcp', 'static'].includes(ip.ipv6_mode)
    && Number.isInteger(ip.route_metric) && ip.route_metric >= 0
    && (!ipv4ModeUsesStaticAddress(ip.ipv4_mode) || (validCIDR(ip.ipv4_address, 4) && (!ip.ipv4_gateway || isIPv4(ip.ipv4_gateway))))
    && (ip.ipv6_mode !== 'static' || (validCIDR(ip.ipv6_address, 6) && (!ip.ipv6_gateway || isIPv6(ip.ipv6_gateway))))
}

export function wifiProfileError(profile: WifiProfileSettings, existing: boolean): string {
  if (profile.ip && !wifiIpConfigValid(profile.ip)) return 'ip'
  if (!profile.ssid || new TextEncoder().encode(profile.ssid).length > 32 || /[\x00-\x1f\x7f]/.test(profile.ssid)) return 'ssid'
  if (!existing && profile.password === undefined) return 'password'
  if (profile.password && (new TextEncoder().encode(profile.password).length < 8 || new TextEncoder().encode(profile.password).length > 63 || /[\x00-\x1f\x7f-\x9f]/.test(profile.password))) return 'password'
  if (!Number.isInteger(profile.priority) || profile.priority < 0 || profile.priority > 999) return 'priority'
  if (profile.bssid && (!/^(?:[\da-f]{2}:){5}[\da-f]{2}$/i.test(profile.bssid) || (parseInt(profile.bssid.slice(0, 2), 16) & 1) !== 0 || profile.bssid === '00:00:00:00:00:00')) return 'bssid'
  return ''
}
