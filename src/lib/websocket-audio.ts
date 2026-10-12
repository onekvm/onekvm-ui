import { parseOpusAudioFrame, parsePCMAudioFrame, microphonePCMFrame } from './websocket-audio-protocol'
import { WebSocketOpusDecoder } from './websocket-opus-decoder'
import type { BrowserAudioStats } from './webrtc-playback-stats'

interface AudioCallbacks {
  stats: (value: BrowserAudioStats) => void
  disconnected: (message: string) => void
}
type PendingRequest = { resolve: (enabled: boolean) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }

export class WebSocketAudio {
  private socket: WebSocket | null = null
  private decoder: WebSocketOpusDecoder | null = null
  private codec: 'opus' | 'pcm' = 'pcm'
  private context: AudioContext | null = null
  private playback: AudioWorkletNode | null = null
  private speaker: GainNode | null = null
  private capture: AudioWorkletNode | null = null
  private microphone: GainNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private analyser: AnalyserNode | null = null
  private id = ''
  private closed = false
  private lastSequence: bigint | null = null
  private lastReceived = 0
  private microphoneSequence = 0n
  private requestID = 0
  private pending = new Map<number, PendingRequest>()
  private microphoneActive = false
  private bufferedUs = 0
  private sampleBytes = 0
  private samplePackets = 0
  private sampledAt = 0
  private statsTimer: ReturnType<typeof setInterval> | undefined
  private connectTimer: ReturnType<typeof setTimeout> | undefined
  private connectReject: ((error: Error) => void) | null = null

  constructor(private readonly url: string, private readonly callbacks: AudioCallbacks) {}

  sessionID() { return this.id }
  microphoneAnalyser() { return this.analyser }

  async connect() {
    const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextCtor) throw new Error('Web Audio is unavailable')
    const context = new AudioContextCtor({ latencyHint: 'interactive', sampleRate: 48000 })
    this.context = context
    await context.audioWorklet.addModule(new URL('./websocket-audio-worklet.js', import.meta.url).href)
    if (this.closed) throw new Error('Audio connection closed')
    this.playback = new AudioWorkletNode(context, 'onekvm-pcm-playback', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] })
    this.speaker = context.createGain()
    this.playback.connect(this.speaker)
    this.speaker.connect(context.destination)
    this.playback.port.onmessage = ({ data }) => {
      if (data.type === 'stats') this.bufferedUs = data.bufferedUs
    }
    this.sampledAt = performance.now()
    this.statsTimer = setInterval(() => this.reportStats(), 1000)
    const opusSupported = await WebSocketOpusDecoder.supported()
    if (this.closed) throw new Error('Audio connection closed')
    if (opusSupported) {
      this.decoder = new WebSocketOpusDecoder((planes, sampleRate, reset) => {
        if (this.closed || this.context?.state !== 'running') return
        this.playback?.port.postMessage({ type: 'decoded', planes, sampleRate, reset }, planes.map(plane => plane.buffer))
      }, () => {
        if (!this.closed) this.socket?.close()
      })
    }
    return new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(this.url, opusSupported ? ['onekvm.audio.opus.v1', 'onekvm.audio.v1'] : 'onekvm.audio.v1')
      socket.binaryType = 'arraybuffer'
      this.socket = socket
      let ready = false
      const timer = setTimeout(() => { reject(new Error('Audio WebSocket connection timed out')); socket.close() }, 5000)
      this.connectTimer = timer
      this.connectReject = reject
      socket.onmessage = ({ data }) => {
        if (this.closed || this.socket !== socket) return
        if (data instanceof ArrayBuffer) { this.receive(data); return }
        if (typeof data !== 'string') return
        let message: { type?: string; session_id?: string; codec?: string; request_id?: number; microphone?: boolean; error?: string }
        try { message = JSON.parse(data) } catch { return }
        if (message.type === 'ready' && message.session_id) {
          clearTimeout(timer)
          this.connectReject = null
          this.id = message.session_id
          this.codec = message.codec === 'opus' ? 'opus' : 'pcm'
          ready = true
          resolve()
        } else if (message.type === 'microphone' && typeof message.request_id === 'number') {
          const pending = this.pending.get(message.request_id)
          if (!pending) return
          clearTimeout(pending.timer)
          this.pending.delete(message.request_id)
          this.microphoneActive = Boolean(message.microphone)
          if (message.error) pending.reject(new Error(message.error))
          else pending.resolve(this.microphoneActive)
        }
      }
      socket.onerror = () => { if (!ready) { clearTimeout(timer); reject(new Error('Audio WebSocket connection failed')) } }
      socket.onclose = () => {
        clearTimeout(timer)
        this.id = ''
        this.microphoneActive = false
        this.rejectPending()
        if (this.closed || this.socket !== socket) return
        if (!ready) reject(new Error('Audio WebSocket connection closed'))
        else this.callbacks.disconnected('Audio WebSocket connection closed')
      }
    })
  }

  resume() {
    if (!this.context || this.closed) return
    if (this.context.state !== 'running') this.playback?.port.postMessage({ type: 'flush' })
    void this.context.resume().catch(() => undefined)
  }

  setSpeaker(enabled: boolean, volume: number) {
    if (this.speaker) this.speaker.gain.value = enabled ? volume : 0
  }
  setMicrophoneGain(volume: number) { if (this.microphone) this.microphone.gain.value = volume }

  setMicrophone(enabled: boolean) {
    const socket = this.socket
    if (!socket || socket.readyState !== WebSocket.OPEN || !this.id) return Promise.reject(new Error('Audio WebSocket is unavailable'))
    if (!enabled) this.microphoneActive = false
    const requestID = ++this.requestID
    return new Promise<boolean>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestID)
        // A timed-out claim may have reached the server. Closing releases it.
        socket.close()
        reject(new Error('Microphone request timed out'))
      }, 5000)
      this.pending.set(requestID, { resolve, reject, timer })
      socket.send(JSON.stringify({ type: 'microphone', request_id: requestID, enabled }))
    })
  }

  startMicrophone(stream: MediaStream, volume: number) {
    this.stopMicrophone()
    const context = this.context
    if (!context || this.closed) throw new Error('Audio connection closed')
    this.source = context.createMediaStreamSource(stream)
    this.microphone = context.createGain()
    this.microphone.gain.value = volume
    this.analyser = context.createAnalyser()
    this.analyser.fftSize = 256
    this.capture = new AudioWorkletNode(context, 'onekvm-pcm-capture', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: 'explicit', outputChannelCount: [1] })
    this.source.connect(this.microphone)
    this.microphone.connect(this.analyser)
    this.analyser.connect(this.capture)
    // Capture outputs silence; connecting it keeps the render clock alive.
    this.capture.connect(context.destination)
    this.capture.port.onmessage = ({ data }) => {
      const socket = this.socket
      if (!(data instanceof ArrayBuffer) || !this.microphoneActive || !socket || socket.readyState !== WebSocket.OPEN || socket.bufferedAmount > 7680) return
      socket.send(microphonePCMFrame(data, this.microphoneSequence++, context.currentTime * 1e6))
    }
    this.resume()
  }

  playMicrophoneTestTone() {
    if (!this.context || !this.microphone) return false
    const oscillator = this.context.createOscillator()
    const gain = this.context.createGain()
    oscillator.frequency.value = 880
    gain.gain.value = 0.22
    oscillator.connect(gain)
    gain.connect(this.microphone)
    oscillator.start()
    oscillator.stop(this.context.currentTime + 0.55)
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
    return true
  }

  stopMicrophone() {
    if (this.capture) this.capture.port.onmessage = null
    this.source?.disconnect()
    this.microphone?.disconnect()
    this.analyser?.disconnect()
    this.capture?.disconnect()
    this.source = null
    this.microphone = null
    this.analyser = null
    this.capture = null
  }

  destroy() {
    this.closed = true
    this.microphoneActive = false
    this.id = ''
    clearTimeout(this.connectTimer)
    this.connectReject?.(new Error('Audio connection closed'))
    this.connectReject = null
    clearInterval(this.statsTimer)
    this.stopMicrophone()
    this.rejectPending()
    const socket = this.socket
    this.socket = null
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close()
    this.playback?.disconnect()
    this.decoder?.destroy()
    this.decoder = null
    this.speaker?.disconnect()
    void this.context?.close().catch(() => undefined)
    this.context = null
    this.callbacks.stats({ bitrateKbps: 0, packetsPerSecond: 0, jitterBufferUs: 0 })
  }

  private rejectPending() {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Error('Audio connection closed'))
    }
    this.pending.clear()
  }

  private receive(buffer: ArrayBuffer) {
    const opus = parseOpusAudioFrame(buffer)
    const frame = opus ?? parsePCMAudioFrame(buffer)
    if (!frame || (this.lastSequence !== null && frame.sequence <= this.lastSequence)) return
    const now = performance.now()
    const reset = this.lastSequence !== null && (frame.sequence !== this.lastSequence + 1n || now - this.lastReceived > 160)
    this.lastSequence = frame.sequence
    this.lastReceived = now
    this.sampleBytes += frame.payloadBytes
    this.samplePackets++
    this.codec = opus ? 'opus' : 'pcm'
    // Never build a port-message backlog while autoplay is suspended.
    if (this.context?.state !== 'running') return
    if (opus) {
      try { this.decoder?.decode(buffer, opus, reset) } catch { this.socket?.close() }
      return
    }
    this.playback?.port.postMessage({ type: 'audio', buffer, channels: frame.channels, sampleRate: frame.sampleRate, reset }, [buffer])
  }

  private reportStats() {
    const now = performance.now()
    const elapsed = now - this.sampledAt
    this.callbacks.stats({ codec: this.codec, bitrateKbps: Math.round(this.sampleBytes * 8 / elapsed), packetsPerSecond: Math.round(this.samplePackets * 1000 / elapsed), jitterBufferUs: this.bufferedUs })
    this.sampledAt = now
    this.sampleBytes = 0
    this.samplePackets = 0
  }
}
