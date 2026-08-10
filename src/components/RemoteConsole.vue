<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, toRef, watch } from 'vue'
import { WifiOff } from '@lucide/vue'

import { useMouse, type MouseMode } from '@/composables/useMouse'
import { useKeyboard } from '@/composables/useKeyboard'
import { useVideoFps } from '@/composables/useVideoFps'
import { useMJPEGStream } from '@/composables/useMJPEGStream'
import { api } from '@/api/client'
import { t } from '@/i18n/runtime'
import { onekvm, type TransportState } from '@/lib/onekvm'

const props = defineProps<{
  state: TransportState
  signalConnected: boolean | null
  serverUnavailable: boolean
  mouseMode: MouseMode
  scrollInterval: number
  mouseReportRate: number
  keyboardBlocked: boolean
  rightControlAsMeta: boolean
}>()

const emit = defineEmits<{
  metadata: [width: number, height: number]
  fps: [value: number]
  bitrate: [value: number]
}>()

const video = ref<HTMLVideoElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const playing = ref(false)
const mediaError = ref(false)
const reconnecting = ref(false)
const mjpegReload = ref(0)
let detachVideo: (() => void) | undefined
let unsubscribeBitrate: (() => void) | undefined

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

useMouse(
  inputTarget,
  toRef(props, 'mouseMode'),
  toRef(props, 'scrollInterval'),
  toRef(props, 'mouseReportRate'),
)
useKeyboard(toRef(props, 'keyboardBlocked'), inputTarget, toRef(props, 'rightControlAsMeta'))
useVideoFps(video, (fps) => {
  if (!isMJPEG.value) emit('fps', fps)
})

const loading = computed(
  () => !connectionProblem.value && !playing.value && ['idle', 'connecting', 'connected'].includes(props.state.connection),
)

function updateMetadata() {
  if (!video.value) return
  emit('metadata', video.value.videoWidth, video.value.videoHeight)
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
  if (video.value) {
    video.value.disablePictureInPicture = true
    detachVideo = onekvm.attachVideo(video.value)
  }
  void onekvm.connect().catch(() => undefined)
})

onBeforeUnmount(() => {
  detachVideo?.()
  unsubscribeBitrate?.()
})

watch(isMJPEG, () => {
  playing.value = false
  mediaError.value = false
  emit('fps', 0)
  emit('bitrate', 0)
})
</script>

<template>
  <main class="console-stage">
    <video
      id="screen"
      ref="video"
      class="console-video"
      :class="{
        'cursor-crosshair': mouseMode === 'relative',
        'console-video-ready': playing && !isMJPEG,
      }"
      autoplay
      playsinline
      muted
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
      }"
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
