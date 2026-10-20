/* Runs on the audio render thread. Network and UI never block this clock. */
class PCMPlayback extends AudioWorkletProcessor {
  constructor() {
    super()
    this.capacity = Math.ceil(sampleRate * 0.16)
    this.left = new Float32Array(this.capacity)
    this.right = new Float32Array(this.capacity)
    this.read = 0
    this.queued = 0
    this.started = false
    this.targetFrames = Math.ceil(sampleRate * 0.02)
    this.maxQueuedFrames = Math.ceil(sampleRate * 0.08)
    this.reportFrames = 0
    this.dropped = 0
    this.underruns = 0
    this.port.onmessage = ({ data }) => {
      if (data.type === 'buffering') {
        // Three 20ms LZ4 packets arrive together. Keep a batch plus jitter
        // headroom instead of draining to zero before the next network wake.
        this.targetFrames = Math.ceil(sampleRate * (data.batched ? 0.08 : 0.02))
        this.maxQueuedFrames = Math.ceil(sampleRate * (data.batched ? 0.14 : 0.08))
        return
      }
      if (data.type === 'flush' || data.reset) {
        this.read = 0
        this.queued = 0
        this.started = false
      }
      if (data.type !== 'audio' && data.type !== 'decoded') return
      const pcm = data.type === 'audio' ? new DataView(data.buffer, 32) : null
      const channels = pcm ? data.channels : data.planes.length
      const sourceFrames = pcm ? pcm.byteLength / (2 * channels) : data.planes[0].length
      const outputFrames = Math.floor(sourceFrames * sampleRate / data.sampleRate)
      for (let index = 0; index < outputFrames; index++) {
        const position = index * data.sampleRate / sampleRate
        const first = Math.floor(position)
        const next = Math.min(first + 1, sourceFrames - 1)
        const fraction = position - first
        const at = (this.read + this.queued) % this.capacity
        for (let channel = 0; channel < 2; channel++) {
          const sourceChannel = Math.min(channel, channels - 1)
          const a = pcm ? pcm.getInt16((first * channels + sourceChannel) * 2, true) / 32768 : data.planes[sourceChannel][first]
          const b = pcm ? pcm.getInt16((next * channels + sourceChannel) * 2, true) / 32768 : data.planes[sourceChannel][next]
          ;(channel === 0 ? this.left : this.right)[at] = a + (b - a) * fraction
        }
        if (this.queued < this.capacity) this.queued++
        else { this.read = (this.read + 1) % this.capacity; this.dropped++ }
      }
      if (this.queued > this.maxQueuedFrames) {
        const drop = this.queued - this.targetFrames
        this.read = (this.read + drop) % this.capacity
        this.queued -= drop
        this.dropped += drop
      }
    }
  }
  process(_inputs, outputs) {
    const output = outputs[0]
    if (!output?.length) return true
    if (!this.started && this.queued >= this.targetFrames) this.started = true
    for (let frame = 0; frame < output[0].length; frame++) {
      if (this.started && this.queued > 0) {
        output[0][frame] = this.left[this.read]
        if (output[1]) output[1][frame] = this.right[this.read]
        this.read = (this.read + 1) % this.capacity
        this.queued--
      } else {
        if (this.started) this.underruns++
        this.started = false
        output[0][frame] = 0
        if (output[1]) output[1][frame] = 0
      }
    }
    this.reportFrames += output[0].length
    if (this.reportFrames >= sampleRate) {
      this.port.postMessage({ type: 'stats', bufferedUs: Math.round(this.queued / sampleRate * 1e6), droppedFrames: this.dropped, underruns: this.underruns })
      this.reportFrames = 0
    }
    return true
  }
}

class PCMCapture extends AudioWorkletProcessor {
  constructor() {
    super()
    this.packet = new ArrayBuffer(1920)
    this.view = new DataView(this.packet)
    this.frames = 0
    this.sourceFrame = 0
    this.nextOutput = 0
    this.previous = 0
  }
  process(inputs) {
    const input = inputs[0]?.[0]
    if (!input) return true
    for (const value of input) {
      while (this.nextOutput <= this.sourceFrame) {
        const fraction = Math.max(0, this.nextOutput - this.sourceFrame + 1)
        const sample = this.previous + (value - this.previous) * fraction
        const clamped = Math.max(-1, Math.min(1, sample))
        this.view.setInt16(this.frames * 2, Math.round(clamped * (clamped < 0 ? 32768 : 32767)), true)
        this.frames++
        this.nextOutput += sampleRate / 48000
        if (this.frames === 960) {
          this.port.postMessage(this.packet, [this.packet])
          this.packet = new ArrayBuffer(1920)
          this.view = new DataView(this.packet)
          this.frames = 0
        }
      }
      this.previous = value
      this.sourceFrame++
    }
    return true
  }
}
registerProcessor('onekvm-pcm-playback', PCMPlayback)
registerProcessor('onekvm-pcm-capture', PCMCapture)
