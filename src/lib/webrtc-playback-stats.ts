export type BrowserVideoLatencyUs = {
  iceRttUs: number
  jitterBufferUs: number
  decodeUs: number
}

export type PlaybackStatsSnapshot = {
  timestamp: number
  bytesReceived: number
  jitterBufferDelay: number
  jitterBufferEmittedCount: number
  totalDecodeTime: number
  framesDecoded: number
}

export const emptyBrowserVideoLatency = (): BrowserVideoLatencyUs => ({
  iceRttUs: 0,
  jitterBufferUs: 0,
  decodeUs: 0,
})

type StatsBag = RTCStats & Record<string, unknown>

function statsNumber(report: RTCStats, key: string): number {
  const value = (report as StatsBag)[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function secondsToUs(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0
  const us = Math.round(seconds * 1_000_000)
  if (us > 10_000_000) return 0
  return us
}

function intervalAverage(deltaSum: number, deltaCount: number): number {
  if (deltaCount <= 0 || deltaSum < 0) return 0
  return deltaSum / deltaCount
}

export function forEachRtcStat(
  reports: RTCStatsReport | Iterable<RTCStats>,
  visit: (report: RTCStats) => void,
): void {
  if (typeof (reports as RTCStatsReport).forEach === 'function' && !Array.isArray(reports)) {
    ;(reports as RTCStatsReport).forEach((report) => visit(report))
    return
  }
  for (const report of reports as Iterable<RTCStats>) visit(report)
}

export function iceRttSeconds(reports: RTCStatsReport | Iterable<RTCStats>): number {
  let nominated = 0
  let succeeded = 0
  let remoteInbound = 0
  forEachRtcStat(reports, (report) => {
    if (report.type === 'candidate-pair') {
      const rtt = statsNumber(report, 'currentRoundTripTime')
      if (rtt <= 0) return
      const nominatedPair = (report as RTCIceCandidatePairStats).nominated === true
      const state = (report as RTCIceCandidatePairStats).state
      if (nominatedPair && state === 'succeeded') nominated = rtt
      else if (state === 'succeeded' && succeeded <= 0) succeeded = rtt
      return
    }
    if (report.type !== 'remote-inbound-rtp' || remoteInbound > 0) return
    const rtt = statsNumber(report, 'roundTripTime')
    if (rtt > 0) remoteInbound = rtt
  })
  if (nominated > 0) return nominated
  if (succeeded > 0) return succeeded
  return remoteInbound
}

export function readInboundVideo(
  reports: RTCStatsReport | Iterable<RTCStats>,
): PlaybackStatsSnapshot | null {
  let snapshot: PlaybackStatsSnapshot | null = null
  forEachRtcStat(reports, (report) => {
    if (snapshot || report.type !== 'inbound-rtp') return
    if ((report as RTCInboundRtpStreamStats).kind !== 'video') return
    snapshot = {
      timestamp: report.timestamp,
      bytesReceived: statsNumber(report, 'bytesReceived'),
      jitterBufferDelay: statsNumber(report, 'jitterBufferDelay'),
      jitterBufferEmittedCount: statsNumber(report, 'jitterBufferEmittedCount'),
      totalDecodeTime: statsNumber(report, 'totalDecodeTime'),
      framesDecoded: statsNumber(report, 'framesDecoded'),
    }
  })
  return snapshot
}

export function samplePlaybackStats(
  reports: RTCStatsReport | Iterable<RTCStats>,
  previous: PlaybackStatsSnapshot | null,
): {
  bitrateKbps: number
  latency: BrowserVideoLatencyUs
  snapshot: PlaybackStatsSnapshot | null
  jitterSampled: boolean
  decodeSampled: boolean
} {
  const snapshot = readInboundVideo(reports)
  const iceRttUs = secondsToUs(iceRttSeconds(reports))
  if (!snapshot || !previous || snapshot.timestamp <= previous.timestamp) {
    return {
      bitrateKbps: 0,
      latency: { iceRttUs, jitterBufferUs: 0, decodeUs: 0 },
      snapshot,
      jitterSampled: false,
      decodeSampled: false,
    }
  }

  const elapsedMs = snapshot.timestamp - previous.timestamp
  const bitrateKbps = elapsedMs > 0
    ? Math.max(0, Math.round(((snapshot.bytesReceived - previous.bytesReceived) * 8) / elapsedMs))
    : 0
  const jitterDelta = snapshot.jitterBufferEmittedCount - previous.jitterBufferEmittedCount
  const decodeDelta = snapshot.framesDecoded - previous.framesDecoded
  return {
    bitrateKbps,
    latency: {
      iceRttUs,
      jitterBufferUs: secondsToUs(intervalAverage(
        snapshot.jitterBufferDelay - previous.jitterBufferDelay,
        jitterDelta,
      )),
      decodeUs: secondsToUs(intervalAverage(
        snapshot.totalDecodeTime - previous.totalDecodeTime,
        decodeDelta,
      )),
    },
    snapshot,
    jitterSampled: jitterDelta > 0,
    decodeSampled: decodeDelta > 0,
  }
}

export class PlaybackStatsSampler {
  private previous: PlaybackStatsSnapshot | null = null
  private latency = emptyBrowserVideoLatency()

  sample(reports: RTCStatsReport | Iterable<RTCStats>): {
    bitrateKbps: number
    bitrateSampled: boolean
    latency: BrowserVideoLatencyUs
  } {
    const next = samplePlaybackStats(reports, this.previous)
    const bitrateSampled = Boolean(this.previous && next.snapshot && next.snapshot.timestamp > this.previous.timestamp)
    if (next.snapshot) this.previous = next.snapshot
    this.latency = {
      iceRttUs: next.latency.iceRttUs,
      jitterBufferUs: next.jitterSampled ? next.latency.jitterBufferUs : this.latency.jitterBufferUs,
      decodeUs: next.decodeSampled ? next.latency.decodeUs : this.latency.decodeUs,
    }
    return { bitrateKbps: next.bitrateKbps, bitrateSampled, latency: this.latency }
  }

  reset(): BrowserVideoLatencyUs {
    this.previous = null
    this.latency = emptyBrowserVideoLatency()
    return emptyBrowserVideoLatency()
  }
}
