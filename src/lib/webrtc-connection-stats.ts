import { forEachRtcStat } from './webrtc-playback-stats.ts'

export type WebRTCCandidate = {
  address: string | null
  port: number | null
  type: string | null
  protocol: string | null
  relayProtocol: string | null
}

export type WebRTCConnectionStats = {
  connectionState: RTCPeerConnectionState
  iceState: RTCIceConnectionState
  dtlsState: string | null
  local: WebRTCCandidate | null
  remote: WebRTCCandidate | null
  rttMs: number | null
  jitterMs: number | null
  packetsLost: number | null
}

type Stat = RTCStats & Record<string, unknown>

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function milliseconds(value: unknown): number | null {
  const seconds = numberValue(value)
  return seconds !== null && seconds >= 0 ? seconds * 1000 : null
}

function candidate(stat: Stat | undefined): WebRTCCandidate | null {
  if (!stat) return null
  return {
    address: stringValue(stat.address) ?? stringValue(stat.ip),
    port: numberValue(stat.port),
    type: stringValue(stat.candidateType),
    protocol: stringValue(stat.protocol),
    relayProtocol: stringValue(stat.relayProtocol),
  }
}

export function formatCandidateEndpoint(value: WebRTCCandidate | null): string {
  if (!value?.address) return '—'
  const address = value.address.includes(':') && !value.address.startsWith('[')
    ? `[${value.address}]`
    : value.address
  return value.port === null ? address : `${address}:${value.port}`
}

export function readWebRTCConnectionStats(
  reports: RTCStatsReport | Iterable<RTCStats>,
  peer: Pick<RTCPeerConnection, 'connectionState' | 'iceConnectionState'>,
): WebRTCConnectionStats {
  const stats = new Map<string, Stat>()
  forEachRtcStat(reports, report => stats.set(report.id, report as Stat))
  const all = [...stats.values()]
  const video = all.find(stat => stat.type === 'inbound-rtp' && (stat.kind ?? stat.mediaType) === 'video')
  const videoTransportId = stringValue(video?.transportId)
  const transport = videoTransportId
    ? stats.get(videoTransportId)
    : all.find(stat => stat.type === 'transport' && stringValue(stat.selectedCandidatePairId))
      ?? all.find(stat => stat.type === 'transport')
  const selectedId = stringValue(transport?.selectedCandidatePairId)
  const pairs = all.filter(stat => stat.type === 'candidate-pair'
    && (!videoTransportId || !stat.transportId || stat.transportId === videoTransportId))
  // A succeeded connectivity check can belong to a standby route. Only use
  // selection/nominations when the browser does not expose the selected ID.
  const pair = selectedId
    ? stats.get(selectedId)
    : pairs.find(stat => stat.selected === true)
      ?? pairs.find(stat => stat.nominated === true && stat.state === 'succeeded')
  const localId = stringValue(pair?.localCandidateId)
  const remoteId = stringValue(pair?.remoteCandidateId)
  return {
    connectionState: peer.connectionState,
    iceState: peer.iceConnectionState,
    dtlsState: stringValue(transport?.dtlsState),
    local: candidate(localId ? stats.get(localId) : undefined),
    remote: candidate(remoteId ? stats.get(remoteId) : undefined),
    rttMs: milliseconds(pair?.currentRoundTripTime),
    jitterMs: milliseconds(video?.jitter),
    packetsLost: numberValue(video?.packetsLost),
  }
}
