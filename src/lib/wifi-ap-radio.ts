import type { WifiApRadioConfig, WifiApStandard, WifiStatus } from '@/api/client'
import { apChannels } from './wifi-radio.ts'

export function defaultWifiApRadio(): WifiApRadioConfig {
  return { standard: 'auto', channel_width: 0, tx_power_dbm: null }
}
export const wifiApStandardLabels: Record<WifiApStandard, string> = {
  auto: 'Auto', legacy: 'Legacy (802.11a/b/g)', n: 'Wi-Fi 4 (802.11n)', ac: 'Wi-Fi 5 (802.11ac)', ax: 'Wi-Fi 6 (802.11ax)',
}

export function apPowerLimit(status: Pick<WifiStatus, 'ap_channels' | 'ap_radio_capabilities'>, band: '2.4' | '5', channel: number): number | null {
  const cap = status.ap_radio_capabilities?.find(c => c.band === band)
  const channels = apChannels(status).filter(c => (c > 14) === (band === '5') && (!channel || c === channel))
  const limits = channels.map(c => cap?.tx_power_limits[c])
  return limits.length && limits.every((p): p is number => p !== undefined) ? Math.min(...limits) : null
}

export function wifiApRadioError(status: Pick<WifiStatus, 'ap_channels' | 'ap_radio_capabilities'> | null, band: '2.4' | '5', channel: number, radio: WifiApRadioConfig): string {
  if (!status?.ap_radio_capabilities) return '' // Older Core has no configurable radio policy.
  const cap = status.ap_radio_capabilities.find(c => c.band === band)
  const standard = radio.standard === 'auto' ? cap?.standards.at(-1) : radio.standard
  if (!standard || !cap?.standards.includes(standard)) return 'apStandardInvalid'
  const width = radio.channel_width || 20
  if (!cap.channel_widths.includes(width) || (standard === 'legacy' && width !== 20) || (standard === 'n' && width > 40)) return 'apWidthInvalid'
  if (width > 20 && channel === 0) return 'apWideFixedChannel'
  const channels = apChannels(status)
  if (width === 40) {
    const offset = channel <= 14 ? (channel <= 7 ? 4 : -4) : channel < 149 ? (channel % 8 === 4 ? 4 : -4) : ((channel - 149) % 8 === 0 ? 4 : -4)
    if (!channels.includes(channel + offset) && !(channel <= 14 && channels.includes(channel - offset))) return 'apWidthInvalid'
  }
  if (width === 80 && ![36, 149].some(first => channel >= first && channel <= first + 12 && (channel - first) % 4 === 0 && [first, first + 4, first + 8, first + 12].every(c => channels.includes(c)))) return 'apWidthInvalid'
  const max = apPowerLimit(status, band, channel)
  if (radio.tx_power_dbm !== null && (max === null || !Number.isInteger(radio.tx_power_dbm) || radio.tx_power_dbm < 0 || radio.tx_power_dbm > max)) return 'apPowerInvalid'
  return ''
}
