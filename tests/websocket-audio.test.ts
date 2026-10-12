import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { microphonePCMFrame, parsePCMAudioFrame, parseOpusAudioFrame } from '../src/lib/websocket-audio-protocol.ts'

const pcm = new ArrayBuffer(1920)
new DataView(pcm).setInt16(0, -32768, true)
const frame = microphonePCMFrame(pcm, 123n, 456789)
assert.deepEqual(parsePCMAudioFrame(frame), { sequence: 123n, sampleRate: 48000, channels: 1, samples: 960, payloadBytes: 1920 })
assert.equal(new DataView(frame).getBigUint64(16), 456789n)
assert.equal(new DataView(frame).getInt16(32, true), -32768)
assert.equal(parsePCMAudioFrame(frame.slice(0, -1)), null)
for (const [offset, value] of [[4, 2], [5, 3], [6, 0], [6, 3], [7, 1]]) {
  const invalid = frame.slice(0)
  new Uint8Array(invalid)[offset!] = value!
  assert.equal(parsePCMAudioFrame(invalid), null)
}
const oddLength = microphonePCMFrame(new ArrayBuffer(3), 0n, 0)
assert.equal(parsePCMAudioFrame(oddLength), null)
assert.equal(parsePCMAudioFrame(microphonePCMFrame(new ArrayBuffer(9602), 0n, 0)), null, 'Frames larger than 100ms are rejected')
const opusFrame = microphonePCMFrame(new Uint8Array([0xf8, 0xff, 0xfe]).buffer, 7n, 123456)
new Uint8Array(opusFrame)[5] = 2
new Uint8Array(opusFrame)[6] = 2
assert.deepEqual(parseOpusAudioFrame(opusFrame), { sequence: 7n, ptsUs: 123456, sampleRate: 48000, channels: 2, payloadBytes: 3 })
assert.equal(parsePCMAudioFrame(opusFrame), null)
assert.equal(parseOpusAudioFrame(frame), null)
assert.equal(parseOpusAudioFrame(opusFrame.slice(0, -1)), null)

const code = await readFile(new URL('../src/lib/websocket-audio-worklet.js', import.meta.url), 'utf8')
function processors(rate: number) {
  const registered = new Map<string, new () => any>()
  class Processor {
    port = { onmessage: null as any, messages: [] as any[], postMessage(data: any) { this.messages.push(data) } }
  }
  runInNewContext(code, { AudioWorkletProcessor: Processor, sampleRate: rate, registerProcessor: (name: string, value: new () => any) => registered.set(name, value) })
  return registered
}
const registered = processors(48000)
const Playback = registered.get('onekvm-pcm-playback')!
const playback = new Playback()
const stereo = new ArrayBuffer(960 * 4)
const stereoView = new DataView(stereo)
for (let index = 0; index < 960; index++) {
  stereoView.setInt16(index * 4, 16384, true)
  stereoView.setInt16(index * 4 + 2, -8192, true)
}
const stereoFrame = microphonePCMFrame(stereo, 0n, 0)
new Uint8Array(stereoFrame)[6] = 2
playback.port.onmessage({ data: { type: 'audio', buffer: stereoFrame, channels: 2, sampleRate: 48000 } })
const output = [new Float32Array(128), new Float32Array(128)]
playback.process([], [output])
assert.ok(output[0]!.every(sample => sample === 0.5), 'Left PCM channel preserves sample order and endianness')
assert.ok(output[1]!.every(sample => sample === -0.25), 'Stereo channels remain independent')
for (let burst = 0; burst < 50; burst++) playback.port.onmessage({ data: { type: 'audio', buffer: stereoFrame, channels: 2, sampleRate: 48000 } })
assert.ok(playback.queued <= 3840, 'A TCP burst cannot accumulate more than 80ms of sound')
assert.ok(playback.dropped > 0, 'Old audio is discarded when the live edge advances')
playback.port.onmessage({ data: { type: 'flush' } })
playback.process([], [output])
assert.ok(output.every(channel => channel.every(sample => sample === 0)), 'A reconnect flushes the previous connection’s sound')
playback.port.onmessage({ data: { type: 'decoded', planes: [new Float32Array(960).fill(0.5), new Float32Array(960).fill(-0.25)], sampleRate: 48000, reset: true } })
playback.process([], [output])
assert.ok(output[0]!.every(sample => sample === 0.5), 'Decoded Opus feeds the same audio render clock')
assert.ok(output[1]!.every(sample => sample === -0.25), 'Decoded stereo is not mixed to mono')

for (const rate of [44100, 48000]) {
  const Capture = processors(rate).get('onekvm-pcm-capture')!
  const capture = new Capture()
  const input = new Float32Array(rate).fill(2)
  capture.process([[input]])
  const samples = capture.port.messages.length * 960 + capture.frames
  assert.ok(Math.abs(samples - 48000) <= 2, 'Microphone output keeps a 48kHz clock even at 44.1kHz')
  assert.ok(capture.port.messages.every((packet: ArrayBuffer) => packet.byteLength === 1920))
  assert.equal(new DataView(capture.port.messages[0]).getInt16(0, true), 32767, 'Microphone gain cannot overflow signed PCM')
}
console.log('websocket-audio protocol/worklet tests passed')
