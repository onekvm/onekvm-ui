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
  autoBitrateKbps?: number | null
  inboundId?: string | null
  packetsLost: number | null
}

type Stat = RTCStats & Record<string, unknown>
type PeerStatsSource = Pick<RTCPeerConnection, 'connectionState' | 'iceConnectionState'>
  & Partial<Pick<RTCPeerConnection, 'getReceivers' | 'sctp'>>

export function videoConnectionType(
  transport: 'webrtc' | 'websocket' | 'mjpeg',
  stats?: WebRTCConnectionStats | null,
): 'P2P' | 'Relay' | 'Direct' | null {
  if (transport !== 'webrtc') return 'Direct'
  if (stats?.connectionState !== 'connected') return null
  const types = [stats.local?.type, stats.remote?.type]
  if (types.includes('relay')) return 'Relay'
  if (types.every(type => type === 'host')) return 'Direct'
  return types.every(type => type && ['host', 'srflx', 'prflx'].includes(type)) ? 'P2P' : null
}

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

function candidate(stat: Stat | undefined, selected?: RTCIceCandidate): WebRTCCandidate | null {
  if (!stat) return null
  return {
    address: stringValue(stat.address) ?? stringValue(stat.ip) ?? stringValue(selected?.address),
    port: numberValue(stat.port),
    type: stringValue(stat.candidateType),
    protocol: stringValue(stat.protocol),
    relayProtocol: stringValue(stat.relayProtocol),
  }
}

function selectedIcePair(peer: PeerStatsSource, hasVideo: boolean): RTCIceCandidatePair | null {
  try {
    const videoTransport = peer.getReceivers?.().find(receiver => receiver.track.kind === 'video')?.transport?.iceTransport
    const transport = hasVideo ? videoTransport : videoTransport ?? peer.sctp?.transport?.iceTransport
    return transport?.getSelectedCandidatePair?.() ?? null
  } catch {
    return null
  }
}

function matchesCandidate(stat: Stat | undefined, selected: RTCIceCandidate | undefined): boolean {
  return Boolean(stat && selected && stat.candidateType === selected.type
    && stat.protocol === selected.protocol && stat.port === selected.port
    && (!stat.foundation || stat.foundation === selected.foundation))
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
  peer: PeerStatsSource,
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
  const localStat = localId ? stats.get(localId) : undefined
  const remoteStat = remoteId ? stats.get(remoteId) : undefined
  const selected = selectedIcePair(peer, Boolean(video))
  // Browsers may redact getStats() addresses while exposing an mDNS hostname
  // on the selected ICE pair. Match both endpoints before filling any blanks.
  const matches = matchesCandidate(localStat, selected?.local) && matchesCandidate(remoteStat, selected?.remote)
  return {
    connectionState: peer.connectionState,
    iceState: peer.iceConnectionState,
    dtlsState: stringValue(transport?.dtlsState),
    local: candidate(localStat, matches ? selected?.local : undefined),
    remote: candidate(remoteStat, matches ? selected?.remote : undefined),
    rttMs: milliseconds(pair?.currentRoundTripTime),
    jitterMs: milliseconds(video?.jitter),
    inboundId: video?.id ?? null,
    packetsLost: numberValue(video?.packetsLost),
  }
}
