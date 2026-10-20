import assert from 'node:assert/strict'
import { wifiErrorText } from '../src/lib/wifi-error.ts'

const translate = (key: string) => `translated:${key}`
assert.equal(wifiErrorText('Wi-Fi association timed out; previous saved networks restored', translate),
  'translated:network.wifi.connectionTimeout', 'polling and request failures can use the same timeout translation')
assert.equal(wifiErrorText('Wi-Fi connection already in progress', translate), 'translated:network.wifi.connectionInProgress')
for (const diagnostic of ['', 'Driver unavailable', 'Wi-Fi association timed out: unexpected driver failure']) {
  assert.equal(wifiErrorText(diagnostic, translate), diagnostic, 'unknown failures retain diagnostic details')
}
