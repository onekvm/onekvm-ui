import assert from 'node:assert/strict'

import {
  AdaptiveJitterBuffer,
  applyJitterBufferTargets,
  audioCatchUpRate,
  readInboundJitterSamples,
} from '../src/lib/adaptive-jitter-buffer.ts'

function inbound(kind: 'video' | 'audio', overrides: Record<string, unknown> = {}): RTCStats {
  return {
    id: `inbound-${kind}`,
    type: 'inbound-rtp',
    timestamp: 1_000,
    kind,
    jitter: 0.001,
    packetsReceived: kind === 'video' ? 60 : 50,
    packetsLost: 0,
    nackCount: 0,
    pliCount: 0,
    framesDropped: 0,
    freezeCount: 0,
    ...overrides,
  } as unknown as RTCStats
}

const parsed = readInboundJitterSamples([inbound('video'), inbound('audio')])
assert.equal(parsed.video?.jitterMs, 1)
assert.equal(parsed.audio?.packetsReceived, 50)

const controller = new AdaptiveJitterBuffer()
const initial = controller.targets()
assert.equal(initial.video, 0)
assert.equal(initial.audio, 0)

const clean = controller.sample([inbound('video'), inbound('audio')])
assert.equal(clean.video, 0)
assert.equal(clean.audio, 0)

const burst = controller.sample([
  inbound('video', { timestamp: 2_000, jitter: 0.014, packetsReceived: 118, packetsLost: 2 }),
  inbound('audio', { timestamp: 2_000, jitter: 0.009, packetsReceived: 98, packetsLost: 2 }),
])
assert.ok(burst.video > clean.video, `video target did not rise: ${clean.video} -> ${burst.video}`)
assert.ok(burst.audio > clean.audio, `audio target did not rise: ${clean.audio} -> ${burst.audio}`)

let recovered = burst
for (let second = 3; second <= 10; second += 1) {
  recovered = controller.sample([
    inbound('video', { timestamp: second * 1_000, jitter: 0.001, packetsReceived: 118 + second * 60, packetsLost: 2 }),
    inbound('audio', { timestamp: second * 1_000, jitter: 0.001, packetsReceived: 98 + second * 50, packetsLost: 2 }),
  ])
}
assert.ok(recovered.video < burst.video, `video target did not shrink: ${burst.video} -> ${recovered.video}`)
assert.ok(recovered.audio < burst.audio, `audio target did not shrink: ${burst.audio} -> ${recovered.audio}`)
assert.ok(recovered.video >= 0)
assert.ok(recovered.audio >= 0)

const paced = new AdaptiveJitterBuffer()
paced.sample([inbound('video')])
const pacedSpike = paced.sample([
  inbound('video', { timestamp: 2_000, jitter: 0.024, packetsReceived: 120 }),
])
assert.equal(pacedSpike.video, 0, 'lossless encoder pacing must not inflate video latency')
const pacedAudio = new AdaptiveJitterBuffer()
pacedAudio.sample([inbound('audio')])
const pacedAudioSpike = pacedAudio.sample([
  inbound('audio', { timestamp: 2_000, jitter: 0.08, packetsReceived: 100 }),
])
assert.equal(pacedAudioSpike.audio, 0, 'lossless NetEq jitter must not inflate audio latency')
const recoveredPacket = paced.sample([
  inbound('video', { timestamp: 3_000, jitter: 0.024, packetsReceived: 179, nackCount: 1 }),
])
assert.ok(recoveredPacket.video > 0, 'a real NACK must add temporary protection')

const standardReceiver = {
  track: { kind: 'video' },
  jitterBufferTarget: null,
} as unknown as RTCRtpReceiver & { jitterBufferTarget: number | null }
const legacyReceiver = {
  track: { kind: 'audio' },
  playoutDelayHint: null,
} as unknown as RTCRtpReceiver & { playoutDelayHint: number | null }
assert.equal(applyJitterBufferTargets([standardReceiver, legacyReceiver], { video: 8, audio: 20 }), 2)
assert.equal(standardReceiver.jitterBufferTarget, 8)
assert.equal(legacyReceiver.playoutDelayHint, 0.02)

const legacyVideoReceiver = {
  track: { kind: 'video' },
  playoutDelayHint: null,
} as unknown as RTCRtpReceiver & { playoutDelayHint: number | null }
assert.equal(applyJitterBufferTargets([legacyVideoReceiver], { video: 8, audio: 20 }), 1)
assert.equal(legacyVideoReceiver.playoutDelayHint, 0.008)

const chromiumReceiver = {
  track: { kind: 'video' },
  jitterBufferTarget: null,
  playoutDelayHint: null,
} as unknown as RTCRtpReceiver & {
  jitterBufferTarget: number | null
  playoutDelayHint: number | null
}
assert.equal(applyJitterBufferTargets([chromiumReceiver], { video: 18, audio: 20 }), 1)
assert.equal(chromiumReceiver.jitterBufferTarget, 18)
assert.equal(chromiumReceiver.playoutDelayHint, 0)

const chromiumAudioReceiver = {
  track: { kind: 'audio' },
  jitterBufferTarget: null,
  playoutDelayHint: null,
} as unknown as RTCRtpReceiver & {
  jitterBufferTarget: number | null
  playoutDelayHint: number | null
}
assert.equal(applyJitterBufferTargets([chromiumAudioReceiver], { video: 18, audio: 24 }), 1)
assert.equal(chromiumAudioReceiver.jitterBufferTarget, 24)
assert.equal(chromiumAudioReceiver.playoutDelayHint, 0)

assert.equal(audioCatchUpRate(0), 1)
assert.equal(audioCatchUpRate(40_000), 1)
assert.equal(audioCatchUpRate(80_000), 1.04)
assert.equal(audioCatchUpRate(200_000), 1.08)

console.log('adaptive jitter buffer tests passed')
