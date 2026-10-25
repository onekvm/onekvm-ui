import type { WebRTCAnswer } from '../api/client'

type Exchange = (session: string, token: string, cursor: number, candidates: RTCIceCandidateInit[], signal: AbortSignal) => Promise<{ candidates: RTCIceCandidateInit[]; cursor: number; complete: boolean }>

/** Each instance belongs to one PeerConnection/ICE generation. Both directions
 * retain candidates until acknowledged; HTTP retries never lose late TURN/STUN. */
export class WebRTCTrickleICE {
  private pending: RTCIceCandidateInit[] = []
  private ended = false
  private cursor = 0
  private abort = new AbortController()
  private timer: ReturnType<typeof setTimeout> | undefined
  private wake: (() => void) | undefined

  private readonly peer: RTCPeerConnection
  private readonly exchange: Exchange

  constructor(peer: RTCPeerConnection, exchange: Exchange) {
    this.peer = peer
    this.exchange = exchange
    peer.addEventListener('icecandidate', this.candidate)
    peer.addEventListener('connectionstatechange', this.state)
  }

  private candidate = (event: RTCPeerConnectionIceEvent) => {
    if (event.candidate) {
      if (this.pending.length < 256) this.pending.push(event.candidate.toJSON())
    } else this.ended = true
    this.wake?.()
  }
  private state = () => { if (this.peer.connectionState === 'closed') this.destroy() }

  async start(answer: WebRTCAnswer) {
    if (!answer.trickle || !answer.ice_token) { this.destroy(); return }
    let failures = 0
    const deadline = performance.now() + 120_000
    while (!this.abort.signal.aborted && performance.now() < deadline) {
      const batch = this.pending.slice(0, 32)
      const end = this.ended && batch.length === this.pending.length
      if (end) batch.push({ candidate: '' })
      // The API permits 32 entries per exchange, including end-of-candidates.
      const sent = batch.slice(0, 32)
      try {
        const result = await this.exchange(answer.session_id, answer.ice_token, this.cursor, sent, this.abort.signal)
        if (this.abort.signal.aborted) return
        for (const candidate of result.candidates) await this.peer.addIceCandidate(candidate)
        if (result.complete) await this.peer.addIceCandidate(null)
        this.cursor = result.cursor
        this.pending.splice(0, sent.filter(c => Boolean(c.candidate)).length)
        failures = 0
        if (result.complete && end && sent.some(c => c.candidate === '')) { this.destroy(); return }
      } catch (error) {
        if (this.abort.signal.aborted) return
        if (++failures >= 5) { this.destroy(); throw error }
      }
      await new Promise<void>(resolve => {
        const done = () => { clearTimeout(this.timer); this.wake = undefined; resolve() }
        this.wake = done
        this.timer = setTimeout(done, failures ? 500 : this.peer.connectionState === 'connected' ? 500 : 100)
      })
    }
    if (!this.abort.signal.aborted) {
      this.destroy()
      throw new Error('ICE candidate exchange timed out')
    }
  }

  destroy() {
    this.abort.abort()
    this.wake?.()
    clearTimeout(this.timer)
    this.peer.removeEventListener('icecandidate', this.candidate)
    this.peer.removeEventListener('connectionstatechange', this.state)
    this.pending = []
  }
}
