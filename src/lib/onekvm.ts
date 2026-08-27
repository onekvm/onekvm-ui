import { api, isUnauthorizedError } from '@/api/client'
import { statusEvents } from '@/lib/status-events'
import {
  preferredWebRTCCodecs,
  selectEncodedVideoTransport,
  supportsWebRTCVideo,
  VideoCodecUnsupportedError,
} from '@/lib/video-transport'
import type { WebSocketVideo } from '@/lib/websocket-video'
import { supportsWebSocketVideo } from '@/lib/websocket-video-support'
import {
  emptyBrowserVideoLatency,
  PlaybackStatsSampler,
  type BrowserVideoLatencyUs,
} from '@/lib/webrtc-playback-stats'

export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed'

export type TransportErrorKind = '' | 'codec-unsupported'

export interface TransportState {
  connection: ConnectionState
  controlReady: boolean
  videoMode: 'webrtc' | 'websocket' | 'mjpeg'
  websocketFallbackAvailable: boolean
  websocketFallbackOffered: boolean
  errorKind: TransportErrorKind
  error: string
}

type StateListener = (state: TransportState) => void
export type InputActivity = 'mouse' | 'keyboard'
type ActivityListener = (activity: InputActivity) => void
type BitrateListener = (kbps: number) => void
type BrowserLatencyListener = (latency: BrowserVideoLatencyUs) => void
export type { BrowserVideoLatencyUs }
export interface KeyboardLEDState {
  known: boolean
  numLock: boolean
  capsLock: boolean
  scrollLock: boolean
}
type KeyboardLEDListener = (state: KeyboardLEDState) => void

const clampInt8 = (value: number) => Math.max(-127, Math.min(127, Math.round(value)))
const clampAbsolute = (value: number) => Math.max(0, Math.min(0x7fff, Math.round(value)))

class OneKVMTransport {
  private peer: RTCPeerConnection | null = null
  private control: RTCDataChannel | null = null
  private stream: MediaStream | null = null
  private video: HTMLVideoElement | null = null
  private hidSocket: WebSocket | null = null
  private websocketVideo: WebSocketVideo | null = null
  private sessionId = ''
  private preferredVideoTransport: 'webrtc' | 'websocket' = 'webrtc'
  private connecting: Promise<void> | null = null
  private listeners = new Set<StateListener>()
  private activityListeners = new Set<ActivityListener>()
  private bitrateListeners = new Set<BitrateListener>()
  private browserLatencyListeners = new Set<BrowserLatencyListener>()
  private keyboardLEDListeners = new Set<KeyboardLEDListener>()
  private playbackStats = new PlaybackStatsSampler()
  private state: TransportState = {
    connection: 'idle',
    controlReady: false,
    videoMode: 'webrtc',
    websocketFallbackAvailable: false,
    websocketFallbackOffered: false,
    errorKind: '',
    error: '',
  }
  private statsTimer = 0
  private peerConnectTimer = 0
  private peerDisconnectTimer = 0

  subscribe(listener: StateListener) {
    this.listeners.add(listener)
    listener(this.state)
    return () => this.listeners.delete(listener)
  }

  subscribeActivity(listener: ActivityListener) {
    this.activityListeners.add(listener)
    return () => this.activityListeners.delete(listener)
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

  subscribeKeyboardLED(listener: KeyboardLEDListener) {
    this.keyboardLEDListeners.add(listener)
    return () => this.keyboardLEDListeners.delete(listener)
  }

  attachVideo(video: HTMLVideoElement) {
    this.video = video
    if (this.stream) this.play(this.stream)
    return () => {
      if (this.video === video) this.video = null
    }
  }

  connect() {
    if (this.connecting) return this.connecting
    if (['mjpeg', 'websocket'].includes(this.state.videoMode) && this.state.connection === 'connected') {
      return Promise.resolve()
    }
    if (this.peer && ['connecting', 'connected'].includes(this.peer.connectionState)) {
      return Promise.resolve()
    }

    this.connecting = this.start()
      .catch((error: unknown) => {
        this.disposeHIDSocket()
        this.disposeWebSocketVideo()
        this.disposePeer()
        const codecUnsupported = error instanceof VideoCodecUnsupportedError
        const unauthorized = isUnauthorizedError(error)
        this.setState({
          connection: 'failed',
          error: this.errorMessage(error),
          errorKind: codecUnsupported ? 'codec-unsupported' : '',
          controlReady: false,
          websocketFallbackOffered:
            !codecUnsupported &&
            !unauthorized &&
            this.state.videoMode === 'webrtc' &&
            this.state.websocketFallbackAvailable,
        })
        throw error
      })
      .finally(() => {
        this.connecting = null
      })
    return this.connecting
  }

  async reconnect() {
    await this.close()
    return this.connect()
  }

  async connectWebSocketFallback() {
    this.preferredVideoTransport = 'websocket'
    await this.close()
    return this.connect()
  }

  async retryWebRTC() {
    this.preferredVideoTransport = 'webrtc'
    await this.close()
    return this.connect()
  }

  async close() {
    const sessionId = this.sessionId
    this.sessionId = ''
    this.disposeHIDSocket()
    this.disposeWebSocketVideo()
    this.disposePeer()
    this.setState({
      connection: 'closed',
      controlReady: false,
      websocketFallbackOffered: false,
      errorKind: '',
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

  private async start() {
    this.setState({
      connection: 'connecting',
      controlReady: false,
      websocketFallbackOffered: false,
      errorKind: '',
      error: '',
    })

    const status = await statusEvents.waitForStatus()
    const codec = status.video.codec.toLowerCase()

    if (codec === 'mjpeg') {
      this.setState({
        videoMode: 'mjpeg',
        websocketFallbackAvailable: false,
      })
      await this.openHIDWebSocket()
      this.emitVideoBitrate(0)
      this.emitBrowserLatency(emptyBrowserVideoLatency())
      this.setState({ connection: 'connected', controlReady: true })
      return
    }

    const websocketFallbackAvailable = supportsWebSocketVideo(codec)
    const transport = selectEncodedVideoTransport({
      codec,
      preferred: this.preferredVideoTransport,
      webrtcSupported: codec !== 'h265' || supportsWebRTCVideo(codec),
      websocketSupported: websocketFallbackAvailable,
    })
    if (transport === 'unsupported') {
      throw new VideoCodecUnsupportedError(codec)
    }
    if (transport === 'websocket') {
      this.setState({ videoMode: 'websocket', websocketFallbackAvailable })
      await this.startWebSocket(codec)
      return
    }

    this.setState({ videoMode: 'webrtc', websocketFallbackAvailable })
    await this.startWebRTC(codec, status.audio.enabled)
  }

  private async startWebRTC(codec: string, audioEnabled: boolean) {

    const peer = new RTCPeerConnection()
    const stream = new MediaStream()
    this.peer = peer
    this.stream = stream

    peer.ontrack = (event) => {
      stream.addTrack(event.track)
      this.play(stream)
    }
    peer.onconnectionstatechange = () => {
      const connection = peer.connectionState as ConnectionState
      if (connection === 'connected') {
        window.clearTimeout(this.peerConnectTimer)
        window.clearTimeout(this.peerDisconnectTimer)
        this.setState({ connection, error: '', errorKind: '', websocketFallbackOffered: false })
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
      this.setState({ controlReady: true })
    }
    control.onmessage = (event) => this.handleControlMessage(event.data)
    control.onclose = () => this.setState({ controlReady: false })

    const video = peer.addTransceiver('video', { direction: 'recvonly' })
    const preferred = preferredWebRTCCodecs(
      codec,
      RTCRtpReceiver.getCapabilities?.('video')?.codecs ?? [],
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
    if (audioEnabled) {
      const audio = peer.addTransceiver('audio', { direction: 'sendrecv' })
      try {
        const microphone = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        const track = microphone.getAudioTracks()[0]
        if (track) await audio.sender.replaceTrack(track)
      } catch {
        // Speaker-only if the browser microphone is denied.
      }
    }
    await peer.setLocalDescription(await peer.createOffer())
    await this.waitForCandidates(peer)

    const answer = await api.createWebRTCSession(peer.localDescription?.sdp || '')
    this.sessionId = answer.session_id
    await peer.setRemoteDescription({ type: 'answer', sdp: answer.sdp })
    this.startVideoStats(peer)
    window.clearTimeout(this.peerConnectTimer)
    this.peerConnectTimer = window.setTimeout(() => {
      if (this.peer === peer && peer.connectionState !== 'connected') {
        this.failWebRTC('WebRTC connection timed out')
      }
    }, 10_000)
  }

  private async startWebSocket(codec: string) {
    if (!this.video) throw new Error('Video element is not ready')
    const { WebSocketVideo } = await import('@/lib/websocket-video')
    const player = new WebSocketVideo(
      this.video,
      api.getVideoWebSocketURL(),
      codec,
      {
        bitrate: (kbps) => {
          if (this.websocketVideo === player) this.emitVideoBitrate(kbps)
        },
        disconnected: (message) => {
          if (this.websocketVideo !== player) return
          this.setState({ connection: 'disconnected', controlReady: false, errorKind: '', error: message })
        },
      },
    )
    this.websocketVideo = player
    this.emitBrowserLatency(emptyBrowserVideoLatency())
    await Promise.all([player.connect(), this.openHIDWebSocket()])
    this.setState({ connection: 'connected', controlReady: true, error: '', errorKind: '' })
  }

  private play(stream: MediaStream) {
    if (!this.video) return
    if (this.video.srcObject !== stream) this.video.srcObject = stream
    void this.video.play().catch(() => undefined)
  }

  private send(report: Uint8Array) {
    if (this.state.videoMode === 'mjpeg' || this.state.videoMode === 'websocket') {
	  if (this.hidSocket?.readyState !== WebSocket.OPEN) return false
	  try {
		this.hidSocket.send(report)
		return true
	  } catch {
		return false
	  }
	}
    if (this.control?.readyState !== 'open') return false
    this.control.send(report)
    return true
  }

  private handleControlMessage(data: unknown) {
    const payload = data instanceof ArrayBuffer
      ? new Uint8Array(data)
      : ArrayBuffer.isView(data)
        ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
        : null
    if (!payload || payload.length !== 3 || payload[0] !== 0x81) return
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

  private disposePeer() {
    window.clearInterval(this.statsTimer)
    window.clearTimeout(this.peerConnectTimer)
    window.clearTimeout(this.peerDisconnectTimer)
    this.statsTimer = 0
    this.peerConnectTimer = 0
    this.peerDisconnectTimer = 0
    this.playbackStats.reset()
    this.emitVideoBitrate(0)
    this.emitBrowserLatency(emptyBrowserVideoLatency())
    this.control?.close()
    this.peer?.close()
    this.control = null
    this.peer = null
    this.stream = null
    if (this.video) this.video.srcObject = null
  }

  private failWebRTC(message: string) {
    if (this.state.videoMode !== 'webrtc') return
    this.setState({
      connection: 'failed',
      controlReady: false,
      websocketFallbackOffered: this.state.websocketFallbackAvailable,
      errorKind: '',
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
    const sample = async () => {
      const reports = await peer.getStats().catch(() => null)
      if (!reports || this.peer !== peer) return
      const { bitrateKbps, bitrateSampled, latency } = this.playbackStats.sample(reports)
      if (bitrateSampled) this.emitVideoBitrate(bitrateKbps)
      this.emitBrowserLatency(latency)
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

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error)
  }
}

export const onekvm = new OneKVMTransport()
