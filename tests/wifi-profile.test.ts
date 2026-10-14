import assert from 'node:assert/strict'
import { wifiProfileError } from '../src/lib/wifi-profile.ts'
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
