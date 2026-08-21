<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRef, watch } from 'vue'
import { WifiOff } from '@lucide/vue'

import { useMouse, type MouseMode } from '@/composables/useMouse'
import type { VideoFit } from '@/lib/video-fit'
import { useKeyboard } from '@/composables/useKeyboard'
import { useVideoFps } from '@/composables/useVideoFps'
import { useMJPEGStream } from '@/composables/useMJPEGStream'
import { api } from '@/api/client'
import { t } from '@/i18n/runtime'
import { onekvm, type BrowserVideoLatencyUs, type TransportState } from '@/lib/onekvm'
import { emptyBrowserVideoLatency } from '@/lib/webrtc-playback-stats'

const props = defineProps<{
  state: TransportState
  signalConnected: boolean | null
  serverUnavailable: boolean
  mouseMode: MouseMode
  scrollInterval: number
  mouseReportRate: number
  videoFit: VideoFit
  keyboardBlocked: boolean
  rightControlAsMeta: boolean
}>()

const emit = defineEmits<{
  metadata: [width: number, height: number]
  'canvas-size': [width: number, height: number]
  fps: [value: number]
  bitrate: [value: number]
  'browser-latency': [value: BrowserVideoLatencyUs & { presentUs: number }]
}>()

const stage = ref<HTMLElement | null>(null)
const video = ref<HTMLVideoElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
let canvasObserver: ResizeObserver | undefined
const playing = ref(false)
const mediaError = ref(false)
const reconnecting = ref(false)
const mjpegReload = ref(0)
let detachVideo: (() => void) | undefined
let unsubscribeBitrate: (() => void) | undefined
let unsubscribeBrowserLatency: (() => void) | undefined
let webrtcLatency = emptyBrowserVideoLatency()
let presentUs = 0

function publishBrowserLatency() {
  emit('browser-latency', { ...webrtcLatency, presentUs })
}

const isMJPEG = computed(() => props.state.videoMode === 'mjpeg')
const inputTarget = computed<HTMLVideoElement | HTMLCanvasElement | null>(
  () => isMJPEG.value ? canvas.value : video.value,
)
const mjpegURL = computed(() => `${api.getMJPEGStreamURL()}?session=${mjpegReload.value}`)
useMJPEGStream(isMJPEG, mjpegURL, {
  frame: updateMJPEGFrame,
  fps: (value) => emit('fps', value),
  bitrate: (value) => emit('bitrate', value),
  error: handleMJPEGError,
})

const transportFailed = computed(
  () => ['failed', 'disconnected'].includes(props.state.connection),
)
const connectionProblem = computed(
  () => !props.state.websocketFallbackOffered && (
    props.serverUnavailable || transportFailed.value || (mediaError.value && props.signalConnected !== false)
  ),
)
const connectionProblemTitle = computed(() =>
  props.state.errorKind === 'codec-unsupported'
    ? t('screen.h265UnsupportedTitle', 'This browser cannot decode H.265')
    : t('screen.connectionLostTitle', 'Connection interrupted'),
)
const connectionProblemDetail = computed(() =>
  props.state.errorKind === 'codec-unsupported'
    ? t('screen.h265UnsupportedDetail', 'H.265 needs a HEVC decoder. This browser has neither WebRTC H.265 nor MSE HEVC. Switch the codec to H.264, or use Safari or a Chrome/Edge build with HEVC.')
    : t('screen.connectionLostDetail', 'The browser can no longer reach OneKVM. Check the network connection or wait for the service to restart.'),
)

useMouse(
  inputTarget,
  toRef(props, 'mouseMode'),
  toRef(props, 'scrollInterval'),
  toRef(props, 'mouseReportRate'),
  toRef(props, 'videoFit'),
)
useKeyboard(toRef(props, 'keyboardBlocked'), inputTarget, toRef(props, 'rightControlAsMeta'))
useVideoFps(video, (fps) => {
  if (!isMJPEG.value) emit('fps', fps)
}, (value) => {
  presentUs = isMJPEG.value ? 0 : value
  publishBrowserLatency()
})

const loading = computed(
  () => !connectionProblem.value && !playing.value && ['idle', 'connecting', 'connected'].includes(props.state.connection),
)
const frameWidth = ref(0)
const frameHeight = ref(0)
const originalSizeStyle = computed(() => {
  if (props.videoFit !== 'original' || frameWidth.value <= 0 || frameHeight.value <= 0)
    return undefined
  return { width: `${frameWidth.value}px`, height: `${frameHeight.value}px` }
})

function updateMetadata() {
  if (!video.value) return
  frameWidth.value = video.value.videoWidth
  frameHeight.value = video.value.videoHeight
  emit('metadata', video.value.videoWidth, video.value.videoHeight)
}

function publishCanvasSize() {
  const target = inputTarget.value ?? stage.value
  if (!target) return
  const width = Math.round(target.clientWidth)
  const height = Math.round(target.clientHeight)
  if (width <= 0 || height <= 0) return
  emit('canvas-size', width, height)
}

function observeCanvas() {
  canvasObserver?.disconnect()
  canvasObserver = new ResizeObserver(publishCanvasSize)
  if (stage.value) canvasObserver.observe(stage.value)
  if (inputTarget.value) canvasObserver.observe(inputTarget.value)
  void nextTick(publishCanvasSize)
}

function updateMJPEGFrame(source: CanvasImageSource, width: number, height: number) {
  const target = canvas.value
  if (!target || width <= 0 || height <= 0) return
  if (target.width !== width || target.height !== height) {
    target.width = width
    target.height = height
  }
  const context = target.getContext('2d', { alpha: false })
  if (!context) throw new Error('Canvas 2D is unavailable')
  context.drawImage(source, 0, 0, width, height)
  playing.value = true
  mediaError.value = false
  frameWidth.value = width
  frameHeight.value = height
  emit('metadata', width, height)
}

function handleMJPEGError() {
  playing.value = false
  mediaError.value = true
}

async function reconnect() {
  if (reconnecting.value) return
  reconnecting.value = true
  mediaError.value = false
  mjpegReload.value += 1
  try {
    await onekvm.reconnect()
  } catch {
    // The transport publishes the localized modal state; keep it open.
  } finally {
    reconnecting.value = false
  }
}

function exitPictureInPicture() {
  if (document.pictureInPictureElement) {
    void document.exitPictureInPicture().catch(() => undefined)
  }
}

function focusVideo() {
  inputTarget.value?.focus({ preventScroll: true })
}

defineExpose({ focusVideo })

onMounted(() => {
  unsubscribeBitrate = onekvm.subscribeVideoBitrate((value) => emit('bitrate', value))
  unsubscribeBrowserLatency = onekvm.subscribeBrowserLatency((value) => {
    webrtcLatency = value
    publishBrowserLatency()
  })
  if (video.value) {
    video.value.disablePictureInPicture = true
    detachVideo = onekvm.attachVideo(video.value)
  }
  observeCanvas()
  void onekvm.connect().catch(() => undefined)
})

onBeforeUnmount(() => {
  canvasObserver?.disconnect()
  detachVideo?.()
  unsubscribeBitrate?.()
  unsubscribeBrowserLatency?.()
})

watch(isMJPEG, () => {
  playing.value = false
  mediaError.value = false
  emit('fps', 0)
  emit('bitrate', 0)
  webrtcLatency = emptyBrowserVideoLatency()
  presentUs = 0
  publishBrowserLatency()
  void nextTick(observeCanvas)
})

watch([() => props.videoFit, originalSizeStyle, inputTarget], () => {
  void nextTick(observeCanvas)
})
</script>

<template>
  <main ref="stage" class="console-stage" :class="{ 'console-stage-original': videoFit === 'original' }">
    <video
      id="screen"
      ref="video"
      class="console-video"
      :class="{
        'cursor-crosshair': mouseMode === 'relative',
        'console-video-ready': playing && !isMJPEG,
        'console-video-original': videoFit === 'original',
        'console-video-stretch': videoFit === 'stretch',
      }"
      autoplay
      playsinline
      muted
      :style="originalSizeStyle"
      :disablePictureInPicture="true"
      controlslist="nopictureinpicture"
      tabindex="0"
      @playing="playing = true"
      @waiting="playing = false"
      @emptied="playing = false"
      @loadedmetadata="updateMetadata"
      @resize="updateMetadata"
      @enterpictureinpicture="exitPictureInPicture"
    />
    <canvas
      v-if="isMJPEG"
      id="screen-mjpeg"
      ref="canvas"
      class="console-video console-video-canvas"
      :class="{
        'cursor-crosshair': mouseMode === 'relative',
        'console-video-ready': playing && isMJPEG,
        'console-video-original': videoFit === 'original',
        'console-video-stretch': videoFit === 'stretch',
      }"
      :style="originalSizeStyle"
      tabindex="0"
    />

    <Transition name="console-loading">
      <div v-if="loading" class="console-state" aria-live="polite" aria-busy="true">
        <div
          class="console-connect-progress"
          role="progressbar"
          :aria-label="t('screen.connectingVideo', 'Connecting to video…')"
        ><span /></div>
        <span>{{ t('screen.connectingVideo', 'Connecting to video…') }}</span>
      </div>
    </Transition>

    <n-modal
      :show="connectionProblem"
      to=".console-workspace"
      preset="card"
      class="connection-problem-modal"
      :title="connectionProblemTitle"
      :closable="false"
      :mask-closable="false"
      :close-on-esc="false"
      :auto-focus="false"
    >
      <div class="connection-problem-content" aria-live="assertive">
        <WifiOff :size="42" />
        <p>{{ connectionProblemDetail }}</p>
        <code v-if="state.error">{{ state.error }}</code>
      </div>
      <template #footer>
        <div class="connection-problem-actions">
          <n-button type="primary" :loading="reconnecting" @click="reconnect">
            {{ t('screen.reconnect', 'Reconnect') }}
          </n-button>
        </div>
      </template>
    </n-modal>
  </main>
</template>
