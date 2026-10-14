import assert from 'node:assert/strict'
import { defaultWifiApNetwork, wifiApNetworkError } from '../src/lib/wifi-ap-network.ts'

assert.equal(wifiApNetworkError(defaultWifiApNetwork), null)
assert.equal(wifiApNetworkError({ address: '10.42.3.129/25', dhcp_start: '10.42.3.150', dhcp_end: '10.42.3.200' }), null)
assert.equal(wifiApNetworkError({ address: '192.168.77.1/30', dhcp_start: '192.168.77.2', dhcp_end: '192.168.77.2' }), null)
for (const address of ['192.168.77.0/24', '192.168.77.255/24', '192.168.77.1/31', '192.168.77.1/0', '192.168.77.1/33', '192.168.77.1/-1', '192.168.77.1/+24', '127.0.0.1/24', '224.0.0.1/24', '8.8.8.1/24', '172.16.0.1/8', '192.168.77.1/24\nDNS=8.8.8.8', '192.168.077.1/24']) {
  assert.equal(wifiApNetworkError({ ...defaultWifiApNetwork, address }), 'apAddressInvalid', address)
}
for (const [dhcp_start, dhcp_end] of [['192.168.76.200', '192.168.77.199'], ['192.168.77.100', '192.168.78.1'], ['192.168.77.0', '192.168.77.100'], ['192.168.77.100', '192.168.77.255'], ['192.168.77.199', '192.168.77.100'], ['invalid', '192.168.77.100']]) {
  assert.equal(wifiApNetworkError({ ...defaultWifiApNetwork, dhcp_start, dhcp_end }), 'apRangeInvalid')
}
assert.equal(wifiApNetworkError({ ...defaultWifiApNetwork, dhcp_start: '192.168.77.1' }), 'apRangeIncludesAddress')

assert.equal(wifiApNetworkError({ ...defaultWifiApNetwork, dhcp_enabled: false, address: '10.42.3.129/25' }), null)
assert.equal(wifiApNetworkError({ ...defaultWifiApNetwork, dhcp_enabled: false, dhcp_start: 'invalid', dhcp_end: '' }), null)
assert.equal(wifiApNetworkError({ ...defaultWifiApNetwork, dhcp_enabled: true, address: '10.42.3.129/25' }), 'apRangeInvalid')
assert.equal(wifiApNetworkError({ ...defaultWifiApNetwork, dhcp_enabled: false, address: '8.8.8.1/24' }), 'apAddressInvalid')
console.log('AP address, DHCP range and DHCP toggle validation passed')
