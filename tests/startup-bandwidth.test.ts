import assert from 'node:assert/strict'
import { StartupBandwidthProbe } from '../src/lib/startup-bandwidth.ts'
const sent: ArrayBuffer[] = []
const probe = new StartupBandwidthProbe(data => sent.push(data))
function chunk(id: number, total: number) {
  const data = new ArrayBuffer(16384)
  new Uint8Array(data).set([0x4f, 0x4b, 0x42, 0x50])
  new DataView(data).setUint32(4, id, true)
  new DataView(data).setUint32(8, total, true)
  return data
}
assert.equal(probe.receive(new Uint8Array([0x4f, 0x4b, 0x56, 0x46]).buffer), false)
assert.equal(probe.receive(chunk(1, 32768)), true)
assert.equal(sent.length, 0)
probe.receive(chunk(1, 32768))
assert.equal(sent.length, 1)
assert.equal(new DataView(sent[0]).getUint32(8, true), 32768)
assert.equal(new DataView(sent[0]).getUint32(4, true), 1)
probe.receive(chunk(1, 32768))
assert.equal(sent.length, 1)
for (let i = 0; i < 4; i++) probe.receive(chunk(2, 65536))
assert.equal(sent.length, 2)
const result = new ArrayBuffer(8)
new Uint8Array(result).set([0x4f, 0x4b, 0x42, 0x45])
new DataView(result).setUint32(4, 1600, true)
probe.receive(result)
assert.equal(probe.capKbps, 1600)
new DataView(result).setUint32(4, 0, true)
probe.receive(result)
assert.equal(probe.capKbps, null)
console.log('Startup bandwidth probe tests passed')
