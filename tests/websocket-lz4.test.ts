import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const fixtures = JSON.parse(await readFile(new URL('./fixtures/pcm-lz4-v1.json', import.meta.url), 'utf8'))
const buffer = (base64: string) => Uint8Array.from(Buffer.from(base64, 'base64')).buffer
const server = await createServer({ configFile: false, root: fileURLToPath(new URL('..', import.meta.url)), optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, watch: null } })
try {
  const { decodeLz4PCM, WebSocketLz4Decoder } = await server.ssrLoadModule('/src/lib/websocket-lz4-decoder.ts')
  for (const frame of fixtures.frames) {
    assert.deepEqual(new Uint8Array(decodeLz4PCM(buffer(frame.lz4))), new Uint8Array(buffer(frame.pcm)), `${frame.name}: preserve every original PCM byte with reference LZ4 packets`)
  }
  const oversized = new ArrayBuffer(5)
  new DataView(oversized).setUint32(0, 65536, true)
  assert.throws(() => decodeLz4PCM(oversized), /size/)
  for (const invalid of [[], [0], [0xf0], [0, 0, 0], [0, 1, 0], [0, 255, 255]]) {
    const packet = new Uint8Array(4 + invalid.length)
    new DataView(packet.buffer).setUint32(0, 100, true)
    packet.set(invalid, 4)
    assert.throws(() => decodeLz4PCM(packet.buffer), /LZ4|PCM/)
  }
  const fixture = fixtures.frames[0]
  const truncated = buffer(fixture.lz4).slice(0, -1)
  assert.throws(() => decodeLz4PCM(truncated), /LZ4|PCM/)
  let outputs = 0
  let errors = 0
  const decoder = new WebSocketLz4Decoder(() => outputs++, () => errors++)
  decoder.decode(buffer(fixture.lz4))
  assert.equal(outputs, 1)
  decoder.decode(truncated)
  assert.equal(errors, 1)
  assert.equal(WebSocketLz4Decoder.supported(), false, 'Invalid compressed audio switches future connections to raw PCM')
  decoder.decode(buffer(fixture.lz4))
  assert.equal(outputs, 1, 'A failed or closed decoder never delivers stale sound')
  decoder.destroy()
  console.log('websocket-lz4 tests passed')
} finally {
  await server.close()
}
