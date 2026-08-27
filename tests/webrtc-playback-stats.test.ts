import assert from 'node:assert/strict'

import {
  PlaybackStatsSampler,
  iceRttSeconds,
  samplePlaybackStats,
} from '../src/lib/webrtc-playback-stats.ts'

function videoInbound(overrides: Record<string, unknown> = {}): RTCStats {
  return {
    id: 'inbound-video',
    type: 'inbound-rtp',
    timestamp: 1_000,
    kind: 'video',
    bytesReceived: 10_000,
    jitterBufferDelay: 0.24,
    jitterBufferEmittedCount: 20,
    totalDecodeTime: 0.08,
    framesDecoded: 20,
    ...overrides,
  } as unknown as RTCStats
}

const nominatedPair = {
  id: 'pair-1',
  type: 'candidate-pair',
  timestamp: 1_000,
  nominated: true,
  state: 'succeeded',
  currentRoundTripTime: 0.015,
  localCandidateId: 'local',
  remoteCandidateId: 'remote',
  transportId: 't',
} as unknown as RTCStats

assert.equal(iceRttSeconds([nominatedPair]), 0.015)
assert.equal(
  iceRttSeconds([
    {
      ...nominatedPair,
      nominated: false,
      currentRoundTripTime: 0.04,
    } as unknown as RTCStats,
    nominatedPair,
  ]),
  0.015,
)

const first = samplePlaybackStats([videoInbound(), nominatedPair], null)
assert.equal(first.bitrateKbps, 0)
assert.equal(first.latency.iceRttUs, 15_000)
assert.equal(first.jitterSampled, false)

const second = samplePlaybackStats(
  [
    videoInbound({
      timestamp: 2_000,
      bytesReceived: 20_000,
      jitterBufferDelay: 0.36,
      jitterBufferEmittedCount: 30,
      totalDecodeTime: 0.12,
      framesDecoded: 30,
    }),
    nominatedPair,
  ],
  first.snapshot,
)
assert.equal(second.bitrateKbps, 80)
assert.equal(second.latency.iceRttUs, 15_000)
assert.equal(second.latency.jitterBufferUs, 12_000)
assert.equal(second.latency.decodeUs, 4_000)
assert.equal(second.jitterSampled, true)
assert.equal(second.decodeSampled, true)

const sampler = new PlaybackStatsSampler()
sampler.sample([videoInbound(), nominatedPair])
const held = sampler.sample([
  videoInbound({
    timestamp: 2_000,
    bytesReceived: 12_000,
    jitterBufferDelay: 0.24,
    jitterBufferEmittedCount: 20,
    totalDecodeTime: 0.08,
    framesDecoded: 20,
  }),
  nominatedPair,
])
assert.equal(held.latency.jitterBufferUs, 0)
assert.equal(held.latency.decodeUs, 0)

const filled = sampler.sample([
  videoInbound({
    timestamp: 3_000,
    bytesReceived: 22_000,
    jitterBufferDelay: 0.36,
    jitterBufferEmittedCount: 30,
    totalDecodeTime: 0.12,
    framesDecoded: 30,
  }),
  nominatedPair,
])
assert.equal(filled.latency.jitterBufferUs, 12_000)
const stalled = sampler.sample([
  videoInbound({
    timestamp: 4_000,
    bytesReceived: 22_000,
    jitterBufferDelay: 0.36,
    jitterBufferEmittedCount: 30,
    totalDecodeTime: 0.12,
    framesDecoded: 30,
  }),
  nominatedPair,
])
assert.equal(stalled.latency.jitterBufferUs, 12_000)
assert.equal(stalled.latency.decodeUs, 4_000)

const reset = sampler.reset()
assert.equal(reset.iceRttUs, 0)
assert.equal(reset.jitterBufferUs, 0)

function audioInbound(overrides: Record<string, unknown> = {}): RTCStats {
  return {
    id: 'inbound-audio',
    type: 'inbound-rtp',
    timestamp: 1_000,
    kind: 'audio',
    bytesReceived: 1_200,
    packetsReceived: 50,
    jitterBufferDelay: 0.1,
    jitterBufferEmittedCount: 50,
    ...overrides,
  } as unknown as RTCStats
}

const audioSampler = new PlaybackStatsSampler()
audioSampler.sample([audioInbound(), nominatedPair])
const audioNext = audioSampler.sample([
  audioInbound({
    timestamp: 2_000,
    bytesReceived: 13_200,
    packetsReceived: 100,
    jitterBufferDelay: 0.16,
    jitterBufferEmittedCount: 100,
  }),
  nominatedPair,
])
assert.equal(audioNext.audio.bitrateKbps, 96)
assert.equal(audioNext.audio.packetsPerSecond, 50)
assert.equal(audioNext.audio.jitterBufferUs, 1_200)

console.log('webrtc-playback-stats tests passed')
