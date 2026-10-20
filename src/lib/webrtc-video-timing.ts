// Encode-output → last video packet received, matched by the actual RTP
// timestamp. Device CLOCK_MONOTONIC and browser performance.now are unrelated.
// Four timestamps estimate their offset; the lowest RTT bounds asymmetry.
export const VIDEO_TIMING_CHANNEL = 'onekvm.video-timing.v1'
const CLOCK_MAX_AGE_US = 20_000_000
const FRAME_MAX_AGE_US = 5_000_000
type Clock = { at: number; offset: number; rtt: number }
type Frame = { at: number; encoded?: number; received?: number }

export class VideoTimingSampler {
  private probes = new Map<number, number>()
  private clocks: Clock[] = []
  private frames = new Map<number, Frame>()
  private matched: Frame[] = []
  private sequence = 0

  probe(nowUs: number): Uint8Array {
    const id = this.sequence = (this.sequence + 1) >>> 0
    this.probes.set(id, nowUs)
    if (this.probes.size > 32) this.probes.delete(this.probes.keys().next().value!)
    const bytes = new Uint8Array(5)
    bytes[0] = 1
    new DataView(bytes.buffer).setUint32(1, id)
    return bytes
  }

  message(bytes: Uint8Array, nowUs: number) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    if (bytes.length === 21 && bytes[0] === 2) {
      const id = view.getUint32(1)
      const start = this.probes.get(id)
      this.probes.delete(id)
      if (start === undefined) return
      const received = Number(view.getBigUint64(5)) / 1000
      const sent = Number(view.getBigUint64(13)) / 1000
      const rtt = nowUs - start - (sent - received)
      if (received <= 0 || sent < received || rtt < 0 || rtt > 1_000_000) return
      this.clocks = this.clocks.filter(c => nowUs - c.at < CLOCK_MAX_AGE_US)
      this.clocks.push({ at: nowUs, offset: ((received - start) + (sent - nowUs)) / 2, rtt })
      if (this.clocks.length > 64) this.clocks.shift()
    } else if (bytes.length === 13 && bytes[0] === 3) {
      const encoded = Number(view.getBigUint64(5)) / 1000
      if (encoded > 0) this.join(view.getUint32(1), { encoded }, nowUs)
    }
  }

  frame(metadata: Pick<VideoFrameCallbackMetadata, 'rtpTimestamp' | 'receiveTime'>, nowUs: number) {
    if (metadata.rtpTimestamp === undefined || metadata.receiveTime === undefined
      || !Number.isFinite(metadata.receiveTime) || metadata.receiveTime < 0) return
    this.join(metadata.rtpTimestamp >>> 0, { received: metadata.receiveTime * 1000 }, nowUs)
  }

  private join(timestamp: number, part: Partial<Frame>, nowUs: number) {
    for (const [key, value] of this.frames) {
      if (nowUs - value.at > FRAME_MAX_AGE_US) this.frames.delete(key)
    }
    const frame = { ...this.frames.get(timestamp), ...part, at: nowUs }
    if (frame.encoded !== undefined && frame.received !== undefined) {
      this.frames.delete(timestamp)
      this.matched.push(frame)
      if (this.matched.length > 32) this.matched.shift()
    } else {
      this.frames.set(timestamp, frame)
      if (this.frames.size > 256) this.frames.delete(this.frames.keys().next().value!)
    }
  }

  sample(nowUs: number): { transportUs: number | null; transportErrorUs: number | null } {
    const clock = this.clocks.filter(c => nowUs - c.at < CLOCK_MAX_AGE_US)
      .reduce<Clock | undefined>((best, c) => !best || c.rtt < best.rtt ? c : best, undefined)
    this.matched = this.matched.filter(f => nowUs - f.at < FRAME_MAX_AGE_US)
    if (!clock) return { transportUs: null, transportErrorUs: null }
    const values = this.matched.map(f => f.received! - (f.encoded! - clock.offset))
      .filter(v => v >= 0 && v < 10_000_000)
    return {
      transportUs: values.length ? Math.round(values.reduce((sum, v) => sum + v, 0) / values.length) : null,
      transportErrorUs: values.length ? Math.ceil(clock.rtt / 2) : null,
    }
  }

  resetFrames() {
    this.frames.clear()
    this.matched = []
  }
}

export class WebRTCVideoTiming {
  readonly sampler = new VideoTimingSampler()
  private channel: RTCDataChannel
  private timer: ReturnType<typeof setTimeout> | undefined
  private closed = false
  private probes = 0

  constructor(channel: RTCDataChannel) {
    this.channel = channel
    channel.binaryType = 'arraybuffer'
    channel.onmessage = event => {
      if (!this.closed && event.data instanceof ArrayBuffer) {
        this.sampler.message(new Uint8Array(event.data), performance.now() * 1000)
      }
    }
    channel.onopen = () => this.probe()
    channel.onclose = () => this.destroy()
  }

  private probe() {
    if (this.closed || this.channel.readyState !== 'open') return
    if (this.channel.bufferedAmount < 4096) {
      try { this.channel.send(this.sampler.probe(performance.now() * 1000) as Uint8Array<ArrayBuffer>) } catch { /* optional telemetry */ }
    }
    this.timer = setTimeout(() => this.probe(), ++this.probes < 8 ? 100 : 1000)
  }

  destroy() {
    if (this.closed) return
    this.closed = true
    clearTimeout(this.timer)
    this.channel.onopen = this.channel.onmessage = this.channel.onclose = null
    this.channel.close()
    this.sampler.resetFrames()
  }
}
