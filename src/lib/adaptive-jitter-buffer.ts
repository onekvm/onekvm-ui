export type JitterBufferKind = 'video' | 'audio'

export type InboundJitterSample = {
  timestampMs: number
  jitterMs: number
  packetsReceived: number
  packetsLost: number
  nackCount: number
  pliCount: number
  framesDropped: number
  freezeCount: number
}

export type JitterBufferTargets = Record<JitterBufferKind, number>

type JitterProfile = {
  floorMs: number
  ceilingMs: number
  startupMs: number
  jitterGain: number
  deviationGain: number
  stableSamplesBeforeShrink: number
  shrinkStepMs: number
}

type JitterState = {
  targetMs: number
  jitterMeanMs: number
  jitterDeviationMs: number
  stableSamples: number
  previous: InboundJitterSample | null
}

type StandardAdjustableReceiver = RTCRtpReceiver & { jitterBufferTarget: number | null }
type LegacyAdjustableReceiver = RTCRtpReceiver & { playoutDelayHint: number | null }

const LOW_LATENCY_PROFILE: JitterProfile = {
  floorMs: 0,
  ceilingMs: 96,
  startupMs: 0,
  jitterGain: 0,
  deviationGain: 0,
  stableSamplesBeforeShrink: 1,
  shrinkStepMs: 8,
}

const PROFILES: Record<JitterBufferKind, JitterProfile> = {
  // Video can run at the browser's minimum on a clean LAN. A short ceiling
  // prevents recovery from turning into a visibly delayed remote console.
  video: LOW_LATENCY_PROFILE,
  // Chrome's audio NetEq also ratchets and will not shrink; a 20 ms floor
  // only raised the minimum, so inbound delay still climbed toward 1 s.
  // Pin it the same way as video: zero extra delay on a clean LAN.
  audio: LOW_LATENCY_PROFILE,
}

function finiteNonNegative(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

function roundTarget(value: number, profile: JitterProfile): number {
  const bounded = Math.max(profile.floorMs, Math.min(profile.ceilingMs, value))
  return Math.round(bounded / 2) * 2
}

function newState(kind: JitterBufferKind): JitterState {
  const profile = PROFILES[kind]
  return {
    targetMs: profile.startupMs,
    jitterMeanMs: 0,
    jitterDeviationMs: 0,
    stableSamples: 0,
    previous: null,
  }
}

function updateState(kind: JitterBufferKind, state: JitterState, sample: InboundJitterSample): number {
  const profile = PROFILES[kind]
  const jitterMs = Math.max(0, Math.min(profile.ceilingMs, sample.jitterMs))
  if (!state.previous) {
    state.jitterMeanMs = jitterMs
    state.previous = sample
    state.targetMs = roundTarget(
      Math.max(profile.startupMs, jitterMs * profile.jitterGain),
      profile,
    )
    return state.targetMs
  }

  const receivedDelta = sample.packetsReceived - state.previous.packetsReceived
  const lostDelta = sample.packetsLost - state.previous.packetsLost
  const nackDelta = sample.nackCount - state.previous.nackCount
  const pliDelta = sample.pliCount - state.previous.pliCount
  const droppedDelta = sample.framesDropped - state.previous.framesDropped
  const freezeDelta = sample.freezeCount - state.previous.freezeCount
  const countersAdvanced = receivedDelta >= 0 && lostDelta >= 0
  const packetTotal = countersAdvanced ? receivedDelta + lostDelta : 0
  const lossRatio = packetTotal > 0 ? lostDelta / packetTotal : 0
  const deviation = Math.abs(jitterMs - state.jitterMeanMs)

  // A faster mean follows sudden network changes; deviation supplies margin
  // for bursty Wi-Fi without permanently inflating the target.
  state.jitterMeanMs = state.jitterMeanMs === 0
    ? jitterMs
    : state.jitterMeanMs * 0.72 + jitterMs * 0.28
  state.jitterDeviationMs = state.jitterDeviationMs === 0
    ? deviation
    : state.jitterDeviationMs * 0.78 + deviation * 0.22

  const recoveryEvents = Math.max(0, nackDelta)
    + Math.max(0, pliDelta) * 2
    + Math.max(0, droppedDelta) * 2
    + Math.max(0, freezeDelta) * 4
  const lossPenaltyMs = lostDelta > 0 || recoveryEvents > 0
    ? Math.min(48, 8 + lossRatio * 160 + recoveryEvents * 2)
    : 0
  /* Chromium's inbound `jitter` also reflects encoder burst pacing and
     NetEq's own estimate. On a lossless LAN that can reach tens to hundreds
     of milliseconds even though no packet was lost. Adding a gain on top
     inflated video by several frames and let audio ratchet toward 1 s.
     Extra delay is added only after an actual loss/recovery event. */
  const jitterMarginMs = lossPenaltyMs > 0
    ? Math.min(16, jitterMs * 0.5 + state.jitterDeviationMs)
    : 0
  const desiredMs = roundTarget(
    profile.floorMs
      + jitterMarginMs
      + lossPenaltyMs,
    profile,
  )
  const unstable = lostDelta > 0 || recoveryEvents > 0

  if (unstable || desiredMs > state.targetMs) {
    state.stableSamples = 0
    // Protection rises immediately; waiting several polling intervals would
    // turn a short jitter burst into freezes or audio gaps.
    state.targetMs = Math.max(state.targetMs, desiredMs)
  } else {
    state.stableSamples += 1
    if (state.stableSamples >= profile.stableSamplesBeforeShrink && desiredMs < state.targetMs) {
      state.targetMs = Math.max(desiredMs, state.targetMs - profile.shrinkStepMs)
    }
  }

  state.targetMs = roundTarget(state.targetMs, profile)
  state.previous = sample
  return state.targetMs
}

export function readInboundJitterSamples(
  reports: RTCStatsReport | Iterable<RTCStats>,
): Partial<Record<JitterBufferKind, InboundJitterSample>> {
  const samples: Partial<Record<JitterBufferKind, InboundJitterSample>> = {}
  const visit = (report: RTCStats) => {
    if (report.type !== 'inbound-rtp') return
    const kind = (report as RTCInboundRtpStreamStats).kind
    if ((kind !== 'video' && kind !== 'audio') || samples[kind]) return
    const bag = report as RTCStats & Record<string, unknown>
    samples[kind] = {
      timestampMs: report.timestamp,
      jitterMs: finiteNonNegative(bag.jitter) * 1000,
      packetsReceived: finiteNonNegative(bag.packetsReceived),
      packetsLost: finiteNonNegative(bag.packetsLost),
      nackCount: finiteNonNegative(bag.nackCount),
      pliCount: finiteNonNegative(bag.pliCount),
      framesDropped: finiteNonNegative(bag.framesDropped),
      freezeCount: finiteNonNegative(bag.freezeCount),
    }
  }

  if (typeof (reports as RTCStatsReport).forEach === 'function' && !Array.isArray(reports)) {
    ;(reports as RTCStatsReport).forEach(visit)
  } else {
    for (const report of reports as Iterable<RTCStats>) visit(report)
  }
  return samples
}

export class AdaptiveJitterBuffer {
  private states: Record<JitterBufferKind, JitterState> = {
    video: newState('video'),
    audio: newState('audio'),
  }

  sample(reports: RTCStatsReport | Iterable<RTCStats>): JitterBufferTargets {
    const samples = readInboundJitterSamples(reports)
    for (const kind of ['video', 'audio'] as const) {
      if (samples[kind]) updateState(kind, this.states[kind], samples[kind])
    }
    return this.targets()
  }

  targets(): JitterBufferTargets {
    return {
      video: this.states.video.targetMs,
      audio: this.states.audio.targetMs,
    }
  }

  reset(): JitterBufferTargets {
    this.states = { video: newState('video'), audio: newState('audio') }
    return this.targets()
  }
}

/* Drain Chrome NetEq when it has ratcheted. playbackRate > 1 pulls PCM
 * faster than realtime so jitterBufferDelay falls; preservesPitch keeps
 * pitch. Thresholds are ms of inbound-rtp jitterBufferDelay. */
export function audioCatchUpRate(jitterBufferUs: number): number {
  const delayMs = jitterBufferUs / 1000
  if (delayMs >= 160) return 1.08
  if (delayMs >= 80) return 1.04
  return 1
}

export function applyJitterBufferTargets(
  receivers: Iterable<RTCRtpReceiver>,
  targets: JitterBufferTargets,
): number {
  let applied = 0
  for (const receiver of receivers) {
    const kind = receiver.track?.kind
    if (kind !== 'video' && kind !== 'audio') continue
    const adjustable = receiver as RTCRtpReceiver & Record<string, unknown>
    const targetMs = targets[kind]
    const hasStandardTarget = 'jitterBufferTarget' in adjustable
    try {
      if (hasStandardTarget) {
        const standard = adjustable as StandardAdjustableReceiver
        if (standard.jitterBufferTarget !== targetMs) standard.jitterBufferTarget = targetMs
        applied += 1
      }
      if ('playoutDelayHint' in adjustable) {
        const legacy = adjustable as unknown as LegacyAdjustableReceiver
        /* Chromium currently exposes both APIs. Its null legacy hint keeps an
           extra renderer queue even when jitterBufferTarget is low. An
           explicit zero selects the low-latency renderer while the standard
           target remains dynamically adjustable. Audio uses the same zero
           hint: a non-zero floor only raised Chrome's minimum, and NetEq
           still ratcheted toward a second. */
        const targetSeconds = hasStandardTarget ? 0 : targetMs / 1000
        if (legacy.playoutDelayHint !== targetSeconds) legacy.playoutDelayHint = targetSeconds
        if (!hasStandardTarget) applied += 1
      }
    } catch {
      // A browser may expose the draft property but reject writes for a codec
      // or receiver state. Its native adaptive buffer remains the fallback.
    }
  }
  return applied
}
