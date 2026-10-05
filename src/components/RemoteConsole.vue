<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, toRef, watch } from 'vue'
import { WifiOff } from '@lucide/vue'

import { useMouse, type MouseMode } from '@/composables/useMouse'
import { consolePointerCursor } from '@/lib/console-pointer'
import { useViewportZoom } from '@/composables/useViewportZoom'
import { useZoomBadge } from '@/composables/useZoomBadge'
import { canvasDeviceSize, mapAbsoluteMouse, originalCssSize, paintedCssSize, rotatedVideoSize, unrotateMouseDelta, type VideoFit, type VideoRotation } from '@/lib/video-fit'
import { MOUSE_BUTTON_LEFT, sendRelativeMotion } from '@/lib/hid-mouse'
import { cursorToScreen, viewOverflows } from '@/lib/viewport-zoom'
import { useKeyboard } from '@/composables/useKeyboard'
import ConnectionTrace from './ConnectionTrace.vue'
import TrackpadOverlay from './TrackpadOverlay.vue'
import { useVideoFps } from '@/composables/useVideoFps'
import { useMJPEGStream } from '@/composables/useMJPEGStream'
import { api } from '@/api/client'
import { t } from '@/i18n/runtime'
import { onekvm, type BrowserAudioStats, type BrowserVideoLatencyUs, type TransportState } from '@/lib/onekvm'
import { emptyBrowserAudioStats, emptyBrowserVideoLatency } from '@/lib/webrtc-playback-stats'

const props = defineProps<{
  state: TransportState
  signalConnected: boolean | null
  hdmiError?: string
  inputWidth?: number
  inputHeight?: number
  serverUnavailable: boolean
  mouseMode: MouseMode
  scrollInterval: number
  mouseReportRate: number
  hideLocalCursor?: boolean
  videoFit: VideoFit
  videoRotation: VideoRotation
  keyboardBlocked: boolean
  rightControlAsMeta: boolean
  trackpad?: boolean
  usbConnected?: boolean
}>()

const emit = defineEmits<{
  'update:trackpad': [open: boolean]
  metadata: [width: number, height: number]
  'canvas-size': [width: number, height: number]
  fps: [value: number]
  bitrate: [value: number]
  'browser-latency': [value: BrowserVideoLatencyUs & { presentUs: number }]
  'audio-stats': [value: BrowserAudioStats]
}>()

const stage = ref<HTMLElement | null>(null)
const video = ref<HTMLVideoElement | null>(null)
const remoteAudio = ref<HTMLAudioElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const inputSurface = ref<HTMLElement | null>(null)
const trackpadOn = computed(() => Boolean(props.trackpad))
const hidEnabled = computed(() => !trackpadOn.value && !props.keyboardBlocked)
const hidCursor = ref<string | undefined>(undefined)
let lastPointer: { x: number; y: number } | null = null
const trackpadChrome = shallowRef(0)
const trackpadButtons = shallowRef(0)
const stageStyle = computed(() => (
  trackpadOn.value && trackpadChrome.value > 0
    ? { '--trackpad-overlay-span': `${trackpadChrome.value}px` }
    : undefined
))
let canvasObserver: ResizeObserver | undefined
let trackpadFramed = false
const playing = ref(false)
const mediaError = ref(false)
const reconnecting = ref(false)
const mjpegReload = ref(0)
let detachVideo: (() => void) | undefined
let detachAudio: (() => void) | undefined
let unsubscribeBitrate: (() => void) | undefined
let unsubscribeBrowserLatency: (() => void) | undefined
let unsubscribeAudioStats: (() => void) | undefined
let webrtcLatency = emptyBrowserVideoLatency()
let presentUs = 0

function publishBrowserLatency() {
  emit('browser-latency', { ...webrtcLatency, presentUs })
}

const isMJPEG = computed(() => props.state.videoMode === 'mjpeg')
const unsupportedInput = computed(() => props.hdmiError === 'out_of_range')
const unsupportedSize = computed(() => {
  const width = props.inputWidth ?? 0
  const height = props.inputHeight ?? 0
  if (width <= 0 || height <= 0) return ''
  return `${width} × ${height}`
})
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
  () => !props.state.fallbackPrompt && (
    props.serverUnavailable || transportFailed.value || (mediaError.value && props.signalConnected !== false)
  ),
)

useMouse(
  inputTarget,
  toRef(props, 'mouseMode'),
  toRef(props, 'scrollInterval'),
  toRef(props, 'mouseReportRate'),
  toRef(props, 'videoFit'),
  inputSurface,
  hidEnabled,
  toRef(props, 'videoRotation'),
)
const {
  view: zoomView,
  cursor: zoomCursor,
  interacting: zooming,
  style: viewportStyle,
  reset: resetZoom,
  followLook,
  zoomToOneToOne,
} = useViewportZoom(inputSurface, stage, trackpadOn)
const { shown: zoomBadgeShown } = useZoomBadge(() => zoomView.scale, zooming)
useKeyboard(toRef(props, 'keyboardBlocked'), inputSurface, toRef(props, 'rightControlAsMeta'))
const webrtcPresent = computed(() => props.state.videoMode === 'webrtc')
useVideoFps(video, (fps) => {
  if (!isMJPEG.value) emit('fps', fps)
}, (value) => {
  presentUs = webrtcPresent.value ? value : 0
  publishBrowserLatency()
}, webrtcPresent)

const loading = computed(
  () => !connectionProblem.value && !playing.value && ['idle', 'connecting', 'connected'].includes(props.state.connection),
)
const frameWidth = ref(0)
const frameHeight = ref(0)
const displayPixelRatio = ref(1)
const stageWidth = shallowRef(0)
const stageHeight = shallowRef(0)
let pixelRatioQuery: MediaQueryList | undefined

function onPixelRatioChange() {
  syncDisplayPixelRatio()
}

function syncDisplayPixelRatio() {
  displayPixelRatio.value = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
  pixelRatioQuery?.removeEventListener('change', onPixelRatioChange)
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
  pixelRatioQuery = window.matchMedia(`(resolution: ${displayPixelRatio.value}dppx)`)
  pixelRatioQuery.addEventListener('change', onPixelRatioChange)
}

const pictureSize = computed(() => {
  if (frameWidth.value <= 0 || frameHeight.value <= 0)
    return undefined
  const source = rotatedVideoSize(frameWidth.value, frameHeight.value, props.videoRotation)
  return !trackpadOn.value && props.videoFit === 'original'
    ? originalCssSize(source.width, source.height, displayPixelRatio.value)
    : paintedCssSize(stageWidth.value, stageHeight.value, source.width, source.height, 'stretch')
})
const pictureStyle = computed(() => pictureSize.value
  ? { width: `${pictureSize.value.width}px`, height: `${pictureSize.value.height}px` }
  : undefined)
const mediaStyle = computed(() => {
  const size = pictureSize.value
  if (!size) return undefined
  const media = rotatedVideoSize(size.width, size.height, props.videoRotation)
  return {
    position: 'absolute' as const,
    inset: 'auto',
    left: '50%',
    top: '50%',
    margin: '0',
    width: `${media.width}px`,
    height: `${media.height}px`,
    maxWidth: 'none',
    maxHeight: 'none',
    objectFit: 'fill' as const,
    transform: `translate(-50%, -50%) rotate(${props.videoRotation}deg)`,
  }
})

function updateMetadata() {
  if (!video.value) return
  frameWidth.value = video.value.videoWidth
  frameHeight.value = video.value.videoHeight
  emit('metadata', video.value.videoWidth, video.value.videoHeight)
}

function onVideoWaiting() {
  const element = video.value
  /* High-motion HID drags make WebRTC fire waiting without emptying the
     element. Treating that as a stall fades the picture and zeros overlay FPS. */
  if (element && element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return
  playing.value = false
}

function publishCanvasSize() {
  const target = inputTarget.value ?? stage.value
  if (!target) return
  const painted = paintedCssSize(
    target.clientWidth,
    target.clientHeight,
    frameWidth.value,
    frameHeight.value,
    trackpadOn.value ? 'stretch' : props.videoFit,
  )
  const device = canvasDeviceSize(painted.width, painted.height, displayPixelRatio.value)
  if (device.width <= 0 || device.height <= 0) return
  emit('canvas-size', device.width, device.height)
}

function observeCanvas() {
  canvasObserver?.disconnect()
  const syncStageSize = () => {
    stageWidth.value = stage.value?.clientWidth ?? 0
    stageHeight.value = stage.value?.clientHeight ?? 0
    publishCanvasSize()
  }
  syncStageSize()
  canvasObserver = new ResizeObserver(syncStageSize)
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
  inputSurface.value?.focus({ preventScroll: true })
}

function hidFit(): VideoFit {
  return trackpadOn.value ? 'stretch' : props.videoFit
}

function refreshHidCursor(clientX?: number, clientY?: number) {
  const x = clientX ?? lastPointer?.x
  const y = clientY ?? lastPointer?.y
  if (x == null || y == null || trackpadOn.value) {
    hidCursor.value = undefined
    return
  }
  const target = inputTarget.value
  const source = sourceSize()
  const inside = Boolean(target && source.width > 0) && mapAbsoluteMouse(
    x,
    y,
    target!.getBoundingClientRect(),
    source.width,
    source.height,
    hidFit(),
    props.videoRotation,
  ).inside
  hidCursor.value = consolePointerCursor(
    Boolean(props.hideLocalCursor),
    props.mouseMode === 'relative',
    trackpadOn.value,
    inside,
  )
}

function onHidPointerMove(event: PointerEvent) {
  lastPointer = { x: event.clientX, y: event.clientY }
  refreshHidCursor(event.clientX, event.clientY)
}

function onHidPointerLeave() {
  lastPointer = null
  hidCursor.value = undefined
}

function sourceSize() {
  const element = inputTarget.value
  const width = frameWidth.value
    || (element instanceof HTMLVideoElement ? element.videoWidth : element instanceof HTMLCanvasElement ? element.width : 0)
  const height = frameHeight.value
    || (element instanceof HTMLVideoElement ? element.videoHeight : element instanceof HTMLCanvasElement ? element.height : 0)
  return { width, height }
}

function sendTrackpadAbsolute(buttons: number) {
  const stageEl = stage.value
  const videoEl = inputTarget.value
  const source = sourceSize()
  if (!stageEl || !videoEl || source.width <= 0 || source.height <= 0) return
  const frame = inputSurface.value?.getBoundingClientRect() ?? stageEl.getBoundingClientRect()
  const point = viewOverflows(zoomView.scale)
    ? cursorToScreen(zoomView, zoomCursor)
    : { x: frame.width / 2, y: frame.height / 2 }
  const hid = mapAbsoluteMouse(
    frame.left + point.x,
    frame.top + point.y,
    videoEl.getBoundingClientRect(),
    source.width,
    source.height,
    'stretch',
    props.videoRotation,
  )
  onekvm.sendAbsoluteMouse(buttons, hid.x, hid.y)
}

function onTrackpadLook(dx: number, dy: number) {
  if (viewOverflows(zoomView.scale)) {
    followLook(dx, dy)
    sendTrackpadAbsolute(trackpadButtons.value)
    return
  }
  const movement = unrotateMouseDelta(dx, dy, props.videoRotation)
  sendRelativeMotion(trackpadButtons.value, movement.x, movement.y)
}

function onTrackpadTap() {
  const held = trackpadButtons.value
  if (viewOverflows(zoomView.scale)) {
    sendTrackpadAbsolute(held | MOUSE_BUTTON_LEFT)
    sendTrackpadAbsolute(held)
    return
  }
  onekvm.sendRelativeMouse(held | MOUSE_BUTTON_LEFT)
  onekvm.sendRelativeMouse(held)
}

function onTrackpadWheel(delta: number) {
  sendRelativeMotion(trackpadButtons.value, 0, 0, delta)
}

function onTrackpadButtons(next: number) {
  trackpadButtons.value = next
  if (viewOverflows(zoomView.scale)) sendTrackpadAbsolute(next)
  else onekvm.sendRelativeMouse(next)
}

function onTrackpadChrome(height: number) {
  trackpadChrome.value = height
  void nextTick(() => {
    if (viewOverflows(zoomView.scale)) sendTrackpadAbsolute(trackpadButtons.value)
  })
}

async function prepareTrackpadView() {
  await nextTick()
  const source = sourceSize()
  if (source.width <= 0 || source.height <= 0) return
  const rotated = rotatedVideoSize(source.width, source.height, props.videoRotation)
  zoomToOneToOne(rotated.width, rotated.height)
  if (viewOverflows(zoomView.scale)) sendTrackpadAbsolute(trackpadButtons.value)
}

defineExpose({ focusVideo })

watch(trackpadOn, (open) => {
  trackpadFramed = false
  if (open) return
  trackpadChrome.value = 0
  trackpadButtons.value = 0
})

watch([trackpadChrome, frameWidth, frameHeight], () => {
  if (!trackpadOn.value || trackpadChrome.value <= 0 || trackpadFramed) return
  if (sourceSize().width <= 0 || sourceSize().height <= 0) return
  trackpadFramed = true
  void prepareTrackpadView()
})

onMounted(() => {
  syncDisplayPixelRatio()
  unsubscribeBitrate = onekvm.subscribeVideoBitrate((value) => emit('bitrate', value))
  unsubscribeBrowserLatency = onekvm.subscribeBrowserLatency((value) => {
    webrtcLatency = value
    publishBrowserLatency()
  })
  unsubscribeAudioStats = onekvm.subscribeAudioStats((value) => emit('audio-stats', value))
  if (video.value) {
    video.value.disablePictureInPicture = true
    detachVideo = onekvm.attachVideo(video.value)
  }
  if (remoteAudio.value) detachAudio = onekvm.attachAudio(remoteAudio.value)
  observeCanvas()
  void onekvm.connect().then(() => {
    onekvm.sendRelativeMouse(0)
  }).catch(() => undefined)
})

onBeforeUnmount(() => {
  pixelRatioQuery?.removeEventListener('change', onPixelRatioChange)
  pixelRatioQuery = undefined
  canvasObserver?.disconnect()
  detachVideo?.()
  detachAudio?.()
  unsubscribeBitrate?.()
  unsubscribeBrowserLatency?.()
  unsubscribeAudioStats?.()
})

watch(isMJPEG, () => {
  playing.value = false
  mediaError.value = false
  emit('fps', 0)
  emit('bitrate', 0)
  webrtcLatency = emptyBrowserVideoLatency()
  presentUs = 0
  publishBrowserLatency()
  emit('audio-stats', emptyBrowserAudioStats())
  void nextTick(observeCanvas)
})

watch(() => props.state.videoMode, (mode) => {
  if (mode === 'webrtc') return
  webrtcLatency = emptyBrowserVideoLatency()
  presentUs = 0
  publishBrowserLatency()
})

watch([() => props.videoFit, mediaStyle, inputTarget, displayPixelRatio], () => {
  void nextTick(observeCanvas)
})

watch(() => props.videoRotation, () => {
  resetZoom()
  if (trackpadOn.value) void prepareTrackpadView()
})

watch(
  [() => props.hideLocalCursor, () => props.mouseMode, trackpadOn, () => props.videoFit, () => props.videoRotation],
  () => refreshHidCursor(),
  { flush: 'post' },
)
</script>

<template>
  <main
    ref="stage"
    class="console-stage"
    :class="{
      'console-stage-original': videoFit === 'original' && !trackpadOn,
      'is-zoomable': trackpadOn,
      'has-trackpad': trackpadOn,
    }"
    :style="stageStyle"
    @pointerdown="onekvm.unlockAudio()"
  >
    <ConnectionTrace :usb-connected="Boolean(usbConnected)" :video-connected="playing" />
    <audio ref="remoteAudio" class="console-remote-audio" autoplay playsinline />
    <div class="console-viewport" :style="viewportStyle">
    <div class="console-picture" :style="pictureStyle">
    <video
      id="screen"
      ref="video"
      class="console-video"
      :class="{
        'console-video-ready': playing && !isMJPEG,
        'console-video-original': videoFit === 'original' && !trackpadOn,
        'console-video-stretch': videoFit === 'stretch' || trackpadOn,
      }"
      autoplay
      playsinline
      muted
      :style="mediaStyle"
      :disablePictureInPicture="true"
      controlslist="nopictureinpicture"
      tabindex="-1"
      @playing="playing = true"
      @waiting="onVideoWaiting"
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
        'console-video-ready': playing && isMJPEG,
        'console-video-original': videoFit === 'original' && !trackpadOn,
        'console-video-stretch': videoFit === 'stretch' || trackpadOn,
      }"
      :style="mediaStyle"
      tabindex="-1"
    />
    </div>
    </div>
    <div
      ref="inputSurface"
      class="console-hid-layer"
      :style="hidCursor ? { cursor: hidCursor } : undefined"
      tabindex="0"
      @pointerenter="onHidPointerMove"
      @pointermove="onHidPointerMove"
      @pointerleave="onHidPointerLeave"
    />
    <Transition name="console-zoom-badge">
      <button
        v-if="zoomBadgeShown"
        type="button"
        class="console-zoom-badge"
        :aria-label="t('mouse.resetZoom', 'Reset zoom')"
        @click="resetZoom()"
      >
        {{ Math.round(zoomView.scale * 100) }}%
      </button>
    </Transition>
    <TrackpadOverlay
      v-if="trackpadOn"
      @close="emit('update:trackpad', false)"
      @look="onTrackpadLook"
      @tap="onTrackpadTap"
      @wheel="onTrackpadWheel"
      @buttons="onTrackpadButtons"
      @chrome="onTrackpadChrome"
    />

    <div
      v-if="unsupportedInput"
      class="console-state console-oor"
      role="status"
      aria-live="polite"
    >
      <strong>{{ t('screen.unsupportedResolution', 'Unsupported resolution') }}</strong>
      <span v-if="unsupportedSize">{{ unsupportedSize }}</span>
      <p>{{ t('screen.unsupportedResolutionHint', 'Set the host output to a Cube-supported mode such as 1920×1080 or 1280×720.') }}</p>
    </div>

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
      :title="t('screen.connectionLostTitle', 'Connection interrupted')"
      :closable="false"
      :mask-closable="false"
      :close-on-esc="false"
      :auto-focus="false"
    >
      <div class="connection-problem-content" aria-live="assertive">
        <WifiOff :size="42" />
        <p>{{ t('screen.connectionLostDetail', 'The browser can no longer reach OneKVM. Check the network connection or wait for the service to restart.') }}</p>
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

<style scoped>
.console-stage-original {
  align-items: safe center;
  justify-content: safe center;
}

.console-picture {
  position: relative;
  flex: 0 0 auto;
  width: 100%;
  height: 100%;
}
</style>
