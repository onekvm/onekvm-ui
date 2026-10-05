import JMuxer from 'jmuxer'

import { normalizeWebSocketVideoCodec, supportsWebSocketVideo, type WebSocketVideoCodec } from '@/lib/websocket-video-support'

const HEADER_SIZE = 40
const MAGIC = [0x4f, 0x4b, 0x56, 0x46]

interface WebSocketVideoCallbacks {
  bitrate: (kbps: number) => void
  disconnected: (message: string, codecUnsupported?: boolean) => void
}

type ExtendedJMuxerOptions = JMuxer.Options & {
  videoCodec: 'H264' | 'H265'
  live: boolean
  onUnsupportedCodec: () => void
  onLoggerLog: (...data: unknown[]) => void
  onLoggerErr: (...data: unknown[]) => void
}

type CompleteVideoFrame = JMuxer.Feeder & {
  isLastVideoFrameComplete: true
}

export class WebSocketVideo {
  static isSupported(codecName: string) {
    return supportsWebSocketVideo(codecName)
  }

  private socket: WebSocket | null = null
  private muxer: JMuxer | null = null
  private codec: WebSocketVideoCodec
  private closed = false
  private opened = false
  private waitingForKeyframe = true
  private lastSequence: bigint | null = null
  private sampleStartedAt = 0
  private sampleBytes = 0
  private startupTimer: ReturnType<typeof setTimeout> | undefined
  private decoded = false
  private playbackFailed = false
  private readonly onDecoded = () => {
    this.decoded = true
    clearTimeout(this.startupTimer)
    this.startupTimer = undefined
  }
  private readonly onMediaError = () => this.failPlayback(
    `Video decoder failed for ${this.codec.toUpperCase()} over WebSocket`,
    this.video.error?.code === 3 || this.video.error?.code === 4,
  )
  private readonly debug = localStorage.getItem('onekvm-video-debug') === 'true'

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly url: string,
    codecName: string,
    private readonly callbacks: WebSocketVideoCallbacks,
  ) {
    const codec = normalizeWebSocketVideoCodec(codecName)
    if (!codec || !supportsWebSocketVideo(codec)) {
      throw new Error(`WebSocket video playback is unavailable for ${codecName || 'this codec'}`)
    }
    this.codec = codec
  }

  connect() {
    return new Promise<void>((resolve, reject) => {
      this.closed = false
      this.video.addEventListener('loadeddata', this.onDecoded)
      this.video.addEventListener('error', this.onMediaError)
      this.createMuxer()

      const socket = new WebSocket(this.url, 'onekvm.video.v1')
      socket.binaryType = 'arraybuffer'
      this.socket = socket

      socket.onopen = () => {
        if (this.socket !== socket || this.closed) {
          socket.close()
          return
        }
        this.opened = true
        this.log('socket opened')
        this.requestKeyframe()
        resolve()
      }
      socket.onmessage = (event) => {
        if (this.socket === socket && event.data instanceof ArrayBuffer) {
          this.handleFrame(event.data)
        }
      }
      socket.onerror = () => {
        if (!this.opened) reject(new Error('Video WebSocket connection failed'))
      }
      socket.onclose = () => {
        if (this.socket === socket) this.socket = null
        if (this.closed) return
        if (!this.opened) {
          reject(new Error('Video WebSocket connection closed'))
        } else {
          this.callbacks.disconnected('Video WebSocket connection closed')
        }
      }
    })
  }

  destroy() {
    this.closed = true
    clearTimeout(this.startupTimer)
    this.startupTimer = undefined
    this.video.removeEventListener('loadeddata', this.onDecoded)
    this.video.removeEventListener('error', this.onMediaError)
    const socket = this.socket
    this.socket = null
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close()
    this.muxer?.destroy()
    this.muxer = null
    this.video.pause()
    this.video.removeAttribute('src')
    this.video.load()
    this.callbacks.bitrate(0)
  }

  private createMuxer() {
    this.muxer?.destroy()
    const options: ExtendedJMuxerOptions = {
      node: this.video,
      mode: 'video',
      videoCodec: this.codec === 'h264' ? 'H264' : 'H265',
      live: true,
      flushingTime: 0,
      maxDelay: 120,
      clearBuffer: true,
      debug: false,
      onReady: () => {
        this.log('MSE ready')
        this.requestKeyframe()
      },
      onError: (data: { name?: string }) => {
        if (data.name === 'InvalidStateError' && !this.video.error) {
          this.waitingForKeyframe = true
          this.requestKeyframe()
        } else {
          this.failPlayback(`Video buffer failed for ${this.codec.toUpperCase()} over WebSocket`, true)
        }
      },
      onUnsupportedCodec: () => {
        this.failPlayback(`The browser cannot decode ${this.codec.toUpperCase()} over WebSocket`, true)
      },
      onLoggerLog: (...data) => console.debug('[OneKVM WebSocket video]', ...data),
      onLoggerErr: (...data) => console.error('[OneKVM WebSocket video]', ...data),
    }
    options.debug = this.debug
    this.muxer = new JMuxer(options)
  }

  private handleFrame(buffer: ArrayBuffer) {
    if (this.closed || this.playbackFailed) return
    if (buffer.byteLength < HEADER_SIZE) return
    const bytes = new Uint8Array(buffer)
    if (!MAGIC.every((value, index) => bytes[index] === value) || bytes[4] !== 1) return

    const view = new DataView(buffer)
    const frameCodec = bytes[5] === 1 ? 'h264' : bytes[5] === 2 ? 'h265' : null
    const keyframe = Boolean(bytes[6] & 1)
    const sequence = view.getBigUint64(8)
    const durationUsec = view.getUint32(24)
    const payloadLength = view.getUint32(32)
    if (!frameCodec || frameCodec !== this.codec || payloadLength !== buffer.byteLength - HEADER_SIZE) {
      return
    }

    if (this.lastSequence !== null && sequence !== this.lastSequence + 1n) {
      this.waitingForKeyframe = true
      this.requestKeyframe()
    }
    this.lastSequence = sequence
    if (this.waitingForKeyframe && !keyframe) return
    if (keyframe && this.waitingForKeyframe) {
      this.waitingForKeyframe = false
      this.log('keyframe received', { sequence: String(sequence), bytes: payloadLength })
    }

    const frame: CompleteVideoFrame = {
      video: bytes.subarray(HEADER_SIZE),
      duration: Math.max(1, durationUsec / 1000),
      isLastVideoFrameComplete: true,
    }
    if (!this.decoded && this.startupTimer === undefined) {
      this.startupTimer = setTimeout(() => {
        this.failPlayback(`The browser could not start ${this.codec.toUpperCase()} playback over WebSocket`, true)
      }, 5000)
    }
    try {
      this.muxer?.feed(frame)
    } catch {
      this.failPlayback(`Video decoder failed for ${this.codec.toUpperCase()} over WebSocket`, true)
      return
    }
    void this.video.play().catch(() => undefined)
    this.recordBytes(payloadLength)
  }

  private requestKeyframe() {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send('keyframe')
  }

  private failPlayback(message: string, codecUnsupported: boolean) {
    if (this.closed || this.playbackFailed) return
    this.playbackFailed = true
    clearTimeout(this.startupTimer)
    this.startupTimer = undefined
    // JMuxer can report failure while feeding. Dispose it after that call
    // unwinds so its own buffer/remux callbacks cannot access destroyed state.
    queueMicrotask(() => {
      if (!this.closed) this.callbacks.disconnected(message, codecUnsupported)
    })
  }

  private recordBytes(bytes: number) {
    const now = performance.now()
    if (!this.sampleStartedAt) this.sampleStartedAt = now
    this.sampleBytes += bytes
    const elapsed = now - this.sampleStartedAt
    if (elapsed < 1000) return
    this.callbacks.bitrate(Math.max(0, Math.round((this.sampleBytes * 8) / elapsed)))
    this.sampleStartedAt = now
    this.sampleBytes = 0
  }

  private log(message: string, detail?: unknown) {
    if (this.debug) console.debug('[OneKVM WebSocket video]', message, detail ?? '')
  }
}
