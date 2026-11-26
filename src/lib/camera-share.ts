// Browser camera, screen or video file → USB camera (UVC) on the controlled
// device; see onekvm-core docs/websocket-camera-v1.md. The controlled device
// chooses the size and frame rate; this browser encodes H.264 to match and
// the device passes each access unit on unchanged.
import { api } from '@/api/client'
import {
  annexBUnits,
  avcToAnnexB,
  CAMERA_SUBPROTOCOL,
  cameraBitrate,
  cameraCodecs,
  containRect,
  coverCrop,
  encodeCameraFrame,
  joinAnnexB,
  parameterSetsOf,
  parseAvcC,
  withParameterSets,
} from './camera-frame.ts'
import { microphoneAccessErrorKind } from './microphone-access.ts'

export interface CameraHostState {
  attached: boolean
  streaming: boolean
  width: number
  height: number
  fps: number
  max_bytes: number
  /** Highest bitrate the USB link carries, in bit/s. */
  max_bitrate?: number
  active: boolean
  busy: boolean
}

export type CameraSource = 'camera' | 'screen' | 'file'

export type CameraShareError =
  '' | 'permission' | 'unavailable' | 'busy' | 'disabled' | 'connection' | 'codec' | 'file' | 'other'

export interface CameraShareState {
  sharing: boolean
  starting: boolean
  source: CameraSource
  deviceId: string
  fileName: string
  /** Preview of the shared picture; null when the browser cannot provide one. */
  stream: MediaStream | null
  host: CameraHostState | null
  error: CameraShareError
  errorMessage: string
}

type Listener = (state: CameraShareState) => void
type Canvas = OffscreenCanvas | HTMLCanvasElement
type CapturableVideo = HTMLVideoElement & { captureStream?(): MediaStream; mozCaptureStream?(): MediaStream }

interface Capture {
  source: CameraSource
  video: HTMLVideoElement
  /** Tracks whose end stops sharing. */
  tracks: MediaStreamTrack[]
  preview: MediaStream | null
  stop(): void
}

interface Encoder {
  encoder: VideoEncoder
  width: number
  height: number
  fps: number
  bitrate: number
  annexB: boolean
}

const RECONNECT_MS = 2000
/** Periodic IDR pictures let the controlled device recover from a lost picture. */
const KEYFRAME_SECONDS = 2
const ENCODER_RETRIES = 3
/**
 * Frames sent but not yet acknowledged by the device. Beyond this the
 * browser skips captures: a backlog in TCP buffers would arrive late and in
 * a burst after any stall.
 */
const MAX_IN_FLIGHT = 3n

class CameraShare {
  private current: CameraShareState = {
    sharing: false, starting: false, source: 'camera', deviceId: '', fileName: '',
    stream: null, host: null, error: '', errorMessage: '',
  }
  private listeners = new Set<Listener>()
  private socket: WebSocket | null = null
  private capture: Capture | null = null
  private file: File | null = null
  private canvas: Canvas | null = null
  private timer = 0
  private reconnectTimer = 0
  private sequence = 0n
  private acknowledged = 0n
  private requestId = 0
  private pending = new Map<number, (granted: boolean, error: string) => void>()
  private encoder: Encoder | null = null
  private configuring = false
  private encoderFailures = 0
  /** Lowered after a picture larger than the controlled device accepts. */
  private bitrateScale = 1
  private keyframeDue = true
  /** After a dropped picture, later ones refer to it until the next IDR. */
  private awaitingKeyframe = false
  private lastKeyframe = 0
  /** Bumped when the capture loop stops, so a running tick does not re-arm. */
  private loopId = 0
  /** The latest source switch; an older one finishing later is discarded. */
  private sourceRequest = 0
  private parameterSets: Uint8Array[] = []
  private avcLengthSize = 4

  state() {
    return this.current
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener)
    listener(this.current)
    return () => { this.listeners.delete(listener) }
  }

  private update(patch: Partial<CameraShareState>) {
    this.current = { ...this.current, ...patch }
    for (const listener of this.listeners) listener(this.current)
  }

  async devices(): Promise<MediaDeviceInfo[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return []
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices.filter(device => device.kind === 'videoinput')
  }

  screenSupported() {
    return typeof navigator.mediaDevices?.getDisplayMedia === 'function'
  }

  /** Returns false when another session already shares its camera. */
  async start(): Promise<boolean> {
    if (this.current.starting) return false
    this.encoderFailures = 0
    this.update({ starting: true, error: '', errorMessage: '' })
    const source = this.current.source
    let capture: Capture | null = null
    try {
      if (!await chooseEncoderConfig(1280, 720, 30, 2_000_000)) throw named('CodecUnsupported')
      capture = await this.open(source, this.current.deviceId)
      const granted = await this.connect()
      if (!granted) {
        capture.stop()
        this.closeSocket()
        this.update({ starting: false, error: 'busy' })
        return false
      }
      this.update({ starting: false, sharing: true })
      this.attach(capture)
      return true
    } catch (error) {
      capture?.stop()
      this.closeSocket()
      this.update({ starting: false, ...errorState(error, source) })
      throw error
    }
  }

  /** Choose what to share; while sharing, the picture switches at once. */
  async selectSource(source: CameraSource, options: { deviceId?: string; file?: File } = {}) {
    if (source === 'file' && !options.file && !this.file) return
    const deviceId = source === 'camera' ? options.deviceId ?? this.current.deviceId : this.current.deviceId
    if (!this.current.sharing) {
      if (options.file) this.file = options.file
      this.update({ source, deviceId, fileName: this.file?.name ?? '' })
      return
    }
    const previousFile = this.file
    if (options.file) this.file = options.file
    const request = ++this.sourceRequest
    try {
      const capture = await this.open(source, deviceId)
      if (request !== this.sourceRequest || !this.current.sharing) {
        capture.stop()
        return
      }
      this.update({ source, fileName: this.file?.name ?? '' })
      this.attach(capture)
    } catch (error) {
      if (request !== this.sourceRequest || !this.current.sharing) return
      this.file = previousFile
      this.update(errorState(error, source))
      throw error
    }
  }

  stop() {
    window.clearTimeout(this.reconnectTimer)
    this.reconnectTimer = 0
    this.stopLoop()
    this.closeSocket()
    this.closeEncoder()
    this.capture?.stop()
    this.capture = null
    this.update({ sharing: false, starting: false, stream: null, host: null, error: '', errorMessage: '' })
  }

  private async open(source: CameraSource, deviceId: string): Promise<Capture> {
    if (source === 'file') {
      if (!this.file) throw named('FileUnplayable')
      return openFile(this.file)
    }
    const media = navigator.mediaDevices
    let stream: MediaStream
    if (source === 'screen') {
      if (!media?.getDisplayMedia) throw named('NotFoundError')
      stream = await media.getDisplayMedia({ audio: false, video: { frameRate: { ideal: 60 } } })
    } else {
      if (!media?.getUserMedia) throw named('NotFoundError')
      const video: MediaTrackConstraints = { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } }
      if (deviceId) video.deviceId = { exact: deviceId }
      stream = await media.getUserMedia({ audio: false, video })
      this.update({ deviceId: stream.getVideoTracks()[0]?.getSettings().deviceId || deviceId })
    }
    const video = mediaElement()
    video.srcObject = stream
    void video.play().catch(() => undefined)
    return {
      source,
      video,
      tracks: stream.getVideoTracks(),
      preview: stream,
      stop: () => {
        stream.getTracks().forEach(track => track.stop())
        video.srcObject = null
      },
    }
  }

  private attach(capture: Capture) {
    const previous = this.capture
    this.capture = capture
    for (const track of capture.tracks) {
      track.addEventListener('ended', () => {
        if (this.capture !== capture) return
        this.stop()
        // Ending a screen share from the browser is a normal way to stop.
        if (capture.source === 'camera') this.update({ error: 'unavailable' })
      })
    }
    this.update({ stream: capture.preview })
    if (previous && previous !== capture) previous.stop()
    this.schedule()
  }

  private connect(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(api.getCameraWebSocketURL(), CAMERA_SUBPROTOCOL)
      socket.binaryType = 'arraybuffer'
      this.socket = socket
      this.acknowledged = this.sequence
      let settled = false
      const settle = (granted: boolean, error = '') => {
        if (settled) return
        settled = true
        if (error === 'disabled') reject(named('CameraDisabled'))
        else if (error) reject(new Error(error))
        else resolve(granted)
      }
      socket.onmessage = (event) => {
        if (typeof event.data !== 'string') return
        let message: Record<string, unknown>
        try { message = JSON.parse(event.data) } catch { return }
        if (message.type === 'ready') {
          this.setHost(message.camera as CameraHostState)
          const id = ++this.requestId
          this.pending.set(id, (granted, error) => settle(granted, error))
          socket.send(JSON.stringify({ type: 'camera', request_id: id, enabled: true }))
        } else if (message.type === 'camera') {
          this.setHost(message.state as CameraHostState)
          const callback = this.pending.get(message.request_id as number)
          this.pending.delete(message.request_id as number)
          callback?.(Boolean(message.camera), message.error ? 'disabled' : '')
        } else if (message.type === 'state') {
          this.setHost(message.camera as CameraHostState)
          this.schedule()
        } else if (message.type === 'ack') {
          if (this.socket === socket && typeof message.sequence === 'number') this.acknowledged = BigInt(message.sequence)
        } else if (message.type === 'keyframe') {
          this.keyframeDue = true
        } else if (message.type === 'frame' && message.error === 'too_large') {
          this.bitrateScale = Math.max(0.25, this.bitrateScale * 0.7)
          this.keyframeDue = true
          this.awaitingKeyframe = true
        }
      }
      socket.onerror = () => settle(false, 'Camera connection failed')
      socket.onclose = () => {
        if (this.socket !== socket) return
        this.socket = null
        settle(false, 'Camera connection failed')
        if (this.current.sharing) this.reconnect()
      }
    })
  }

  /** A host that (re)starts its stream decodes from the next IDR picture. */
  private setHost(host: CameraHostState) {
    const previous = this.current.host
    const same = previous?.streaming && previous.width === host.width && previous.height === host.height
      && previous.fps === host.fps
    if (host.streaming && !same) this.keyframeDue = true
    this.update({ host })
  }

  private reconnect() {
    this.stopLoop()
    this.update({ error: 'connection', host: null })
    window.clearTimeout(this.reconnectTimer)
    this.reconnectTimer = window.setTimeout(async () => {
      this.reconnectTimer = 0
      if (!this.current.sharing) return
      try {
        const granted = await this.connect()
        if (!this.current.sharing) return
        if (!granted) {
          this.stop()
          this.update({ error: 'busy' })
          return
        }
        this.update({ error: '' })
        this.schedule()
      } catch (error) {
        if (!this.current.sharing) return
        if ((error as Error).name === 'CameraDisabled') {
          this.stop()
          this.update(errorState(error, this.current.source))
        } else {
          this.reconnect()
        }
      }
    }, RECONNECT_MS)
  }

  private closeSocket() {
    const socket = this.socket
    this.socket = null
    this.pending.clear()
    if (socket && socket.readyState <= WebSocket.OPEN) socket.close()
  }

  private stopLoop() {
    window.clearTimeout(this.timer)
    this.timer = 0
    this.loopId += 1
  }

  private schedule() {
    this.stopLoop()
    const host = this.current.host
    if (!this.current.sharing && !this.current.starting) return
    if (!host?.streaming || !host.active || host.fps <= 0) return
    const interval = 1000 / host.fps
    const loop = this.loopId
    const tick = () => {
      const started = performance.now()
      try {
        this.captureFrame()
      } catch {
        // The next tick retries with the latest picture.
      }
      // Capturing can stop sharing, e.g. when the encoder fails.
      if (this.loopId !== loop) return
      this.timer = window.setTimeout(tick, Math.max(0, interval - (performance.now() - started)))
    }
    this.timer = window.setTimeout(tick, 0)
  }

  private captureFrame() {
    const host = this.current.host
    const socket = this.socket
    const capture = this.capture
    if (!host?.streaming || !host.active || !socket || socket.readyState !== WebSocket.OPEN || !capture) return
    const video = capture.video
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth === 0) return
    const encoder = this.encoderFor(host)
    if (!encoder) return
    // Skip a capture instead of dropping encoded pictures: later pictures
    // refer to earlier ones.
    if (this.sequence - this.acknowledged >= MAX_IN_FLIGHT || socket.bufferedAmount > host.max_bytes
      || encoder.encoder.encodeQueueSize > 1) return
    const { width, height } = encoder
    const canvas = this.canvasFor(width, height)
    // Each branch narrows the canvas union so its getContext overload applies.
    const context = 'convertToBlob' in canvas ? canvas.getContext('2d') : canvas.getContext('2d')
    if (!context) return
    if (capture.source === 'camera') {
      const crop = coverCrop(video.videoWidth, video.videoHeight, width, height)
      context.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height)
    } else {
      context.fillStyle = '#000'
      context.fillRect(0, 0, width, height)
      const rect = containRect(video.videoWidth, video.videoHeight, width, height)
      context.drawImage(video, rect.x, rect.y, rect.width, rect.height)
    }
    const now = performance.now()
    const keyFrame = this.keyframeDue || now - this.lastKeyframe >= KEYFRAME_SECONDS * 1000
    const frame = new VideoFrame(canvas, { timestamp: Math.round(now * 1000) })
    try {
      encoder.encoder.encode(frame, { keyFrame })
    } finally {
      frame.close()
    }
    if (keyFrame) {
      this.keyframeDue = false
      this.lastKeyframe = now
    }
  }

  /** The encoder for the host's format, or null while one is being set up. */
  private encoderFor(host: CameraHostState): Encoder | null {
    const bitrate = cameraBitrate(host.width, host.height, host.fps, host.max_bitrate ?? 0, this.bitrateScale)
    const current = this.encoder
    if (current && current.encoder.state === 'configured' && current.width === host.width
      && current.height === host.height && current.fps === host.fps && current.bitrate === bitrate) return current
    if (!this.configuring) void this.configure(host.width, host.height, host.fps, bitrate)
    return null
  }

  private async configure(width: number, height: number, fps: number, bitrate: number) {
    this.configuring = true
    try {
      if (this.encoderFailures >= ENCODER_RETRIES) throw named('CodecUnsupported')
      const chosen = await chooseEncoderConfig(width, height, fps, bitrate)
      if (!chosen) throw named('CodecUnsupported')
      this.closeEncoder()
      if (!this.current.sharing) return
      const encoder: Encoder = {
        encoder: new VideoEncoder({
          output: (chunk, metadata) => this.send(encoder, chunk, metadata),
          error: () => {
            if (this.encoder !== encoder) return
            this.encoder = null
            this.encoderFailures += 1
          },
        }),
        width, height, fps, bitrate, annexB: chosen.annexB,
      }
      encoder.encoder.configure(chosen.config)
      this.encoder = encoder
      this.keyframeDue = true
      this.parameterSets = []
    } catch (error) {
      if (!this.current.sharing) return
      const source = this.current.source
      this.stop()
      this.update(errorState(error, source))
    } finally {
      this.configuring = false
    }
  }

  private closeEncoder() {
    const current = this.encoder
    this.encoder = null
    if (current && current.encoder.state !== 'closed') current.encoder.close()
  }

  private send(encoder: Encoder, chunk: EncodedVideoChunk, metadata?: EncodedVideoChunkMetadata) {
    if (this.encoder !== encoder) return
    this.encoderFailures = 0
    const socket = this.socket
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    const raw = new Uint8Array(chunk.byteLength)
    chunk.copyTo(raw)
    let data: Uint8Array = raw
    if (!encoder.annexB) {
      const description = metadata?.decoderConfig?.description
      const config = description ? parseAvcC(bytesOf(description)) : null
      if (config) {
        this.avcLengthSize = config.lengthSize
        this.parameterSets = config.parameterSets.map(unit => unit.slice())
      }
      data = avcToAnnexB(data, this.avcLengthSize)
    }
    const maxBytes = this.current.host?.max_bytes ?? 0
    if (maxBytes > 0 && data.length > maxBytes) {
      // The device would refuse it; encode smaller from the next IDR on.
      this.bitrateScale = Math.max(0.25, this.bitrateScale * 0.7)
      this.keyframeDue = true
      this.awaitingKeyframe = true
      return
    }
    if (chunk.type !== 'key' && this.awaitingKeyframe) return
    if (chunk.type === 'key') {
      this.awaitingKeyframe = false
      // The controlled device may start decoding at any IDR picture.
      const units = annexBUnits(data)
      const sets = parameterSetsOf(units)
      if (sets.length) this.parameterSets = sets.map(unit => unit.slice())
      else data = joinAnnexB(withParameterSets(units, this.parameterSets))
    }
    this.sequence += 1n
    socket.send(encodeCameraFrame(this.sequence, encoder.width, encoder.height, data))
  }

  private canvasFor(width: number, height: number): Canvas {
    if (!this.canvas) {
      this.canvas = typeof OffscreenCanvas === 'function'
        ? new OffscreenCanvas(width, height)
        : document.createElement('canvas')
    }
    if (this.canvas.width !== width) this.canvas.width = width
    if (this.canvas.height !== height) this.canvas.height = height
    return this.canvas
  }
}

function mediaElement() {
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  return video
}

async function openFile(file: File): Promise<Capture> {
  const url = URL.createObjectURL(file)
  const video = mediaElement() as CapturableVideo
  video.loop = true
  video.src = url
  const release = () => {
    video.pause()
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(url)
  }
  try {
    await video.play()
  } catch {
    release()
    throw named('FileUnplayable')
  }
  let preview: MediaStream | null = null
  try {
    preview = video.captureStream?.() ?? video.mozCaptureStream?.() ?? null
  } catch {
    preview = null
  }
  return {
    source: 'file',
    video,
    tracks: [],
    preview,
    stop: () => {
      preview?.getTracks().forEach(track => track.stop())
      release()
    },
  }
}

async function chooseEncoderConfig(width: number, height: number, fps: number, bitrate: number) {
  if (typeof VideoEncoder === 'undefined') return null
  for (const annexB of [true, false]) {
    for (const codec of cameraCodecs(width, height, fps)) {
      const config: VideoEncoderConfig = {
        codec, width, height, bitrate, framerate: fps, latencyMode: 'realtime',
        avc: { format: annexB ? 'annexb' : 'avc' },
      }
      try {
        if ((await VideoEncoder.isConfigSupported(config)).supported) return { config, annexB }
      } catch {
        // Try the next configuration.
      }
    }
  }
  return null
}

function bytesOf(source: AllowSharedBufferSource): Uint8Array {
  if (ArrayBuffer.isView(source)) return new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
  return new Uint8Array(source)
}

function named(name: string) {
  return Object.assign(new Error(name), { name })
}

function errorState(error: unknown, source: CameraSource): Pick<CameraShareState, 'error' | 'errorMessage'> {
  const name = (error as Error | undefined)?.name
  if (name === 'CameraDisabled') return { error: 'disabled', errorMessage: '' }
  if (name === 'CodecUnsupported') return { error: 'codec', errorMessage: '' }
  if (name === 'FileUnplayable') return { error: 'file', errorMessage: '' }
  // Closing the screen picker is a cancel, not a failure.
  if (source === 'screen' && name === 'NotAllowedError') return { error: '', errorMessage: '' }
  const kind = microphoneAccessErrorKind(error)
  if (kind !== 'other') return { error: kind, errorMessage: '' }
  return { error: 'other', errorMessage: error instanceof Error ? error.message : String(error) }
}

export const cameraShare = new CameraShare()
