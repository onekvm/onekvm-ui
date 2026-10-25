import assert from 'node:assert/strict'
import { WebRTCTrickleICE } from '../src/lib/webrtc-ice.ts'

class Peer extends EventTarget {
  connectionState = 'new'
  received: unknown[] = []
  async addIceCandidate(candidate: unknown) { this.received.push(candidate) }
  candidate(candidate: string | null) {
    this.dispatchEvent(Object.assign(new Event('icecandidate'), {
      candidate: candidate === null ? null : { toJSON: () => ({ candidate, sdpMid: '0', sdpMLineIndex: 0 }) },
    }))
  }
}
const answer = { sdp: '', type: 'answer', session_id: 'session', ice_token: 'token', trickle: true }
{
  const peer = new Peer()
  const requests: RTCIceCandidateInit[][] = []
  let count = 0
  const ice = new WebRTCTrickleICE(peer as unknown as RTCPeerConnection, async (_session, _token, cursor, candidates) => {
    requests.push(candidates)
    assert.ok(candidates.length <= 32)
    if (++count === 1) {
      peer.candidate('late-turn')
      peer.candidate(null)
      return { candidates: [{ candidate: 'server-host' }], cursor: cursor + 1, complete: false }
    }
    return { candidates: [], cursor, complete: true }
  })
  // Events may precede the offer response. No candidates are discarded.
  for (let i = 0; i < 40; i++) peer.candidate(`host-${i}`)
  await ice.start(answer)
  assert.deepEqual(requests.flat().filter(c => c.candidate).map(c => c.candidate), [...Array.from({ length: 40 }, (_, i) => `host-${i}`), 'late-turn'])
  assert.ok(requests.at(-1)?.some(c => c.candidate === ''))
  assert.deepEqual(peer.received, [{ candidate: 'server-host' }, null])
}
{
  const peer = new Peer()
  let count = 0
  let destroyed = false
  const ice = new WebRTCTrickleICE(peer as unknown as RTCPeerConnection, async (_s, _t, _c, _candidates, signal) => {
    count++
    await new Promise(resolve => { signal.addEventListener('abort', resolve, { once: true }); setTimeout(() => ice.destroy(), 10) })
    destroyed = signal.aborted
    return { candidates: [], cursor: 0, complete: false }
  })
  await ice.start(answer)
  assert.equal(count, 1)
  assert.equal(destroyed, true)
}
console.log('Trickle ICE: queued candidates, late TURN, batching, end marker and cancellation passed')
