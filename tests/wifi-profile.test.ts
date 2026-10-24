import assert from 'node:assert/strict'
import { defaultWifiIpConfig, wifiProfileError } from '../src/lib/wifi-profile.ts'
const profile = { interface: 'wlan1', ssid: 'Wi-Fi', password: 'password', auto_connect: true, priority: 200, hidden: false, band: '', bssid: '' }
assert.equal(wifiProfileError(profile, false), '')
assert.equal(wifiProfileError({ ...profile, ssid: '界'.repeat(11) }, false), 'ssid')
assert.equal(wifiProfileError({ ...profile, password: undefined }, false), 'password')
assert.equal(wifiProfileError({ ...profile, password: undefined }, true), '')
assert.equal(wifiProfileError({ ...profile, password: '' }, false), '')
assert.equal(wifiProfileError({ ...profile, password: 'short' }, false), 'password')
assert.equal(wifiProfileError({ ...profile, priority: 0.1 }, false), 'priority')
assert.equal(wifiProfileError({ ...profile, bssid: 'a2:05:d6:62:e6:43' }, true), '')
assert.equal(wifiProfileError({ ...profile, bssid: 'ff:ff:ff:ff:ff:ff' }, true), 'bssid')
assert.equal(wifiProfileError({ ...profile, bssid: '00:00:00:00:00:00' }, true), 'bssid')
assert.equal(wifiProfileError({ ...profile, password: '中文密码' }, false), '')
assert.equal(wifiProfileError({ ...profile, password: '界'.repeat(22) }, false), 'password')
console.log('Wi-Fi profile validation passed')

const automatic = defaultWifiIpConfig()
for (const mode of ['dhcp', 'dhcp-static', 'static'] as const) {
  const ip = { ...automatic, ipv4_mode: mode, ipv4_address: mode === 'dhcp' ? '' : '192.0.2.80/24' }
  assert.equal(wifiProfileError({ ...profile, ip }, false), '')
  if (mode !== 'dhcp') {
    assert.equal(wifiProfileError({ ...profile, ip: { ...ip, ipv4_address: '' } }, false), 'ip')
    assert.equal(wifiProfileError({ ...profile, ip: { ...ip, ipv4_gateway: 'bad' } }, false), 'ip')
  }
}
const office = { ...profile, ip: { ...automatic, ipv4_mode: 'static' as const, ipv4_address: '192.0.2.80/24' } }
const guest = { ...profile, ssid: 'Guest', ip: defaultWifiIpConfig() }
assert.equal(guest.ip.ipv4_mode, 'dhcp', 'new hotspots do not inherit another hotspot IP policy')
assert.equal(office.ip.ipv4_mode, 'static')
assert.equal(wifiProfileError({ ...profile, ip: { ...automatic, ipv6_mode: 'static', ipv6_address: '2001:db8::80/64' } }, false), '')
assert.equal(wifiProfileError({ ...profile, ip: { ...automatic, ipv6_mode: 'static', ipv6_address: '192.0.2.80/24' } }, false), 'ip')
