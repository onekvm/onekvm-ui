import assert from 'node:assert/strict'
import type { WifiStatus } from '../src/api/client.ts'
import { apPowerLimit, defaultWifiApRadio, wifiApRadioError } from '../src/lib/wifi-ap-radio.ts'
const status = {
  ap_channels: [1, 5, 6, 7, 11, 36, 40, 44, 48, 149, 153, 157, 161, 165],
  ap_radio_capabilities: [
    { band: '2.4', standards: ['legacy', 'n', 'ax'], channel_widths: [20, 40], tx_power_limits: { 1: 20, 5: 20, 6: 20, 7: 20, 11: 20 } },
    { band: '5', standards: ['legacy', 'n', 'ac', 'ax'], channel_widths: [20, 40, 80], tx_power_limits: { 36: 20, 40: 20, 44: 17, 48: 20, 149: 20, 153: 20, 157: 20, 161: 20, 165: 20 } },
  ],
} satisfies Pick<WifiStatus, 'ap_channels' | 'ap_radio_capabilities'>
const base = defaultWifiApRadio()
assert.equal(wifiApRadioError(status, '2.4', 6, base), '')
assert.equal(wifiApRadioError(status, '2.4', 6, { ...base, standard: 'ac' }), 'apStandardInvalid')
assert.equal(wifiApRadioError(status, '2.4', 6, { ...base, channel_width: 80 }), 'apWidthInvalid')
assert.equal(wifiApRadioError(status, '5', 36, { ...base, channel_width: 80 }), '')
assert.equal(wifiApRadioError(status, '5', 165, { ...base, channel_width: 80 }), 'apWidthInvalid')
assert.equal(wifiApRadioError(status, '5', 165, { ...base, channel_width: 40 }), 'apWidthInvalid')
assert.equal(wifiApRadioError(status, '5', 0, { ...base, channel_width: 80 }), 'apWideFixedChannel')
assert.equal(wifiApRadioError(status, '5', 36, { ...base, standard: 'n', channel_width: 80 }), 'apWidthInvalid')
assert.equal(wifiApRadioError(status, '2.4', 6, { ...base, standard: 'legacy', channel_width: 40 }), 'apWidthInvalid')
assert.equal(wifiApRadioError(status, '5', 36, { ...base, tx_power_dbm: 21 }), 'apPowerInvalid')
assert.equal(wifiApRadioError(status, '5', 0, { ...base, tx_power_dbm: 18 }), 'apPowerInvalid')
assert.equal(wifiApRadioError(status, '5', 36, { ...base, tx_power_dbm: 18 }), '')
assert.equal(apPowerLimit(status, '5', 0), 17)
assert.equal(apPowerLimit(status, '5', 36), 20)
assert.equal(apPowerLimit({ ap_channels: [], ap_radio_capabilities: [] }, '5', 36), null)
console.log('AP standards, bandwidth and transmit-power constraints passed')
