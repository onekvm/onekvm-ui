import { AUDIO_HEADER_SIZE, type OpusAudioFrame } from './websocket-audio-protocol'

// Audio WebCodecs are not yet declared by the project's TypeScript DOM lib.
interface DecodedAudio {
  numberOfFrames: number
  numberOfChannels: number
  sampleRate: number
  copyTo(destination: Float32Array, options: { planeIndex: number; format: 'f32-planar' }): void
  close(): void
}
interface Decoder {
  decodeQueueSize: number
  configure(config: OpusConfig): void
  decode(chunk: unknown): void
  close(): void
}
type OpusConfig = { codec: 'opus'; sampleRate: number; numberOfChannels: number }
type AudioCodecs = {
  AudioDecoder?: {
    new (callbacks: { output: (audio: DecodedAudio) => void; error: (error: Error) => void }): Decoder
    isConfigSupported(config: OpusConfig): Promise<{ supported: boolean }>
  }
  EncodedAudioChunk?: new (value: { type: 'key'; timestamp: number; data: Uint8Array }) => unknown
}
const codecs = () => globalThis as unknown as AudioCodecs
let failed = false

export class WebSocketOpusDecoder {
  static async supported() {
    const { AudioDecoder, EncodedAudioChunk } = codecs()
    if (failed || !AudioDecoder || !EncodedAudioChunk) return false
    try {
      return (await AudioDecoder.isConfigSupported({ codec: 'opus', sampleRate: 48000, numberOfChannels: 2 })).supported
    } catch { return false }
  }

  private decoder: Decoder | null = null
  private channels = 0
  private pendingReset = false

  constructor(private readonly output: (planes: Float32Array[], sampleRate: number, reset: boolean) => void, private readonly error: (error: Error) => void) {}

  decode(buffer: ArrayBuffer, frame: OpusAudioFrame, reset: boolean) {
    try { this.decodeFrame(buffer, frame, reset) } catch (error) {
      failed = true
      this.destroy()
      this.error(error instanceof Error ? error : new Error(String(error)))
    }
  }

  private decodeFrame(buffer: ArrayBuffer, frame: OpusAudioFrame, reset: boolean) {
    const { AudioDecoder, EncodedAudioChunk } = codecs()
    if (!AudioDecoder || !EncodedAudioChunk) throw new Error('Opus decoding is unavailable')
    if (!this.decoder || frame.channels !== this.channels || reset || this.decoder.decodeQueueSize >= 4) {
      this.destroy()
      this.channels = frame.channels
      this.pendingReset = true
      const decoder = new AudioDecoder({
        output: (audio) => {
          try {
            if (this.decoder !== decoder) return
            const planes = Array.from({ length: audio.numberOfChannels }, (_, planeIndex) => {
              const plane = new Float32Array(audio.numberOfFrames)
              audio.copyTo(plane, { planeIndex, format: 'f32-planar' })
              return plane
            })
            const reset = this.pendingReset
            this.pendingReset = false
            this.output(planes, audio.sampleRate, reset)
          } finally { audio.close() }
        },
        error: (error) => {
          if (this.decoder !== decoder) return
          failed = true
          this.destroy()
          this.error(error)
        },
      })
      this.decoder = decoder
      decoder.configure({ codec: 'opus', sampleRate: 48000, numberOfChannels: frame.channels })
    }
    this.decoder.decode(new EncodedAudioChunk({ type: 'key', timestamp: frame.ptsUs, data: new Uint8Array(buffer, AUDIO_HEADER_SIZE) }))
  }

  destroy() {
    const decoder = this.decoder
    this.decoder = null
    try { decoder?.close() } catch { /* Decoder errors can already close it. */ }
  }
}
