import assert from 'node:assert/strict'
import { formatCandidateEndpoint, readWebRTCConnectionStats, videoConnectionType } from '../src/lib/webrtc-connection-stats.ts'

const peer = { connectionState: 'connected', iceConnectionState: 'completed' } as const
function stat(id: string, type: string, values: Record<string, unknown> = {}): RTCStats {
  return { id, type, timestamp: 1000, ...values } as RTCStats
}
const video = stat('video', 'inbound-rtp', { kind: 'video', transportId: 'video-transport', jitter: 0.0025, packetsLost: 3 })
const transport = stat('video-transport', 'transport', { selectedCandidatePairId: 'active', dtlsState: 'connected' })
const pair = stat('active', 'candidate-pair', { localCandidateId: 'local', remoteCandidateId: 'remote', currentRoundTripTime: 0.012 })
const local = stat('local', 'local-candidate', { address: '2001:db8::1', port: 5000, candidateType: 'relay', protocol: 'udp', relayProtocol: 'tls' })
const remote = stat('remote', 'remote-candidate', { address: '10.0.0.107', port: 6000, candidateType: 'host', protocol: 'udp' })
const standby = stat('standby', 'candidate-pair', { nominated: true, state: 'succeeded', localCandidateId: 'wrong', currentRoundTripTime: 1 })
const reports = [standby, transport, video, pair, local, remote]

const actual = readWebRTCConnectionStats(new Map(reports.map(item => [item.id, item])) as RTCStatsReport, peer)
assert.equal(actual.local?.type, 'relay')
assert.equal(videoConnectionType('webrtc', actual), 'Relay')
const p2p = { ...actual, local: { ...actual.local!, type: 'host' } }
assert.equal(videoConnectionType('webrtc', p2p), 'Direct')
for (const type of ['srflx', 'prflx']) {
  assert.equal(videoConnectionType('webrtc', { ...p2p, local: { ...p2p.local, type } }), 'P2P')
  assert.equal(videoConnectionType('webrtc', { ...p2p, remote: { ...p2p.remote!, type } }), 'P2P')
}
assert.equal(videoConnectionType('webrtc', { ...p2p, remote: { ...p2p.remote!, type: 'relay' } }), 'Relay')
assert.equal(videoConnectionType('webrtc', { ...p2p, remote: null }), null)
assert.equal(videoConnectionType('webrtc', { ...p2p, remote: { ...p2p.remote!, type: null } }), null)
assert.equal(videoConnectionType('webrtc', { ...p2p, connectionState: 'disconnected' }), null)
assert.equal(videoConnectionType('webrtc'), null)
assert.equal(videoConnectionType('websocket', actual), 'Direct')
assert.equal(videoConnectionType('mjpeg'), 'Direct')
assert.equal(actual.local?.relayProtocol, 'tls')
assert.equal(actual.remote?.address, '10.0.0.107')
assert.equal(actual.connectionState, 'connected')
assert.equal(actual.iceState, 'completed')
assert.equal(actual.dtlsState, 'connected')
assert.equal(actual.rttMs, 12)
assert.equal(actual.jitterMs, 2.5)
assert.equal(actual.packetsLost, 3)
assert.equal(formatCandidateEndpoint(actual.local), '[2001:db8::1]:5000')
assert.equal(formatCandidateEndpoint(actual.remote), '10.0.0.107:6000')

// Prefer the video transport even when a separate audio/data transport comes first.
const separateTransport = stat('audio-transport', 'transport', { selectedCandidatePairId: 'standby' })
assert.equal(readWebRTCConnectionStats([separateTransport, ...reports], peer).rttMs, 12)
assert.equal(readWebRTCConnectionStats([video, stat('other', 'candidate-pair', { transportId: 'audio-transport', selected: true, currentRoundTripTime: 1 })], peer).rttMs, null)
// An explicit but missing selected pair must not silently display a standby route.
assert.equal(readWebRTCConnectionStats([standby, stat('video-transport', 'transport', { selectedCandidatePairId: 'missing' }), video], peer).local, null)
assert.equal(readWebRTCConnectionStats([standby, stat('video-transport', 'transport', { selectedCandidatePairId: 'missing' }), video], peer).rttMs, null)

// Older browsers can identify selection on the pair, or only expose nomination.
assert.equal(readWebRTCConnectionStats([standby, stat('selected', 'candidate-pair', { selected: true, currentRoundTripTime: 0.003 })], peer).rttMs, 3)
assert.equal(readWebRTCConnectionStats([standby], peer).rttMs, 1000)
assert.equal(readWebRTCConnectionStats([stat('unchecked', 'candidate-pair', { state: 'succeeded', currentRoundTripTime: 1 })], peer).rttMs, null)

// Redacted addresses and missing/non-finite measurements stay unavailable; zero is real.
const redacted = readWebRTCConnectionStats([
  transport, pair, stat('local', 'local-candidate', { port: 5000, candidateType: 'host' }),
  stat('video', 'inbound-rtp', { kind: 'video', jitter: NaN, packetsLost: 0 }),
], peer)
assert.equal(formatCandidateEndpoint(redacted.local), '—')
assert.equal(redacted.jitterMs, null)
assert.equal(redacted.packetsLost, 0)

// Chromium redacts host IPs in getStats() but exposes the selected mDNS
// candidate through the video receiver's ICE transport.
const hiddenLocal = stat('local', 'local-candidate', {
  address: '', ip: '', foundation: 'local-host', port: 5000, candidateType: 'host', protocol: 'udp',
})
const privacyReports = [video, transport, pair, hiddenLocal, remote]
const nativePair = {
  local: { address: 'browser.local', foundation: 'local-host', port: 5000, type: 'host', protocol: 'udp' },
  remote: { address: '10.0.0.107', port: 6000, type: 'host', protocol: 'udp' },
} as RTCIceCandidatePair
function receiver(kind: string, getSelectedCandidatePair: () => RTCIceCandidatePair | null): RTCRtpReceiver {
  return { track: { kind }, transport: { iceTransport: { getSelectedCandidatePair } } } as unknown as RTCRtpReceiver
}
const privacyPeer = { ...peer, getReceivers: () => [receiver('video', () => nativePair)] }
const privateStats = readWebRTCConnectionStats(privacyReports, privacyPeer)
assert.equal(formatCandidateEndpoint(privateStats.local), 'browser.local:5000')
assert.equal(videoConnectionType('webrtc', privateStats), 'Direct')
assert.equal(readWebRTCConnectionStats(privacyReports, peer).local?.address, null)

// Do not fill a redacted endpoint from a route that changed after the sample,
// a different media transport, or an unsupported browser API.
const changedPair = { ...nativePair, remote: { ...nativePair.remote, port: 6001 } } as RTCIceCandidatePair
assert.equal(readWebRTCConnectionStats(privacyReports, { ...peer, getReceivers: () => [receiver('video', () => changedPair)] }).local?.address, null)
assert.equal(readWebRTCConnectionStats(privacyReports, { ...peer, getReceivers: () => [receiver('audio', () => nativePair)] }).local?.address, null)
assert.equal(readWebRTCConnectionStats(privacyReports, { ...peer, getReceivers: () => [receiver('video', () => { throw new Error('unsupported') })] }).local?.address, null)
assert.equal(readWebRTCConnectionStats([video, transport, hiddenLocal, remote], privacyPeer).local, null)
const otherFoundation = stat('local', 'local-candidate', { ...hiddenLocal, foundation: 'another-interface' })
assert.equal(readWebRTCConnectionStats([video, transport, pair, otherFoundation, remote], privacyPeer).local?.address, null)
// A disclosed IP from getStats() remains authoritative over the mDNS alias.
const disclosedLocal = stat('local', 'local-candidate', { ...hiddenLocal, address: '192.168.1.10' })
assert.equal(readWebRTCConnectionStats([video, transport, pair, disclosedLocal, remote], privacyPeer).local?.address, '192.168.1.10')

const zero = readWebRTCConnectionStats([
  stat('zero', 'candidate-pair', { selected: true, currentRoundTripTime: 0 }),
  stat('video', 'inbound-rtp', { mediaType: 'video', jitter: 0 }),
], peer)
assert.equal(zero.rttMs, 0)
assert.equal(zero.jitterMs, 0)
assert.equal(formatCandidateEndpoint({ address: 'browser.local', port: null, type: 'host', protocol: 'udp', relayProtocol: null }), 'browser.local')
const empty = readWebRTCConnectionStats([], { connectionState: 'connecting', iceConnectionState: 'checking' })
assert.equal(empty.connectionState, 'connecting')
assert.equal(empty.local, null)
assert.equal(empty.remote, null)
assert.equal(empty.rttMs, null)
assert.equal(empty.jitterMs, null)
assert.equal(empty.packetsLost, null)

console.log('WebRTC connection stats tests passed')
