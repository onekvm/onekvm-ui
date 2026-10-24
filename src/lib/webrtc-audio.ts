import { api, type IceServer } from '@/api/client'
import { AdaptiveJitterBuffer, applyJitterBufferTargets } from '@/lib/adaptive-jitter-buffer'
import { applyOpusStereoPreference, preferLowDelayOpus } from '@/lib/webrtc-opus-sdp'
import {
  PlaybackStatsSampler,
  readInboundAudio,
  readInboundAudioLevel,
  type BrowserAudioStats,
} from '@/lib/webrtc-playback-stats'

export type AudioRecoveryReason = 'latency' | 'connection'

// Keep this policy across receiver replacements so a bad network cannot
// continuously renegotiate. Only fresh, emitted audio counts as a sample.
export class AudioLatencyRecovery {
  private highSince: number | null = null
  private lastRecovery = -Infinity

  sample(delayUs: number, now: number, fresh: boolean): boolean {
    if (!fresh || !Number.isFinite(delayUs) || delayUs < 250_000) {
      this.highSince = null
      return false
    }
    this.highSince ??= now
    if (now - this.lastRecovery < 15_000) return false
    if (delayUs < 750_000 && now - this.highSince < 2000) return false
    this.lastRecovery = now
    this.highSince = null
    return true
  }

  reset() {
    this.highSince = null
  }
}

interface AudioCallbacks {
  track: (track: MediaStreamTrack) => void
  ready: () => void
  stats: (stats: BrowserAudioStats) => void
  recover: (reason: AudioRecoveryReason) => void
  playing: () => boolean
}

/** A new PeerConnection creates a new NetEq receiver without touching video. */
export class WebRTCAudio {
  private peer: RTCPeerConnection | null = null
  private id = ''
  private closed = false
  private recovering = false
  private statsTimer = 0
  private connectTimer = 0
  private disconnectTimer = 0
  private cancelGathering: (() => void) | null = null
  private stats = new PlaybackStatsSampler()
  private jitter = new AdaptiveJitterBuffer()
  private emittedCount = 0
  // Playlist transitions can emit silent RTP while the browser's jitter
  // metric is settling. Require a few audible samples before latency-based
  // receiver replacement is allowed.
  private audibleSamples = 0
  private sender: RTCRtpSender | null = null

  constructor(
    private readonly callbacks: AudioCallbacks,
    private readonly recovery: AudioLatencyRecovery,
  ) {}

  sessionID() { return this.id }
  audioSender() { return this.sender }

  async connect(iceServers: IceServer[], stereo: boolean) {
    if (this.closed) return
    const peer = new RTCPeerConnection(iceServers.length ? { iceServers } : undefined)
    this.peer = peer
    this.sender = peer.addTransceiver('audio', { direction: 'sendrecv' }).sender
    peer.ontrack = ({ track }) => {
      if (this.closed || this.peer !== peer || track.kind !== 'audio') return
      applyJitterBufferTargets(peer.getReceivers(), this.jitter.targets())
      this.callbacks.track(track)
    }
    peer.onconnectionstatechange = () => {
      if (this.closed || this.peer !== peer) return
      if (peer.connectionState === 'connected') {
        window.clearTimeout(this.connectTimer)
        window.clearTimeout(this.disconnectTimer)
        this.callbacks.ready()
      } else if (peer.connectionState === 'failed') {
        this.recover('connection')
      } else if (peer.connectionState === 'disconnected') {
        window.clearTimeout(this.disconnectTimer)
        this.disconnectTimer = window.setTimeout(() => {
          if (peer.connectionState === 'disconnected') this.recover('connection')
        }, 2500)
      }
    }

    const offer = await peer.createOffer()
    if (this.closed) return
    if (offer.sdp) offer.sdp = preferLowDelayOpus(applyOpusStereoPreference(offer.sdp, stereo))
    await peer.setLocalDescription(offer)
    await this.waitForCandidates(peer)
    if (this.closed) return
    const answer = await api.createWebRTCSession(peer.localDescription?.sdp || '', false, 'audio')
    if (this.closed) {
      await api.closeWebRTCSession(answer.session_id, true).catch(() => undefined)
      return
    }
    this.id = answer.session_id
    this.connectTimer = window.setTimeout(() => this.recover('connection'), 10_000)
    await peer.setRemoteDescription({ type: 'answer', sdp: preferLowDelayOpus(answer.sdp) })
    if (this.closed) return
    const sample = async () => {
      const reports = await peer.getStats().catch(() => null)
      if (!reports || this.closed || this.peer !== peer || this.recovering) return
      applyJitterBufferTargets(peer.getReceivers(), this.jitter.sample(reports))
      const { audio } = this.stats.sample(reports)
      this.callbacks.stats(audio)
      const count = readInboundAudio(reports)?.jitterBufferEmittedCount || 0
      const fresh = count > this.emittedCount
      const initialized = this.emittedCount > 0
      this.emittedCount = count
      const audioLevel = readInboundAudioLevel(reports)
      if (audioLevel === null) this.audibleSamples = 3
      else if (audioLevel > 0.001) this.audibleSamples = Math.min(3, this.audibleSamples + 1)
      else this.audibleSamples = 0
      const audible = audioLevel === null || this.audibleSamples >= 3
      if (this.recovery.sample(
        audio.jitterBufferUs,
        performance.now(),
        initialized && fresh && audible && this.callbacks.playing(),
      )) {
        this.recover('latency')
      }
    }
    void sample()
    this.statsTimer = window.setInterval(sample, 1000)
  }

  private recover(reason: AudioRecoveryReason) {
    if (this.closed || this.recovering) return
    this.recovering = true
    this.callbacks.recover(reason)
  }

  private waitForCandidates(peer: RTCPeerConnection): Promise<void> {
    if (peer.iceGatheringState === 'complete' || this.closed) return Promise.resolve()
    return new Promise((resolve) => {
      const listener = () => { if (peer.iceGatheringState === 'complete') done() }
      const done = () => {
        window.clearTimeout(timer)
        peer.removeEventListener('icegatheringstatechange', listener)
        this.cancelGathering = null
        resolve()
      }
      const timer = window.setTimeout(done, 3000)
      this.cancelGathering = done
      peer.addEventListener('icegatheringstatechange', listener)
    })
  }

  async destroy() {
    this.closed = true
    window.clearInterval(this.statsTimer)
    window.clearTimeout(this.connectTimer)
    window.clearTimeout(this.disconnectTimer)
    this.cancelGathering?.()
    this.peer?.close()
    this.peer = null
    this.sender = null
    this.recovery.reset()
    const id = this.id
    this.id = ''
    if (id) await api.closeWebRTCSession(id, true).catch(() => undefined)
  }
}
