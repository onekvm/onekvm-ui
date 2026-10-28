import { BITRATE_CHANNEL, BrowserBitrate } from '@/lib/browser-bitrate'
import { WebRTCTrickleICE } from '@/lib/webrtc-ice'
import { readWebRTCConnectionStats, type WebRTCConnectionStats } from '@/lib/webrtc-connection-stats'
import { VIDEO_TIMING_CHANNEL, WebRTCVideoTiming } from '@/lib/webrtc-video-timing'
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
import type { WebSocketAudio } from '@/lib/websocket-audio'
import { detectH265WebSocketVideoSupport, supportsWebSocketVideo } from '@/lib/websocket-video-support'
import {
  emptyBrowserAudioStats,
  emptyBrowserVideoLatency,
  PlaybackStatsSampler,
  type BrowserAudioStats,
  type BrowserVideoLatencyUs,
} from '@/lib/webrtc-playback-stats'
import { applyOpusStereoPreference, preferLowDelayOpus } from '@/lib/webrtc-opus-sdp'
import { AdaptiveJitterBuffer, applyJitterBufferTargets } from '@/lib/adaptive-jitter-buffer'
import { activateBrowserMicrophone } from '@/lib/microphone-access'
import { WebRTCAudio, AudioLatencyRecovery, type AudioRecoveryReason } from '@/lib/webrtc-audio'
import { KeyboardReportState } from '@/lib/keyboard-report-state'

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
  audioError: string
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
export type KeyboardTextListener = (text: string, timestamp: number) => void
type BitrateListener = (kbps: number) => void
type BrowserLatencyListener = (latency: BrowserVideoLatencyUs) => void
type WebRTCConnectionStatsListener = (stats: WebRTCConnectionStats | null) => void
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
  readonly keyboardState = new KeyboardReportState((keys, modifiers) => this.sendKeyboard(keys, modifiers))
  private peer: RTCPeerConnection | null = null
  private videoTiming: WebRTCVideoTiming | null = null
  private control: RTCDataChannel | null = null
  private stream: MediaStream | null = null
  private localAudio: MediaStream | null = null
  private webRTCAudio: WebRTCAudio | null = null
  private audioStream: MediaStream | null = null
  private audioRecovery = new AudioLatencyRecovery()
  private audioOpening: Promise<void> | null = null
  private audioClosing: Promise<void> = Promise.resolve()
  private audioGeneration = 0
  private audioStereo = false
  private audioPCM = false
  private micContext: AudioContext | null = null
  private micGain: GainNode | null = null
  private micAnalyser: AnalyserNode | null = null
  private micDestination: MediaStreamAudioDestinationNode | null = null
  private speakerVolume = readStoredVolume(SPEAKER_VOLUME_KEY)
  private speakerPlaybackEnabled = readStoredBoolean(SPEAKER_ENABLED_KEY, false)
  private deviceSpeakerEnabled = false
  private microphoneVolume = readStoredVolume(MICROPHONE_VOLUME_KEY)
  private wantMicrophone = false
  private microphoneOpening: Promise<boolean> | null = null
  private heldMicrophone = false
  private video: HTMLVideoElement | null = null
  private audio: HTMLAudioElement | null = null
  private hidSocket: WebSocket | null = null
  private hidReconnectTimer = 0
  private websocketVideo: WebSocketVideo | null = null
  private websocketAudio: WebSocketAudio | null = null
  private audioReconnectTimer = 0
  private sessionId = ''
  private preferredVideoTransport = parseVideoTransport(localStorage.getItem(VIDEO_TRANSPORT_KEY))
  private connecting: Promise<void> | null = null
  private reconnecting: Promise<void> | null = null
  private connectionGeneration = 0
  private listeners = new Set<StateListener>()
  private activityListeners = new Set<ActivityListener>()
  private hidReportListeners = new Set<HIDReportListener>()
  private keyboardTextListeners = new Set<KeyboardTextListener>()
  private bitrateListeners = new Set<BitrateListener>()
  private browserLatencyListeners = new Set<BrowserLatencyListener>()
  private webRTCConnectionStatsListeners = new Set<WebRTCConnectionStatsListener>()
  private autoBitrateKbps: number | null = null
  private browserBitrate: BrowserBitrate | null = null
  private trickleICE: WebRTCTrickleICE | null = null
  private webRTCConnectionStats: WebRTCConnectionStats | null = null
  private audioStatsListeners = new Set<AudioStatsListener>()
  private keyboardLEDListeners = new Set<KeyboardLEDListener>()
  private keyboardLEDState: KeyboardLEDState = { known: false, capsLock: false, numLock: false, scrollLock: false }
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
    audioError: '',
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

  subscribeKeyboardText(listener: KeyboardTextListener) {
    this.keyboardTextListeners.add(listener)
    return () => this.keyboardTextListeners.delete(listener)
  }

  notifyKeyboardText(text: string) {
    if (!text) return
    const timestamp = performance.now()
    this.keyboardTextListeners.forEach(listener => listener(text, timestamp))
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

  subscribeWebRTCConnectionStats(listener: WebRTCConnectionStatsListener) {
    this.webRTCConnectionStatsListeners.add(listener)
    listener(this.webRTCConnectionStats)
    return () => this.webRTCConnectionStatsListeners.delete(listener)
  }

  subscribeAudioStats(listener: AudioStatsListener) {
    this.audioStatsListeners.add(listener)
    listener(emptyBrowserAudioStats())
    return () => this.audioStatsListeners.delete(listener)
  }

  subscribeKeyboardLED(listener: KeyboardLEDListener) {
    this.keyboardLEDListeners.add(listener)
    listener({ ...this.keyboardLEDState })
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
    this.playAudio()
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
    this.websocketAudio?.setSpeaker(enabled, this.speakerVolume)
    void this.reconcileAudio()
    if (enabled) this.unlockAudio()
  }

  setDeviceSpeakerEnabled(enabled: boolean) {
    if (enabled === this.deviceSpeakerEnabled) return
    this.deviceSpeakerEnabled = enabled
    void this.reconcileAudio()
  }

  private audioWanted() {
    return (this.deviceSpeakerEnabled && this.speakerPlaybackEnabled) || this.wantMicrophone
  }

  private async reconcileAudio() {
    if (!this.audioWanted()) {
      ++this.audioGeneration
      this.audioOpening = null
      this.disposeLocalAudio()
      const websocketClosing = this.disposeWebSocketAudio(true)
      const webRTCClosing = this.disposeWebRTCAudio()
      this.audioClosing = Promise.all([this.audioClosing, websocketClosing, webRTCClosing]).then(() => undefined)
      this.setState({ audioError: '' })
      return this.audioClosing
    }
    if (this.audioOpening) return this.audioOpening
    if (this.webRTCAudio || this.websocketAudio || (!this.peer && !this.websocketVideo)) return
    const generation = this.connectionGeneration
    const audioGeneration = this.audioGeneration
    const opening = this.audioClosing.then(async () => {
      if (!this.isCurrentAudio(generation, audioGeneration) || !this.audioWanted()) return
      if (this.usesWebSocketAudio()) await this.openWebSocketAudio(generation, audioGeneration)
      else await this.openWebRTCAudio(generation, audioGeneration)
    })
    this.audioOpening = opening
    try {
      await opening
    } finally {
      if (this.audioOpening === opening) this.audioOpening = null
    }
  }

  setSpeakerGain(value: number) {
    this.speakerVolume = clampVolume(value)
    localStorage.setItem(SPEAKER_VOLUME_KEY, String(this.speakerVolume))
    if (this.audio) this.audio.volume = this.speakerVolume
    this.websocketAudio?.setSpeaker(this.speakerPlaybackEnabled, this.speakerVolume)
  }

  microphoneGain() {
    return this.microphoneVolume
  }

  setMicrophoneGain(value: number) {
    this.microphoneVolume = clampVolume(value)
    localStorage.setItem(MICROPHONE_VOLUME_KEY, String(this.microphoneVolume))
    if (this.micGain) this.micGain.gain.value = this.microphoneVolume
    this.websocketAudio?.setMicrophoneGain(this.microphoneVolume)
  }

  microphoneAnalyser() {
    return this.websocketAudio?.microphoneAnalyser() ?? this.micAnalyser
  }

  playMicrophoneTestTone() {
    if (this.websocketAudio) return this.websocketAudio.playMicrophoneTestTone()
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
    this.websocketAudio?.resume()
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
    const audioClosing = this.disposePeer()
    this.setState({
      connection: 'closed',
      controlReady: false,
      webRTCSessionId: '',
      videoPrimary: false,
      fallbackPrompt: '',
      error: '',
      audioError: '',
    })
    await audioClosing
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
    this.deviceSpeakerEnabled = Boolean(status.audio.enabled)
    this.audioPCM = status.audio.quality === 'pcm'
    const automatic = status.video.codec.toLowerCase() === 'auto'
    const [hevcWebRTC, hevcWebSocket] = automatic
      ? await Promise.all([detectH265WebRTCVideoSupport(), detectH265WebSocketVideoSupport()])
      : [false, false]
    if (generation !== this.connectionGeneration) return
    const hevcSupported = this.preferredVideoTransport === 'websocket'
      ? hevcWebSocket
      : hevcWebRTC || hevcWebSocket
    const codec = connectionVideoCodec(status.video, hevcSupported)
    const autoCodec = automatic ? codec : undefined

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
      await this.startWebSocket(codec, generation, autoCodec)
      return
    }

    this.setState({ videoMode: 'webrtc', websocketFallbackAvailable })
    // LED state uses the HID WebSocket in every video mode. Its connection
    // runs independently so status notifications do not delay WebRTC setup.
    void this.openHIDWebSocket().catch(() => this.scheduleHIDSocketReconnect(generation))
    await this.startWebRTC(
      generation,
      codec,
      Boolean(status.audio.enabled),
      this.wantMicrophone,
      status.audio.channels === 'stereo',
      autoCodec,
    )
  }

  sessionID() {
    return this.sessionId || this.websocketAudio?.sessionID() || ''
  }

  audioSessionID() {
    return this.webRTCAudio?.sessionID() || this.websocketAudio?.sessionID() || ''
  }

  microphoneGranted() {
    return this.heldMicrophone
  }

  setAudioQuality(quality: string) {
    const pcm = quality === 'pcm'
    if (pcm === this.audioPCM) return this.audioOpening ?? Promise.resolve()
    this.audioPCM = pcm
    if (!this.audioOpening && !this.webRTCAudio && !this.websocketAudio) return Promise.resolve()
    const generation = this.connectionGeneration
    const audioGeneration = ++this.audioGeneration
    // Invalidate pending opens now, and release the previous microphone
    // lease before the replacement session can claim it.
    const websocketClosing = this.disposeWebSocketAudio(true)
    this.disposeLocalAudio()
    const webRTCClosing = this.disposeWebRTCAudio()
    this.audioClosing = Promise.all([this.audioClosing, websocketClosing, webRTCClosing]).then(() => undefined)
    this.audioOpening = this.audioClosing.then(async () => {
      if (!this.isCurrentAudio(generation, audioGeneration) || !this.audioWanted()) return
      this.setState({ audioError: '' })
      if (this.usesWebSocketAudio()) await this.openWebSocketAudio(generation, audioGeneration)
      else await this.openWebRTCAudio(generation, audioGeneration)
    })
    return this.audioOpening
  }

  private isCurrentAudio(generation: number, audioGeneration: number) {
    return generation === this.connectionGeneration && audioGeneration === this.audioGeneration
  }

  setMicrophone(enabled: boolean): Promise<boolean> {
    this.wantMicrophone = enabled
    if (!enabled) return this.updateMicrophone(false)
    if (this.microphoneOpening) return this.microphoneOpening
    const opening = this.updateMicrophone(true).finally(async () => {
      if (this.microphoneOpening === opening) this.microphoneOpening = null
      if (!this.audioWanted()) await this.reconcileAudio()
    })
    this.microphoneOpening = opening
    return opening
  }

  private async updateMicrophone(enabled: boolean) {
    if (enabled) await this.reconcileAudio()
    let opening = this.audioOpening
    while (opening) {
      await opening
      if (opening === this.audioOpening) break
      opening = this.audioOpening
    }
    if (enabled !== this.wantMicrophone) return false
    if (this.usesWebSocketAudio()) return this.setWebSocketMicrophone(enabled)
    if (!enabled) {
      this.heldMicrophone = false
      await this.webRTCAudio?.audioSender()?.replaceTrack(null).catch(() => undefined)
      this.disposeLocalAudio()
      const id = this.webRTCAudio?.sessionID()
      if (id) await api.setWebRTCMicrophone(id, false).catch(() => undefined)
      await this.reconcileAudio()
      return true
    }
    if (this.state.connection !== 'connected' && this.state.connection !== 'connecting') {
      this.wantMicrophone = false
      throw new Error('Microphone requires an active WebRTC session')
    }
    const player = this.webRTCAudio
    const sessionId = player?.sessionID()
    const sender = player?.audioSender()
    if (!sessionId || !sender) {
      this.wantMicrophone = false
      throw new Error('Microphone requires an active WebRTC session')
    }

    try {
      const stream = await activateBrowserMicrophone({
        requestPermission: async () => {
          if (!navigator.mediaDevices?.getUserMedia) {
            throw Object.assign(new Error('Microphone capture is unavailable'), { name: 'NotFoundError' })
          }
          return navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        },
        claimSession: async () => {
          const result = await api.setWebRTCMicrophone(sessionId, true)
          return Boolean(result.microphone)
        },
        attach: async (captured) => {
          if (this.webRTCAudio !== player || !this.wantMicrophone) throw new Error('Audio connection changed')
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
        if (this.webRTCAudio !== player) return false
        this.wantMicrophone = false
        this.heldMicrophone = false
        return false
      }
      if (this.webRTCAudio !== player || !this.wantMicrophone) return false
      this.heldMicrophone = true
      return true
    } catch (error) {
      if (this.webRTCAudio === player) {
        this.disposeLocalAudio()
        this.wantMicrophone = false
        this.heldMicrophone = false
      }
      throw error
    }
  }

  private async startWebRTC(generation: number, codec: string, _speaker: boolean, _microphone: boolean, stereo = false, autoCodec?: string) {

    const ice = await api.getWebRTCIce().catch(() => ({ ice_servers: [], trickle: false }))
    const iceServers = ice.ice_servers || []
    if (generation !== this.connectionGeneration) return
    const peer = new RTCPeerConnection(iceServers.length ? { iceServers } : undefined)
    const stream = new MediaStream()
    this.peer = peer
    const trickle = ice.trickle ? new WebRTCTrickleICE(peer, api.exchangeWebRTCCandidates) : null
    this.trickleICE = trickle
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

    const bitrateChannel = peer.createDataChannel(BITRATE_CHANNEL, { ordered: true, maxRetransmits: 0 })
    bitrateChannel.binaryType = 'arraybuffer'
    const browserBitrate = new BrowserBitrate(bitrateChannel)
    this.browserBitrate = browserBitrate
    bitrateChannel.onopen = () => { if (this.peer === peer) browserBitrate.start() }
    bitrateChannel.onmessage = event => {
      if (this.peer !== peer) return
      browserBitrate.status(event.data)
      this.autoBitrateKbps = browserBitrate.cap
    }
    bitrateChannel.onclose = () => {
      if (this.peer !== peer) return
      this.browserBitrate = null
      this.autoBitrateKbps = null
    }

    this.videoTiming = new WebRTCVideoTiming(peer.createDataChannel(VIDEO_TIMING_CHANNEL, {
      ordered: false, maxRetransmits: 0,
    }))
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
    applyJitterBufferTargets(peer.getReceivers(), this.adaptiveJitterBuffer.reset())
    const offer = await peer.createOffer()
    if (this.peer !== peer) return
    if (offer.sdp) {
      let sdp = offer.sdp
      if (stereo) sdp = applyOpusStereoPreference(sdp, true)
      offer.sdp = preferLowDelayOpus(sdp)
    }
    await peer.setLocalDescription(offer)
    if (!trickle) await this.waitForCandidates(peer)
    if (this.peer !== peer) return

    const answer = await api.createWebRTCSession(peer.localDescription?.sdp || '', false, 'video', autoCodec, Boolean(trickle))
    if (this.peer !== peer) {
      await api.closeWebRTCSession(answer.session_id, true).catch(() => undefined)
      return
    }
    this.sessionId = answer.session_id
    if (isCloudHosted()) void this.openHIDWebSocket().catch(() => undefined)
    if (this.peer !== peer) return
    this.setState({
      webRTCSessionId: answer.session_id,
      videoPrimary: answer.is_primary !== false,
    })
    await peer.setRemoteDescription({
      type: 'answer',
      sdp: preferLowDelayOpus(answer.sdp),
    })
    if (this.peer !== peer) return
    void trickle?.start(answer).catch(error => {
      // Late signaling errors do not invalidate an established media path.
      // Its connection events and disconnect timeout still detect real loss.
      if (this.peer === peer && peer.connectionState !== 'connected') this.failWebRTC(String(error))
    })
    this.startVideoStats(peer)
    this.audioStereo = stereo
    void this.reconcileAudio()
    window.clearTimeout(this.peerConnectTimer)
    this.peerConnectTimer = window.setTimeout(() => {
      if (this.peer === peer && peer.connectionState !== 'connected') {
        this.failWebRTC('WebRTC connection timed out')
      }
    }, 10_000)
  }

  private async openWebRTCAudio(generation: number, audioGeneration = this.audioGeneration) {
    const canOpen = () => this.isCurrentAudio(generation, audioGeneration) && this.audioWanted() && !this.usesWebSocketAudio() && Boolean(this.peer)
    if (!canOpen()) return
    let player: WebRTCAudio | null = null
    try {
      const schema = await api.getConfigSchema()
      if (!schema.capabilities?.audio || !canOpen()) return
      const { ice_servers: iceServers, trickle } = await api.getWebRTCIce().catch(() => ({ ice_servers: [], trickle: false }))
      if (!canOpen()) return
      player = new WebRTCAudio({
        track: (track) => {
          if (this.webRTCAudio !== player) return
          this.audioStream = new MediaStream([track])
          this.playAudio()
        },
        stats: (stats) => { if (this.webRTCAudio === player) this.emitAudioStats(stats) },
        playing: () => Boolean(this.audio && !this.audio.paused),
        ready: () => {
          if (this.webRTCAudio === player) {
            this.setState({ audioError: '' })
            this.unlockAudio()
          }
        },
        recover: (reason) => {
          if (this.webRTCAudio === player && canOpen()) void this.recoverWebRTCAudio(generation, audioGeneration, reason)
        },
      }, this.audioRecovery)
      this.webRTCAudio = player
      await player.connect(iceServers || [], this.audioStereo, trickle)
      if (this.webRTCAudio !== player || !canOpen()) return
      // The pending open must resolve before setMicrophone waits for it.
      if (this.wantMicrophone) queueMicrotask(() => {
        if (this.webRTCAudio === player && canOpen() && this.wantMicrophone) void this.setMicrophone(true).catch(() => undefined)
      })
    } catch {
      if (!canOpen() || (player && this.webRTCAudio !== player)) return
      void this.recoverWebRTCAudio(generation, audioGeneration, 'connection')
    }
  }

  private async disposeWebRTCAudio() {
    window.clearTimeout(this.audioReconnectTimer)
    this.audioReconnectTimer = 0
    const player = this.webRTCAudio
    this.webRTCAudio = null
    this.audioStream = null
    this.heldMicrophone = false
    this.playAudio()
    this.emitAudioStats(emptyBrowserAudioStats())
    this.audioClosing = Promise.all([this.audioClosing, player?.destroy()]).then(() => undefined)
    await this.audioClosing
  }

  private async recoverWebRTCAudio(generation: number, audioGeneration: number, reason: AudioRecoveryReason) {
    this.setState({ audioError: reason === 'latency' ? 'latency-recovery' : 'connection-failed' })
    this.disposeLocalAudio()
    await this.disposeWebRTCAudio()
    if (!this.isCurrentAudio(generation, audioGeneration) || this.usesWebSocketAudio() || !this.peer) return
    this.audioReconnectTimer = window.setTimeout(() => {
      this.audioReconnectTimer = 0
      this.audioOpening = this.openWebRTCAudio(generation, audioGeneration)
      void this.audioOpening
    }, reason === 'latency' ? 0 : 1000)
  }

  private async startWebSocket(codec: string, generation: number, autoCodec?: string) {
    if (!this.video) throw new Error('Video element is not ready')
    const { WebSocketVideo } = await import('@/lib/websocket-video')
    if (generation !== this.connectionGeneration) return
    const player = new WebSocketVideo(
      this.video,
      api.getVideoWebSocketURL(autoCodec),
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
      autoCodec !== undefined,
    )
    this.websocketVideo = player
    this.emitBrowserLatency(emptyBrowserVideoLatency())
    await Promise.all([player.connect(), this.openHIDWebSocket()])
    if (this.websocketVideo !== player) return
    this.setState({ connection: 'connected', controlReady: true, error: '', fallbackPrompt: '' })
    void this.reconcileAudio()
  }

  private usesWebSocketAudio() {
    return this.audioPCM || this.state.videoMode === 'websocket'
  }

  private canOpenWebSocketAudio(generation: number, audioGeneration: number) {
    return this.isCurrentAudio(generation, audioGeneration) && this.usesWebSocketAudio()
      && this.audioWanted()
      && (this.state.videoMode === 'websocket' ? Boolean(this.websocketVideo) : Boolean(this.peer))
  }

  private async openWebSocketAudio(generation: number, audioGeneration = this.audioGeneration) {
    if (!this.canOpenWebSocketAudio(generation, audioGeneration)) return
    let player: WebSocketAudio | null = null
    try {
      const schema = await api.getConfigSchema()
      if (!schema.capabilities?.audio || !this.canOpenWebSocketAudio(generation, audioGeneration)) return
      const { WebSocketAudio } = await import('@/lib/websocket-audio')
      if (!this.canOpenWebSocketAudio(generation, audioGeneration)) return
      player = new WebSocketAudio(api.getAudioWebSocketURL(), {
        stats: (stats) => { if (this.websocketAudio === player) this.emitAudioStats(stats) },
        disconnected: () => {
          if (this.websocketAudio !== player || !this.isCurrentAudio(generation, audioGeneration)) return
          this.disposeWebSocketAudio()
          this.scheduleAudioReconnect(generation, audioGeneration)
        },
      }, this.audioPCM ? 'pcm' : 'auto')
      this.websocketAudio = player
      await player.connect()
      if (this.websocketAudio !== player || !this.canOpenWebSocketAudio(generation, audioGeneration)) return
      player.setSpeaker(this.speakerPlaybackEnabled, this.speakerVolume)
      this.setState({ audioError: '' })
      this.unlockAudio()
      if (this.wantMicrophone) queueMicrotask(() => {
        if (this.websocketAudio === player && this.canOpenWebSocketAudio(generation, audioGeneration) && this.wantMicrophone) {
          void this.setMicrophone(true).catch(() => undefined)
        }
      })
    } catch {
      if (!this.canOpenWebSocketAudio(generation, audioGeneration) || (player && this.websocketAudio !== player)) return
      this.disposeWebSocketAudio()
      this.scheduleAudioReconnect(generation, audioGeneration)
    }
  }

  private scheduleAudioReconnect(generation: number, audioGeneration: number) {
    if (!this.canOpenWebSocketAudio(generation, audioGeneration) || this.audioReconnectTimer) return
    this.setState({ audioError: 'connection-failed' })
    this.audioReconnectTimer = window.setTimeout(() => {
      this.audioReconnectTimer = 0
      this.audioOpening = this.openWebSocketAudio(generation, audioGeneration)
      void this.audioOpening
    }, 1000)
  }

  private async setWebSocketMicrophone(enabled: boolean) {
    const player = this.websocketAudio
    if (!enabled) {
      this.heldMicrophone = false
      this.disposeLocalAudio()
      await player?.setMicrophone(false).catch(() => undefined)
      await this.reconcileAudio()
      return true
    }
    if (!player?.sessionID()) {
      this.wantMicrophone = false
      throw new Error('Audio WebSocket is unavailable')
    }
    try {
      const stream = await activateBrowserMicrophone({
        requestPermission: () => navigator.mediaDevices.getUserMedia({ audio: true, video: false }),
        claimSession: () => player.setMicrophone(true),
        attach: async (captured) => {
          if (this.websocketAudio !== player || !this.wantMicrophone) throw new Error('Audio connection changed')
          this.disposeLocalAudio()
          this.localAudio = captured
          player.startMicrophone(captured, this.microphoneVolume)
        },
        releaseSession: async () => { await player.setMicrophone(false) },
        stop: (captured) => captured.getTracks().forEach(track => track.stop()),
      })
      if (this.websocketAudio !== player || !this.wantMicrophone) return false
      this.heldMicrophone = Boolean(stream)
      if (!stream) this.wantMicrophone = false
      return Boolean(stream)
    } catch (error) {
      if (this.websocketAudio === player) {
        this.disposeLocalAudio()
        this.wantMicrophone = false
        this.heldMicrophone = false
      }
      throw error
    }
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
  }

  private playAudio() {
    if (!this.audio) return
    const audioTrack = this.audioStream?.getAudioTracks()[0]
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
    this.control.send(Uint8Array.from(report))
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
    this.keyboardLEDState = state
    this.keyboardLEDListeners.forEach((listener) => listener({ ...state }))
  }

  private openHIDWebSocket() {
	const generation = this.connectionGeneration
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
		if (active) {
		  this.hidSocket = null
		  this.resetKeyboardLED()
		  if (this.state.videoMode === 'webrtc') this.scheduleHIDSocketReconnect(generation)
		}
		if (!opened) {
		  reject(new Error('HID WebSocket connection closed'))
		} else if (active && this.state.videoMode !== 'webrtc') {
		  this.setState({ connection: 'disconnected', controlReady: false, error: 'HID WebSocket connection closed' })
		}
	  }
	})
  }

  private scheduleHIDSocketReconnect(generation: number) {
    if (generation !== this.connectionGeneration || this.hidReconnectTimer || this.state.videoMode !== 'webrtc') return
    if (!['connecting', 'connected', 'disconnected'].includes(this.state.connection)) return
    this.hidReconnectTimer = window.setTimeout(() => {
      this.hidReconnectTimer = 0
      if (generation !== this.connectionGeneration) return
      void this.openHIDWebSocket().catch(() => this.scheduleHIDSocketReconnect(generation))
    }, 1000)
  }

  private resetKeyboardLED() {
    const unknown: KeyboardLEDState = { known: false, capsLock: false, numLock: false, scrollLock: false }
    this.keyboardLEDState = unknown
    this.keyboardLEDListeners.forEach((listener) => listener({ ...unknown }))
  }

  private disposeHIDSocket() {
	window.clearTimeout(this.hidReconnectTimer)
	this.hidReconnectTimer = 0
	const socket = this.hidSocket
	this.hidSocket = null
	this.resetKeyboardLED()
	if (socket && socket.readyState < WebSocket.CLOSING) socket.close()
  }

  private disposeWebSocketVideo() {
    this.disposeWebSocketAudio()
    const player = this.websocketVideo
    this.websocketVideo = null
    player?.destroy()
  }

  private disposeWebSocketAudio(releaseMicrophone = false) {
    window.clearTimeout(this.audioReconnectTimer)
    this.audioReconnectTimer = 0
    this.disposeLocalAudio()
    const player = this.websocketAudio
    const closing = releaseMicrophone && this.heldMicrophone && player?.sessionID()
      ? player.setMicrophone(false).catch(() => undefined).then(() => player.destroy())
      : Promise.resolve(player?.destroy())
    this.heldMicrophone = false
    this.websocketAudio = null
    this.emitAudioStats(emptyBrowserAudioStats())
    return closing
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
    this.websocketAudio?.stopMicrophone()
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

  observeVideoFrame(metadata: VideoFrameCallbackMetadata) {
    this.videoTiming?.sampler.frame(metadata, performance.now() * 1000)
  }

  private disposePeer() {
    this.videoTiming?.destroy()
    this.videoTiming = null
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
    this.autoBitrateKbps = null
    this.browserBitrate = null
    this.trickleICE?.destroy()
    this.trickleICE = null
    this.emitWebRTCConnectionStats(null)
    const audioClosing = this.disposeWebRTCAudio()
    this.audioOpening = null
    this.disposeLocalAudio()
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
    return audioClosing
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
    let sampling = false
    const sample = async () => {
      if (sampling || this.peer !== peer) return
      sampling = true
      const reports = await peer.getStats().catch(() => null)
      sampling = false
      if (!reports || this.peer !== peer) return
      const connection = readWebRTCConnectionStats(reports, peer)
      const route = connection.remote ? JSON.stringify([connection.local, connection.remote]) : null
      this.browserBitrate?.sample(reports, connection.rttMs, route, document.visibilityState === 'visible')
      this.emitWebRTCConnectionStats({ ...connection, autoBitrateKbps: this.autoBitrateKbps })
      applyJitterBufferTargets(peer.getReceivers(), this.adaptiveJitterBuffer.sample(reports))
      const { bitrateKbps, bitrateSampled, latency } = this.playbackStats.sample(reports)
      if (bitrateSampled) this.emitVideoBitrate(bitrateKbps)
      this.emitBrowserLatency({ ...latency, ...this.videoTiming?.sampler.sample(performance.now() * 1000) })
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

  private emitWebRTCConnectionStats(stats: WebRTCConnectionStats | null) {
    this.webRTCConnectionStats = stats
    this.webRTCConnectionStatsListeners.forEach(listener => listener(stats))
  }

  private emitAudioStats(stats: BrowserAudioStats) {
    this.audioStatsListeners.forEach((listener) => listener(stats))
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error)
  }
}

export const onekvm = new OneKVMTransport()
