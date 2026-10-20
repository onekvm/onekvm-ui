import assert from 'node:assert/strict'
import { VideoTimingSampler } from '../src/lib/webrtc-video-timing.ts'

function clock(probe: Uint8Array, receiveUs: number, sendUs: number) {
  const data = new Uint8Array(21)
  data[0] = 2
  data.set(probe.subarray(1), 1)
  const view = new DataView(data.buffer)
  view.setBigUint64(5, BigInt(receiveUs * 1000))
  view.setBigUint64(13, BigInt(sendUs * 1000))
  return data
}
function frame(timestamp: number, encodedUs: number) {
  const data = new Uint8Array(13)
  data[0] = 3
  const view = new DataView(data.buffer)
  view.setUint32(1, timestamp)
  view.setBigUint64(5, BigInt(encodedUs * 1000))
  return data
}

const sampler = new VideoTimingSampler()
assert.deepEqual(sampler.sample(0), { transportUs: null, transportErrorUs: null })
// Unrelated clocks, a 4 ms server processing interval, and 6 ms each way.
const offset = 9_000_000
const probe = sampler.probe(100_000)
sampler.message(clock(probe, offset + 106_000, offset + 110_000), 116_000)
sampler.message(frame(0xffffffff, offset + 200_000), 290_000)
sampler.frame({ rtpTimestamp: 0xffffffff, receiveTime: 280 }, 300_000)
assert.deepEqual(sampler.sample(301_000), { transportUs: 80_000, transportErrorUs: 6000 })
// Telemetry may arrive after the frame callback, including across RTP wrap.
sampler.frame({ rtpTimestamp: 0, receiveTime: 480 }, 490_000)
sampler.message(frame(0, offset + 400_000), 550_000)
assert.equal(sampler.sample(551_000).transportUs, 80_000)
// A congested timing channel must not replace the better clock estimate.
const congested = sampler.probe(600_000)
sampler.message(clock(congested, offset + 630_000, offset + 630_000), 700_000)
assert.equal(sampler.sample(701_000).transportUs, 80_000)
// Missing browser timestamps, unpaired frames and malformed replies give no data.
sampler.resetFrames()
sampler.frame({ receiveTime: 800 }, 810_000)
sampler.message(frame(10, offset + 750_000), 820_000)
sampler.message(new Uint8Array([2]), 830_000)
assert.equal(sampler.sample(840_000).transportUs, null)
// A negative clock-adjusted interval is unknown, rather than a fake zero.
sampler.message(frame(20, offset + 1_000_000), 900_000)
sampler.frame({ rtpTimestamp: 20, receiveTime: 900 }, 910_000)
assert.equal(sampler.sample(920_000).transportUs, null)
// Browser pause/network stalls cannot leave an old number on screen forever.
assert.equal(sampler.sample(30_000_000).transportUs, null)

console.log('webrtc-video-timing tests passed')
