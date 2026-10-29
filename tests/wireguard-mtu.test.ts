import assert from 'node:assert/strict'
import { createWireGuardInterface, serializeWireGuardConfig, parseWireGuardConfig } from '../src/lib/wireguard-config.ts'
const current = { ...createWireGuardInterface('wg0'), mtu: 1380 }
const text = serializeWireGuardConfig(current)
assert.match(text, /MTU = 1380/)
assert.equal(parseWireGuardConfig(text, current).mtu, 1380)
assert.equal(parseWireGuardConfig(text.replace('MTU = 1380', 'MTU = 0'), current).mtu, 0)
assert.throws(() => parseWireGuardConfig(text.replace('MTU = 1380', 'MTU = 65536'), current))
assert.throws(() => parseWireGuardConfig(text.replace('MTU = 1380', 'MTU = 67'), current))
assert.throws(() => parseWireGuardConfig(text.replace('MTU = 1380', 'MTU = 1279').replace('Address = 10.10.0.1/24', 'Address = fd00::1/64'), current))
console.log('WireGuard MTU roundtrip tests passed')
