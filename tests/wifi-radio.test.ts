import assert from 'node:assert/strict'
import { apBands, apChannels, normalizeApChannel, validApChannel } from '../src/lib/wifi-radio.ts'

for (const [channels, bands] of [ [[1, 3, 6, 11], ['2.4']], [[36, 40], ['5']], [[1, 6, 36], ['2.4', '5']], [[], []] ] as const) {
  assert.deepEqual(apBands({ ap_channels: [...channels] }), bands)
}
assert.deepEqual(apChannels({}), [1, 6, 11])
assert.deepEqual(apChannels({ ap_channels: [] }), [])
assert.equal(validApChannel({ ap_channels: [] }, '2.4', 0), false)
assert.equal(validApChannel({ ap_channels: [36] }, '2.4', 0), false)
assert.equal(validApChannel({ ap_channels: [36] }, '5', 0), true)
assert.equal(validApChannel({ ap_channels: [36] }, '2.4', 36), false)
assert.deepEqual(normalizeApChannel({ ap_channels: [36] }, '2.4', 6), { band: '5', channel: 0 })
assert.deepEqual(normalizeApChannel({ ap_channels: [1, 3] }, '5', 36), { band: '2.4', channel: 0 })
assert.deepEqual(normalizeApChannel({ ap_channels: [36, 40] }, '5', 40), { band: '5', channel: 40 })
console.log('Wi-Fi single/dual band and unavailable channel checks passed')
