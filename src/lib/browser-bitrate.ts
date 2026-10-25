import { forEachRtcStat } from './webrtc-playback-stats.ts'

export const BITRATE_CHANNEL = 'onekvm.bitrate.v1'
type Stat = RTCStats & Record<string, unknown>
type Snapshot = {
  id: string; time: number; bytes: number; packets: number; lost: number
  frames: number; decode: number; delay: number; emitted: number
}
const value = (stat: Stat, key: string) => typeof stat[key] === 'number' && Number.isFinite(stat[key]) ? stat[key] as number : 0

/** One decision per existing getStats sample; no probe, packet history or extra timer. */
export class BrowserBitrate {
  private maximum = 0
  private accepted = 0
  private previous: Snapshot | null = null
  private minimumRtt = Infinity
  private clean = 0
  private congested = 0
  private lastChange = -Infinity
  private lastSample = -Infinity
  private route: string | null = null
  private paced = false
  private pacingClean = 0
  private decodeMs = 0
  private lowFrames = 0

  private channel: Pick<RTCDataChannel, 'readyState' | 'bufferedAmount' | 'send'>

  constructor(channel: Pick<RTCDataChannel, 'readyState' | 'bufferedAmount' | 'send'>) { this.channel = channel }

  get cap(): number | null { return this.accepted || null }

  status(data: unknown) {
    if (!(data instanceof ArrayBuffer) || data.byteLength !== 12) return
    const view = new DataView(data)
    if (view.getUint32(0) !== 0x4f4b4253) return // OKBS
    this.maximum = view.getUint32(4)
    this.accepted = Math.min(view.getUint32(8), this.maximum)
    if (!this.maximum) { this.paced = false; this.resetSamples() }
  }

  start() { this.send(3000) }

  query() { this.send(0) }

  private send(kbps: number) {
    if (this.channel.readyState !== 'open' || this.channel.bufferedAmount > 0) return
    const message = new ArrayBuffer(8)
    const view = new DataView(message)
    view.setUint32(0, this.paced && kbps !== 0 ? 0x4f4b4250 : 0x4f4b4251) // OKBP / OKBQ
    view.setUint32(4, Math.round(kbps))
    try { this.channel.send(message) } catch { /* Peer may close between stats and send. */ }
  }

  private resetSamples() {
    this.previous = null
    this.minimumRtt = Infinity
    this.clean = 0
    this.congested = 0
    this.pacingClean = 0
    this.decodeMs = 0
    this.lowFrames = 0
  }

  sample(reports: RTCStatsReport | Iterable<RTCStats>, rttMs: number | null, route: string | null, visible: boolean) {
    let video: Stat | undefined
    forEachRtcStat(reports, stat => {
      const item = stat as Stat
      if (item.type === 'inbound-rtp' && (item.kind ?? item.mediaType) === 'video' && !item.isRemote) video = item
    })
    if (!video) { this.query(); return }
    const next: Snapshot = {
      id: video.id, time: video.timestamp, bytes: value(video, 'bytesReceived'),
      packets: value(video, 'packetsReceived'), lost: value(video, 'packetsLost'),
      frames: value(video, 'framesDecoded'), decode: value(video, 'totalDecodeTime'),
      delay: value(video, 'jitterBufferDelay'), emitted: value(video, 'jitterBufferEmittedCount'),
    }
    // Avoid reacting to stale overlapping getStats calls or background throttling.
    if (next.time <= this.lastSample) return
    this.lastSample = next.time
    if (route !== this.route) { this.resetSamples(); this.route = route }
    const previous = this.previous
    this.previous = visible ? next : null
    const elapsed = previous ? next.time - previous.time : 0
    const reset = !visible || !previous || previous.id !== next.id || elapsed < 500 || elapsed > 3000
      || next.bytes < previous.bytes || next.packets < previous.packets || next.frames < previous.frames
      || next.decode < previous.decode || next.delay < previous.delay || next.emitted < previous.emitted
    if (reset) {
      this.minimumRtt = rttMs !== null && rttMs >= 0 ? rttMs : Infinity
      this.clean = this.congested = this.pacingClean = 0
      this.decodeMs = 0
      this.lowFrames = 0
      this.send(visible && this.maximum && !this.accepted ? Math.min(3000, this.maximum) : 0)
      return
    }
    if (!this.maximum || !this.accepted) {
      this.send(this.maximum ? Math.min(3000, this.maximum) : 0)
      return
    }
    if (rttMs !== null && rttMs >= 0) this.minimumRtt = Math.min(this.minimumRtt, rttMs)
    const received = next.packets - previous.packets
    const lost = Math.max(0, next.lost - previous.lost)
    const loss = lost / Math.max(1, received + lost)
    const kbps = (next.bytes - previous.bytes) * 8 / elapsed
    const frames = next.frames - previous.frames
    const emitted = next.emitted - previous.emitted
    const delayMs = emitted > 0 ? (next.delay - previous.delay) * 1000 / emitted : 0
    if (frames > 0) this.decodeMs = (next.decode - previous.decode) * 1000 / frames
    const queued = rttMs !== null && rttMs > this.minimumRtt + Math.max(40, this.minimumRtt * 0.5)
    // Decoder load/freeze alone is not evidence of a bandwidth bottleneck.
    const pressure = loss >= 0.025 || queued || (delayMs > 100 && loss >= 0.005)
    if (pressure) this.paced = true
    this.pacingClean = !pressure ? this.pacingClean + 1 : 0
    if (this.paced && this.pacingClean >= 10 && this.accepted >= 3000 && kbps <= this.accepted * 0.95) {
      this.paced = false
    }
    this.congested = pressure ? this.congested + 1 : 0
    this.clean = !pressure && loss < 0.005 && this.decodeMs < 25 ? this.clean + 1 : 0
    this.lowFrames = frames * 1000 / elapsed < 10 ? this.lowFrames + 1 : 0
    const floor = Math.min(300, this.maximum)
    let target = this.accepted
    if ((loss >= 0.08 || this.congested >= 2) && next.time - this.lastChange >= 2000) {
      target = Math.max(floor, Math.floor(Math.min(this.accepted * 0.75, kbps > floor ? kbps * 0.85 : this.accepted * 0.75)))
    } else if (this.paced && this.accepted < Math.min(3000, this.maximum)
      && this.lowFrames >= 3 && this.clean >= 3 && next.time - this.lastChange >= 4000) {
      // A small sender budget can stall whole GOPs even on a recovered path.
      // Restore only the startup ceiling, with healthy feedback and decoder headroom.
      target = Math.min(3000, this.maximum, Math.ceil(this.accepted + Math.max(400, this.accepted * 0.25)))
    } else if (this.clean >= 5 && kbps >= this.accepted * 0.7 && next.time - this.lastChange >= 4000) {
      target = Math.min(this.maximum, Math.ceil(this.accepted + Math.max(200, this.accepted * 0.12)))
    }
    if (target !== this.accepted) {
      this.lastChange = next.time
      this.clean = this.congested = 0
    }
    // Reassert mode and cap each sample so lost commands cannot leave pacing
    // enabled or disabled indefinitely. Unchanged caps do not reset the encoder.
    // Only acknowledgments update the displayed cap.
    this.send(target)
  }
}
