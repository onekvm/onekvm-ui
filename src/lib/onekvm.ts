import { isCloudHosted } from '@/api/service-url'
import { api, isUnauthorizedError } from '@/api/client'
import {
  preferredWebRTCCodecs,
  selectEncodedVideoTransport,
  supportsWebRTCClient,
  detectH265WebRTCVideoSupport,
  VideoCodecUnsupportedError,
  connectionVideoCodec,
  parseVideoTransport,
  VIDEO_TRANSPORT_KEY,
  type EncodedVideoTransport,
  type VideoFallbackPrompt,
} from '@/lib/video-transport'
import type { WebSocketVideo } from '@/lib/websocket-video'
import { detectH265WebSocketVideoSupport, supportsWebSocketVideo } from '@/lib/websocket-video-support'
import {
  emptyBrowserAudioStats,
  emptyBrowserVideoLatency,
  PlaybackStatsSampler,
  type BrowserAudioStats,
  type BrowserVideoLatencyUs,
} from '@/lib/webrtc-playback-stats'
import { applyOpusStereoPreference, preferLowDelayOpus } from '@/lib/webrtc-opus-sdp'
import { AdaptiveJitterBuffer, applyJitterBufferTargets, audioCatchUpRate } from '@/lib/adaptive-jitter-buffer'
import { activateBrowserMicrophone } from '@/lib/microphone-access'

export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed'

export interface TransportState {
  connection: ConnectionState
  controlReady: boolean
  videoMode: 'webrtc' | 'websocket' | 'mjpeg'
  webRTCSessionId: string
  videoPrimary: boolean
  websocketFallbackAvailable: boolean
  fallbackPrompt: VideoFallbackPrompt
  error: string
}

type StateListener = (state: TransportState) => void
export type InputActivity = 'mouse' | 'keyboard' | 'gamepad'

export interface GamepadReport {
  buttons: number
  hat: number
  lx: number
  ly: number
  rx: number
  ry: number
  lt: number
  rt: number
}
type ActivityListener = (activity: InputActivity) => void
export type HIDReportListener = (report: Uint8Array, timestamp: number) => void
type BitrateListener = (kbps: number) => void
type BrowserLatencyListener = (latency: BrowserVideoLatencyUs) => void
type AudioStatsListener = (stats: BrowserAudioStats) => void
export type { BrowserAudioStats, BrowserVideoLatencyUs }
export interface KeyboardLEDState {
  known: boolean
  numLock: boolean
  capsLock: boolean
  scrollLock: boolean
}
type KeyboardLEDListener = (state: KeyboardLEDState) => void

const clampInt8 = (value: number) => Math.max(-127, Math.min(127, Math.round(value)))
const clampAbsolute = (value: number) => Math.max(0, Math.min(0x7fff, Math.round(value)))
const SPEAKER_VOLUME_KEY = 'onekvm-speaker-volume'
const SPEAKER_ENABLED_KEY = 'onekvm-speaker-enabled'
const MICROPHONE_VOLUME_KEY = 'onekvm-microphone-volume'

function clampVolume(value: number) {
  if (!Number.isFinite(value)) return 1
  return Math.min(1, Math.max(0, value))
}

function readStoredVolume(key: string) {
  const stored = localStorage.getItem(key)
  if (stored == null || stored === '') return 1
  return clampVolume(Number(stored))
}

function readStoredBoolean(key: string, fallback: boolean) {
  const stored = localStorage.getItem(key)
  if (stored == null) return fallback
  return stored === 'true'
}

class OneKVMTransport {
  private peer: RTCPeerConnection | null = null
  private control: RTCDataChannel | null = null
  private stream: MediaStream | null = null
  private localAudio: MediaStream | null = null
  private audioSender: RTCRtpSender | null = null
  private micContext: AudioContext | null = null
  private micGain: GainNode | null = null
  private micAnalyser: AnalyserNode | null = null
  private micDestination: MediaStreamAudioDestinationNode | null = null
  private speakerVolume = readStoredVolume(SPEAKER_VOLUME_KEY)
  private speakerPlaybackEnabled = readStoredBoolean(SPEAKER_ENABLED_KEY, true)
  private microphoneVolume = readStoredVolume(MICROPHONE_VOLUME_KEY)
  private wantMicrophone = false
  private heldMicrophone = false
  private video: HTMLVideoElement | null = null
  private audio: HTMLAudioElement | null = null
  private hidSocket: WebSocket | null = null
  private websocketVideo: WebSocketVideo | null = null
  private sessionId = ''
  private preferredVideoTransport = parseVideoTransport(localStorage.getItem(VIDEO_TRANSPORT_KEY))
  private connecting: Promise<void> | null = null
  private reconnecting: Promise<void> | null = null
  private connectionGeneration = 0
  private listeners = new Set<StateListener>()
  private activityListeners = new Set<ActivityListener>()
  private hidReportListeners = new Set<HIDReportListener>()
  private bitrateListeners = new Set<BitrateListener>()
  private browserLatencyListeners = new Set<BrowserLatencyListener>()
  private audioStatsListeners = new Set<AudioStatsListener>()
  private keyboardLEDListeners = new Set<KeyboardLEDListener>()
  private playbackStats = new PlaybackStatsSampler()
  private adaptiveJitterBuffer = new AdaptiveJitterBuffer()
  private state: TransportState = {
    connection: 'idle',
    controlReady: false,
    videoMode: 'webrtc',
    webRTCSessionId: '',
    videoPrimary: false,
    websocketFallbackAvailable: false,
    fallbackPrompt: '',
    error: '',
  }
  private statsTimer = 0
  private peerConnectTimer = 0
  private peerDisconnectTimer = 0
  private unlockAudioListener: (() => void) | null = null

  subscribe(listener: StateListener) {
    this.listeners.add(listener)
    listener(this.state)
    return () => this.listeners.delete(listener)
  }

  subscribeActivity(listener: ActivityListener) {
    this.activityListeners.add(listener)
    return () => this.activityListeners.delete(listener)
  }

  subscribeHIDReports(listener: HIDReportListener) {
    this.hidReportListeners.add(listener)
    return () => this.hidReportListeners.delete(listener)
  }

  subscribeVideoBitrate(listener: BitrateListener) {
    this.bitrateListeners.add(listener)
    listener(0)
    return () => this.bitrateListeners.delete(listener)
  }

  subscribeBrowserLatency(listener: BrowserLatencyListener) {
    this.browserLatencyListeners.add(listener)
    listener(emptyBrowserVideoLatency())
    return () => this.browserLatencyListeners.delete(listener)
  }

  subscribeAudioStats(listener: AudioStatsListener) {
    this.audioStatsListeners.add(listener)
    listener(emptyBrowserAudioStats())
    return () => this.audioStatsListeners.delete(listener)
  }

  subscribeKeyboardLED(listener: KeyboardLEDListener) {
    this.keyboardLEDListeners.add(listener)
    return () => this.keyboardLEDListeners.delete(listener)
  }

  attachVideo(video: HTMLVideoElement) {
    this.video = video
    video.muted = true
    if (this.stream) this.play(this.stream)
    return () => {
      if (this.video === video) this.video = null
    }
  }

  attachAudio(audio: HTMLAudioElement) {
    this.audio = audio
    audio.autoplay = true
    audio.muted = !this.speakerPlaybackEnabled
    audio.volume = this.speakerVolume
    if ('preservesPitch' in audio) audio.preservesPitch = true
    this.ensureUnlockAudioListener()
    if (this.stream) this.play(this.stream)
    return () => {
      if (this.audio === audio) this.audio = null
    }
  }

  speakerGain() {
    return this.speakerVolume
  }

  speakerEnabled() {
    return this.speakerPlaybackEnabled
  }

  setSpeakerEnabled(enabled: boolean) {
    this.speakerPlaybackEnabled = enabled
    localStorage.setItem(SPEAKER_ENABLED_KEY, String(enabled))
    if (this.audio) this.audio.muted = !enabled
    if (enabled) this.unlockAudio()
  }

  setSpeakerGain(value: number) {
    this.speakerVolume = clampVolume(value)
    localStorage.setItem(SPEAKER_VOLUME_KEY, String(this.speakerVolume))
    if (this.audio) this.audio.volume = this.speakerVolume
  }

  microphoneGain() {
    return this.microphoneVolume
  }

  setMicrophoneGain(value: number) {
    this.microphoneVolume = clampVolume(value)
    localStorage.setItem(MICROPHONE_VOLUME_KEY, String(this.microphoneVolume))
    if (this.micGain) this.micGain.gain.value = this.microphoneVolume
  }

  microphoneAnalyser() {
    return this.micAnalyser
  }

  playMicrophoneTestTone() {
    const context = this.micContext
    const output = this.micGain ?? this.micDestination
    if (!context || !output) return false
    const oscillator = context.createOscillator()
    const tone = context.createGain()
    oscillator.frequency.value = 880
    tone.gain.value = 0.22
    oscillator.connect(tone)
    tone.connect(output)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.55)
    oscillator.onended = () => {
      oscillator.disconnect()
      tone.disconnect()
    }
    return true
  }

  unlockAudio() {
    if (!this.audio) return
    this.audio.muted = !this.speakerPlaybackEnabled
    this.audio.volume = this.speakerVolume
    if (!this.audio.srcObject && !this.audio.getAttribute('src')) {
      // 1-sample silent WAV so the click gesture actually starts playback
      // before WebRTC attaches a live track after reconnect().
      this.audio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA'
    }
    void this.audio.play().catch(() => undefined)
  }

  private ensureUnlockAudioListener() {
    if (this.unlockAudioListener) return
    this.unlockAudioListener = () => this.unlockAudio()
    window.addEventListener('pointerdown', this.unlockAudioListener, true)
  }

  connect() {
    if (this.connecting) return this.connecting
    if (['mjpeg', 'websocket'].includes(this.state.videoMode) && this.state.connection === 'connected') {
      return Promise.resolve()
    }
    if (this.peer && ['connecting', 'connected'].includes(this.peer.connectionState)) {
      return Promise.resolve()
    }

    const generation = this.connectionGeneration
    const connecting = this.start(generation)
      .catch((error: unknown) => {
        if (generation !== this.connectionGeneration) return
        this.disposeHIDSocket()
        this.disposeWebSocketVideo()
        this.disposePeer()
        const unauthorized = isUnauthorizedError(error)
        this.setState({
          connection: 'failed',
          error: this.errorMessage(error),
          controlReady: false,
          videoPrimary: false,
          fallbackPrompt:
            !unauthorized && this.state.fallbackPrompt === 'h265-unsupported'
              ? 'h265-unsupported'
              : !unauthorized &&
            this.state.videoMode === 'webrtc' &&
            this.state.websocketFallbackAvailable
              ? 'webrtc-failed'
              : '',
        })
        throw error
      })
      .finally(() => {
        if (this.connecting === connecting) this.connecting = null
      })
    this.connecting = connecting
    return connecting
  }

  reconnect() {
    if (this.reconnecting) return this.reconnecting
    const generation = this.connectionGeneration
    const reconnecting = (async () => {
      // Do not reuse an offer that was started for the previous codec.
      await this.connecting?.catch(() => undefined)
      if (generation !== this.connectionGeneration) return
      await this.close()
      if (this.connectionGeneration !== generation + 1) return
      await this.connect()
    })().finally(() => {
      if (this.reconnecting === reconnecting) this.reconnecting = null
    })
    this.reconnecting = reconnecting
    return reconnecting
  }

  async connectWebSocketFallback() {
    return this.setVideoTransport('websocket')
  }

  async setVideoTransport(transport: EncodedVideoTransport) {
    this.preferredVideoTransport = transport
    localStorage.setItem(VIDEO_TRANSPORT_KEY, transport)
    return this.reconnect()
  }

  async retryWebRTC() {
    return this.setVideoTransport('webrtc')
  }

  async switchToH264Fallback() {
    await api.patchConfig('video.codec', 'h264', this.sessionId)
    this.preferredVideoTransport = 'webrtc'
    localStorage.setItem(VIDEO_TRANSPORT_KEY, 'webrtc')
    return this.reconnect()
  }

  async close() {
    this.connectionGeneration += 1
    this.connecting = null
    const sessionId = this.sessionId
    this.sessionId = ''
    this.disposeHIDSocket()
    this.disposeWebSocketVideo()
    this.disposePeer()
    this.setState({
      connection: 'closed',
      controlReady: false,
      webRTCSessionId: '',
      videoPrimary: false,
      fallbackPrompt: '',
      error: '',
    })
    if (sessionId) await api.closeWebRTCSession(sessionId, true).catch(() => undefined)
  }

  sendKeyboard(keys: number[], modifiers = 0) {
    const report = new Uint8Array(8)
    report[0] = 1
    report[1] = modifiers & 0xff
    keys.slice(0, 6).forEach((key, index) => {
      report[index + 2] = key & 0xff
    })
    if (this.send(report)) this.emitActivity('keyboard')
  }

  sendRelativeMouse(buttons: number, x = 0, y = 0, wheel = 0) {
    const sent = this.send(
      Uint8Array.of(
        2,
        buttons & 0x1f,
        clampInt8(x) & 0xff,
        clampInt8(y) & 0xff,
        clampInt8(wheel) & 0xff,
      ),
    )
    if (sent) this.emitActivity('mouse')
  }

  sendAbsoluteMouse(buttons: number, x: number, y: number) {
    const report = new Uint8Array(6)
    report[0] = 3
    report[1] = buttons & 0x1f
    const view = new DataView(report.buffer)
    view.setUint16(2, clampAbsolute(x), true)
    view.setUint16(4, clampAbsolute(y), true)
    if (this.send(report)) this.emitActivity('mouse')
  }

  sendGamepad(report: GamepadReport) {
    const payload = new Uint8Array(10)
    payload[0] = 4
    const view = new DataView(payload.buffer)
    view.setUint16(1, report.buttons & 0xffff, true)
    payload[3] = Math.min(8, Math.max(0, report.hat | 0))
    payload[4] = report.lx & 0xff
    payload[5] = report.ly & 0xff
    payload[6] = report.rx & 0xff
    payload[7] = report.ry & 0xff
    payload[8] = report.lt & 0xff
    payload[9] = report.rt & 0xff
    if (this.send(payload)) this.emitActivity('gamepad')
  }

  sendIdleGamepad() {
    this.sendGamepad({
      buttons: 0,
      hat: 8,
      lx: 128,
      ly: 128,
      rx: 128,
      ry: 128,
      lt: 0,
      rt: 0,
    })
  }

  private async start(generation: number) {
    this.setState({
      connection: 'connecting',
      controlReady: false,
      fallbackPrompt: '',
      error: '',
    })

    // SSE is for display updates. Its cached snapshot may predate a codec
    // PATCH, so every new session must read the current pipeline directly.
    const status = await api.getStatus()
    if (generation !== this.connectionGeneration) return
    const codec = connectionVideoCodec(status.video)

    if (codec === 'mjpeg') {
      this.setState({
        videoMode: 'mjpeg',
        websocketFallbackAvailable: false,
      })
      await this.openHIDWebSocket()
      if (generation !== this.connectionGeneration) return
      this.emitVideoBitrate(0)
      this.emitBrowserLatency(emptyBrowserVideoLatency())
      this.setState({ connection: 'connected', controlReady: true })
      return
    }

    const websocketFallbackAvailable = codec === 'h265'
      ? await detectH265WebSocketVideoSupport()
      : supportsWebSocketVideo(codec)
    const webrtcSupported = supportsWebRTCClient()
    const transport = selectEncodedVideoTransport({
      codec,
      preferred: this.preferredVideoTransport,
      webrtcSupported,
      webrtcCodecSupported: codec !== 'h265' || await detectH265WebRTCVideoSupport(),
      websocketSupported: websocketFallbackAvailable,
    })
    if (generation !== this.connectionGeneration) return
    if (transport.kind === 'fallback') {
      this.setState({
        connection: 'failed',
        controlReady: false,
        videoMode: this.preferredVideoTransport,
        websocketFallbackAvailable,
        fallbackPrompt: transport.prompt,
        error: '',
      })
      return
    }
    if (transport.kind === 'unsupported') {
      throw new VideoCodecUnsupportedError(codec)
    }
    if (transport.transport === 'websocket') {
      this.setState({ videoMode: 'websocket', websocketFallbackAvailable })
      await this.startWebSocket(codec, generation)
      return
    }

    this.setState({ videoMode: 'webrtc', websocketFallbackAvailable })
    await this.startWebRTC(
      generation,
      codec,
      Boolean(status.audio.enabled),
      this.wantMicrophone,
      status.audio.channels === 'stereo',
    )
  }

  sessionID() {
    return this.sessionId
  }

  microphoneGranted() {
    return this.heldMicrophone
  }

  async setMicrophone(enabled: boolean, options: { enableUSB?: boolean } = {}) {
    this.wantMicrophone = enabled
    if (!enabled) {
      this.heldMicrophone = false
      await this.audioSender?.replaceTrack(null).catch(() => undefined)
      this.disposeLocalAudio()
      if (this.sessionId) await api.setWebRTCMicrophone(this.sessionId, false).catch(() => undefined)
      return true
    }
    if (this.state.connection !== 'connected' && this.state.connection !== 'connecting') {
      this.wantMicrophone = false
      throw new Error('Microphone requires an active WebRTC session')
    }
    if (!this.sessionId || !this.audioSender) {
      this.wantMicrophone = false
      throw new Error('Microphone requires an active WebRTC session')
    }

    const sessionId = this.sessionId
    const sender = this.audioSender
    try {
      const stream = await activateBrowserMicrophone({
        requestPermission: async () => {
          if (!navigator.mediaDevices?.getUserMedia) {
            throw Object.assign(new Error('Microphone capture is unavailable'), { name: 'NotFoundError' })
          }
          return navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        },
        enableDevice: options.enableUSB
          ? async () => { await api.patchConfig('audio.microphone', 'true') }
          : undefined,
        claimSession: async () => {
          const result = await api.setWebRTCMicrophone(sessionId, true)
          return Boolean(result.microphone)
        },
        attach: async (captured) => {
          this.disposeLocalAudio()
          this.localAudio = captured
          const track = this.captureMicrophoneTrack(captured)
          if (!track) throw new Error('No microphone audio track available')
          await sender.replaceTrack(track)
        },
        releaseSession: async () => {
          await api.setWebRTCMicrophone(sessionId, false)
        },
        stop: (captured) => captured.getTracks().forEach((track) => track.stop()),
      })

      if (!stream) {
        this.wantMicrophone = false
        this.heldMicrophone = false
        return false
      }
      this.heldMicrophone = true
      return true
    } catch (error) {
      this.disposeLocalAudio()
      this.wantMicrophone = false
      this.heldMicrophone = false
      throw error
    }
  }

  private async startWebRTC(generation: number, codec: string, _speaker: boolean, microphone: boolean, stereo = false) {

    const iceServers = (await api.getWebRTCIce().catch(() => ({ ice_servers: [] }))).ice_servers || []
    if (generation !== this.connectionGeneration) return
    const peer = new RTCPeerConnection(iceServers.length ? { iceServers } : undefined)
    const stream = new MediaStream()
    this.peer = peer
    this.stream = stream

    peer.ontrack = (event) => {
      if (this.peer !== peer) return
      stream.addTrack(event.track)
      applyJitterBufferTargets(peer.getReceivers(), this.adaptiveJitterBuffer.targets())
      this.play(stream)
    }
    peer.onconnectionstatechange = () => {
      if (this.peer !== peer) return
      const connection = peer.connectionState as ConnectionState
      if (connection === 'connected') {
        window.clearTimeout(this.peerConnectTimer)
        window.clearTimeout(this.peerDisconnectTimer)
        this.setState({ connection, error: '', fallbackPrompt: '' })
        this.unlockAudio()
      } else if (connection === 'failed') {
        this.failWebRTC('WebRTC connection failed')
      } else if (connection === 'disconnected') {
        window.clearTimeout(this.peerDisconnectTimer)
        this.peerDisconnectTimer = window.setTimeout(() => {
          if (this.peer === peer && peer.connectionState === 'disconnected') {
            this.failWebRTC('WebRTC connection disconnected')
          }
        }, 2500)
      } else {
        this.setState({ connection })
      }
    }

    const control = peer.createDataChannel('control')
    this.control = control
    control.binaryType = 'arraybuffer'
    control.onopen = () => {
      if (this.control !== control) return
      this.setState({ controlReady: true })
    }
    control.onmessage = (event) => {
      if (this.control === control) this.handleControlMessage(event.data)
    }
    control.onclose = () => {
      if (this.control === control) this.setState({ controlReady: false })
    }

    const video = peer.addTransceiver('video', { direction: 'recvonly' })
    const preferred = preferredWebRTCCodecs(
      codec,
      globalThis.RTCRtpReceiver?.getCapabilities?.('video')?.codecs ?? [],
    )
    if (preferred && codec.toLowerCase() === 'h265') {
      try {
        video.setCodecPreferences(preferred)
      } catch {
        // Some Chromium builds expose HEVC in getCapabilities but reject it as
        // a send preference. The offer still includes whatever the browser
        // will actually negotiate.
      }
    }
    const audio = peer.addTransceiver('audio', { direction: 'sendrecv' })
    this.audioSender = audio.sender
    applyJitterBufferTargets(peer.getReceivers(), this.adaptiveJitterBuffer.reset())
    if (microphone) {
      try {
        this.disposeLocalAudio()
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        if (this.peer !== peer) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        this.localAudio = stream
        const track = this.captureMicrophoneTrack(stream)
        if (track) await audio.sender.replaceTrack(track)
      } catch {
        if (this.peer !== peer) return
        this.disposeLocalAudio()
      }
    }
    const offer = await peer.createOffer()
    if (this.peer !== peer) return
    if (offer.sdp) {
      let sdp = offer.sdp
      if (stereo) sdp = applyOpusStereoPreference(sdp, true)
      offer.sdp = preferLowDelayOpus(sdp)
    }
    await peer.setLocalDescription(offer)
    await this.waitForCandidates(peer)
    if (this.peer !== peer) return

    const answer = await api.createWebRTCSession(peer.localDescription?.sdp || '', microphone)
    if (this.peer !== peer) {
      await api.closeWebRTCSession(answer.session_id, true).catch(() => undefined)
      return
    }
    this.sessionId = answer.session_id
    if (isCloudHosted()) await this.openHIDWebSocket()
    if (this.peer !== peer) return
    this.setState({
      webRTCSessionId: answer.session_id,
      videoPrimary: answer.is_primary !== false,
    })
    this.heldMicrophone = Boolean(answer.microphone)
    if (microphone && !this.heldMicrophone) {
      this.wantMicrophone = false
      this.disposeLocalAudio()
    }
    await peer.setRemoteDescription({
      type: 'answer',
      sdp: preferLowDelayOpus(answer.sdp),
    })
    if (this.peer !== peer) return
    this.startVideoStats(peer)
    window.clearTimeout(this.peerConnectTimer)
    this.peerConnectTimer = window.setTimeout(() => {
      if (this.peer === peer && peer.connectionState !== 'connected') {
        this.failWebRTC('WebRTC connection timed out')
      }
    }, 10_000)
  }

  private async startWebSocket(codec: string, generation: number) {
    if (!this.video) throw new Error('Video element is not ready')
    const { WebSocketVideo } = await import('@/lib/websocket-video')
    if (generation !== this.connectionGeneration) return
    const player = new WebSocketVideo(
      this.video,
      api.getVideoWebSocketURL(),
      codec,
      {
        bitrate: (kbps) => {
          if (this.websocketVideo === player) this.emitVideoBitrate(kbps)
        },
        disconnected: (message, codecUnsupported) => {
          if (this.websocketVideo !== player) return
          this.disposeWebSocketVideo()
          this.disposeHIDSocket()
          this.setState({
            connection: 'failed',
            controlReady: false,
            fallbackPrompt: codec === 'h265' && codecUnsupported ? 'h265-unsupported' : '',
            error: message,
          })
        },
      },
    )
    this.websocketVideo = player
    this.emitBrowserLatency(emptyBrowserVideoLatency())
    await Promise.all([player.connect(), this.openHIDWebSocket()])
    if (this.websocketVideo !== player) return
    this.setState({ connection: 'connected', controlReady: true, error: '', fallbackPrompt: '' })
  }

  private play(stream: MediaStream) {
    if (this.video) {
      const videoTrack = stream.getVideoTracks()[0]
      const current = this.video.srcObject
      const currentTrack = current instanceof MediaStream ? current.getVideoTracks()[0] : undefined
      if (currentTrack !== videoTrack) {
        this.video.srcObject = videoTrack ? new MediaStream([videoTrack]) : null
      }
      this.video.muted = true
      void this.video.play().catch(() => undefined)
    }
    if (!this.audio) return
    const audioTrack = stream.getAudioTracks()[0]
    const current = this.audio.srcObject
    const currentTrack = current instanceof MediaStream ? current.getAudioTracks()[0] : undefined
    if (!audioTrack) {
      this.audio.srcObject = null
      return
    }
    if (currentTrack !== audioTrack) {
      this.audio.removeAttribute('src')
      this.audio.srcObject = new MediaStream([audioTrack])
    }
    this.unlockAudio()
  }

  private send(report: Uint8Array) {
    if (this.state.videoMode === 'mjpeg' || this.state.videoMode === 'websocket') {
	  if (this.hidSocket?.readyState !== WebSocket.OPEN) return false
	  try {
		this.hidSocket.send(report)
		this.emitHIDReport(report)
		return true
	  } catch {
		return false
	  }
	}
    if (this.control?.readyState !== 'open') return false
    this.control.send(report)
    this.emitHIDReport(report)
    return true
  }

  private emitHIDReport(report: Uint8Array) {
    if (report[0] !== 1 && report[0] !== 2 && report[0] !== 3) return
    if (report[0] === 3 && isCloudHosted() && this.hidSocket?.readyState === WebSocket.OPEN) {
      const view = new DataView(report.buffer, report.byteOffset, report.byteLength)
      this.hidSocket.send(JSON.stringify({type: 'cloud_position', x: view.getUint16(2, true), y: view.getUint16(4, true)}))
    }
    const timestamp = performance.now()
    this.hidReportListeners.forEach(listener => listener(new Uint8Array(report), timestamp))
  }

  private handleControlMessage(data: unknown) {
    const payload = data instanceof ArrayBuffer
      ? new Uint8Array(data)
      : ArrayBuffer.isView(data)
        ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
        : null
    if (!payload) return
    if (payload.length === 2 && payload[0] === 0x82) {
      this.setState({ videoPrimary: payload[1] === 1 })
      return
    }
    if (payload.length !== 3 || payload[0] !== 0x81) return
    const state: KeyboardLEDState = {
      known: payload[1] === 1,
      numLock: Boolean(payload[2] & (1 << 0)),
      capsLock: Boolean(payload[2] & (1 << 1)),
      scrollLock: Boolean(payload[2] & (1 << 2)),
    }
    this.keyboardLEDListeners.forEach((listener) => listener(state))
  }

  private openHIDWebSocket() {
	return new Promise<void>((resolve, reject) => {
	  const socket = new WebSocket(api.getHIDWebSocketURL(), 'onekvm.hid.v1')
	  socket.binaryType = 'arraybuffer'
	  this.hidSocket = socket
	  let opened = false
	  socket.onopen = () => {
		if (this.hidSocket !== socket) {
		  socket.close()
		  return
		}
		opened = true
		resolve()
	  }
	  socket.onmessage = (event) => {
		if (this.hidSocket === socket) this.handleControlMessage(event.data)
	  }
	  socket.onerror = () => {
		if (!opened) reject(new Error('HID WebSocket connection failed'))
	  }
	  socket.onclose = () => {
		const active = this.hidSocket === socket
		if (active) this.hidSocket = null
		if (!opened) {
		  reject(new Error('HID WebSocket connection closed'))
		} else if (active) {
		  this.setState({ connection: 'disconnected', controlReady: false, error: 'HID WebSocket connection closed' })
		}
	  }
	})
  }

  private disposeHIDSocket() {
	const socket = this.hidSocket
	this.hidSocket = null
	if (socket && socket.readyState < WebSocket.CLOSING) socket.close()
  }

  private disposeWebSocketVideo() {
    const player = this.websocketVideo
    this.websocketVideo = null
    player?.destroy()
  }

  private waitForCandidates(peer: RTCPeerConnection) {
    if (peer.iceGatheringState === 'complete') return Promise.resolve()
    return new Promise<void>((resolve) => {
      let timeout = 0
      const listener = () => {
        if (peer.iceGatheringState === 'complete') done()
      }
      const done = () => {
        window.clearTimeout(timeout)
        peer.removeEventListener('icegatheringstatechange', listener)
        resolve()
      }
      peer.addEventListener('icegatheringstatechange', listener)
      timeout = window.setTimeout(done, 3000)
    })
  }

  private captureMicrophoneTrack(stream: MediaStream) {
    const raw = stream.getAudioTracks()[0]
    if (!raw) return null
    const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextCtor) return raw
    const context = new AudioContextCtor()
    const source = context.createMediaStreamSource(stream)
    const gain = context.createGain()
    const analyser = context.createAnalyser()
    const destination = context.createMediaStreamDestination()
    gain.gain.value = this.microphoneVolume
    analyser.fftSize = 256
    source.connect(gain)
    gain.connect(analyser)
    gain.connect(destination)
    this.micContext = context
    this.micGain = gain
    this.micAnalyser = analyser
    this.micDestination = destination
    void context.resume().catch(() => undefined)
    return destination.stream.getAudioTracks()[0] ?? raw
  }

  private disposeLocalAudio() {
    this.localAudio?.getTracks().forEach((track) => track.stop())
    this.localAudio = null
    this.micDestination?.stream.getTracks().forEach((track) => track.stop())
    this.micGain?.disconnect()
    this.micAnalyser?.disconnect()
    this.micDestination?.disconnect()
    void this.micContext?.close().catch(() => undefined)
    this.micContext = null
    this.micGain = null
    this.micAnalyser = null
    this.micDestination = null
  }

  private disposePeer() {
    window.clearInterval(this.statsTimer)
    window.clearTimeout(this.peerConnectTimer)
    window.clearTimeout(this.peerDisconnectTimer)
    this.statsTimer = 0
    this.peerConnectTimer = 0
    this.peerDisconnectTimer = 0
    this.playbackStats.reset()
    this.adaptiveJitterBuffer.reset()
    this.emitVideoBitrate(0)
    this.emitBrowserLatency(emptyBrowserVideoLatency())
    this.emitAudioStats(emptyBrowserAudioStats())
    this.disposeLocalAudio()
    this.audioSender = null
    const control = this.control
    const peer = this.peer
    this.control = null
    this.peer = null
    control?.close()
    peer?.close()
    this.stream = null
    if (this.video) this.video.srcObject = null
    if (this.audio) {
      this.audio.playbackRate = 1
      this.audio.srcObject = null
    }
  }

  private adaptAudioPlayout(jitterBufferUs: number) {
    const el = this.audio
    if (!el) return
    const rate = audioCatchUpRate(jitterBufferUs)
    if (el.playbackRate !== rate) el.playbackRate = rate
    if ('preservesPitch' in el) el.preservesPitch = true
  }

  private failWebRTC(message: string) {
    if (this.state.videoMode !== 'webrtc') return
    this.setState({
      connection: 'failed',
      controlReady: false,
      videoPrimary: false,
      fallbackPrompt: this.state.websocketFallbackAvailable ? 'webrtc-failed' : '',
      error: message,
    })
  }

  private setState(update: Partial<TransportState>) {
    this.state = { ...this.state, ...update }
    this.listeners.forEach((listener) => listener(this.state))
  }

  private emitActivity(activity: InputActivity) {
    this.activityListeners.forEach((listener) => listener(activity))
  }

  private startVideoStats(peer: RTCPeerConnection) {
    window.clearInterval(this.statsTimer)
    this.playbackStats.reset()
    const initialTargets = this.adaptiveJitterBuffer.reset()
    applyJitterBufferTargets(peer.getReceivers(), initialTargets)
    const sample = async () => {
      const reports = await peer.getStats().catch(() => null)
      if (!reports || this.peer !== peer) return
      applyJitterBufferTargets(peer.getReceivers(), this.adaptiveJitterBuffer.sample(reports))
      const { bitrateKbps, bitrateSampled, latency, audio } = this.playbackStats.sample(reports)
      if (bitrateSampled) this.emitVideoBitrate(bitrateKbps)
      this.emitBrowserLatency(latency)
      this.emitAudioStats(audio)
      this.adaptAudioPlayout(audio.jitterBufferUs)
    }

    void sample()
    this.statsTimer = window.setInterval(sample, 1000)
  }

  private emitVideoBitrate(kbps: number) {
    this.bitrateListeners.forEach((listener) => listener(kbps))
  }

  private emitBrowserLatency(latency: BrowserVideoLatencyUs) {
    this.browserLatencyListeners.forEach((listener) => listener(latency))
  }

  private emitAudioStats(stats: BrowserAudioStats) {
    this.audioStatsListeners.forEach((listener) => listener(stats))
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error)
  }
}

export const onekvm = new OneKVMTransport()
