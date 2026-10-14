import type { WifiProfileSettings } from '@/api/client'

export function wifiProfileError(profile: WifiProfileSettings, existing: boolean): string {
  if (!profile.ssid || new TextEncoder().encode(profile.ssid).length > 32 || /[\x00-\x1f\x7f]/.test(profile.ssid)) return 'ssid'
  if (!existing && profile.password === undefined) return 'password'
  if (profile.password && (new TextEncoder().encode(profile.password).length < 8 || new TextEncoder().encode(profile.password).length > 63 || /[\x00-\x1f\x7f-\x9f]/.test(profile.password))) return 'password'
  if (!Number.isInteger(profile.priority) || profile.priority < 0 || profile.priority > 999) return 'priority'
  if (profile.bssid && (!/^(?:[\da-f]{2}:){5}[\da-f]{2}$/i.test(profile.bssid) || (parseInt(profile.bssid.slice(0, 2), 16) & 1) !== 0 || profile.bssid === '00:00:00:00:00:00')) return 'bssid'
  return ''
}
