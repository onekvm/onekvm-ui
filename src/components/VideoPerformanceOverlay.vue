<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Activity, GripHorizontal, Minus, Square, X } from '@lucide/vue'

import { t } from '@/i18n/runtime'
import { useLatencyHistory } from '@/composables/useLatencyHistory'
import { useVideoStreamHistory } from '@/composables/useVideoStreamHistory'
import {
  clampOverlayPosition,
  overlayDragHostRect,
  overlayGrabOffset,
  overlayPointerPosition,
  type OverlayPoint,
} from '@/lib/overlay-drag'
import { formatCompactBitrate } from '@/lib/performance-compact'

import DisplayStatusValues from './DisplayStatusValues.vue'

const props = defineProps<{
  canvasWidth: number
  canvasHeight: number
  videoFps: number
  videoBitrate: number
  targetFps: number
  codec: string
  transport: 'webrtc' | 'websocket' | 'mjpeg'
  inputWidth: number
  inputHeight: number
  captureLatencyUs: number
  encodeLatencyUs: number
  iceRttUs: number
  jitterBufferUs: number
  decodeUs: number
  presentUs: number
  visible: boolean
  originX?: number
  originY?: number
  audioEnabled?: boolean
  audioEncoder?: string
  audioQuality?: string
  audioSampleRate?: number
  audioChannels?: number
  audioFps?: number
  audioBitrate?: number
  audioCaptureLatencyUs?: number
  audioEncodeLatencyUs?: number
  audioJitterBufferUs?: number
}>()

const emit = defineEmits<{
  close: []
}>()

const ADVANCED_KEY = 'onekvm-performance-advanced'
const AUDIO_KEY = 'onekvm-performance-audio'
const COMPACT_KEY = 'onekvm-performance-compact'
const advanced = ref(localStorage.getItem(ADVANCED_KEY) === 'true')
const showAudio = ref(localStorage.getItem(AUDIO_KEY) !== 'false')
const compact = ref(localStorage.getItem(COMPACT_KEY) === 'true')

const { samples } = useVideoStreamHistory(() => props.videoFps, () => props.videoBitrate)
const { samples: latencySamples } = useLatencyHistory(() => ({
  capture: props.captureLatencyUs,
  encode: props.encodeLatencyUs,
  ice: props.iceRttUs,
  jitter: props.jitterBufferUs,
  decode: props.decodeUs,
  present: props.presentUs,
}))
const { samples: audioSamples } = useVideoStreamHistory(() => props.audioFps || 0, () => props.audioBitrate || 0)
const { samples: audioLatencySamples } = useLatencyHistory(() => ({
  capture: props.audioCaptureLatencyUs || 0,
  encode: props.audioEncodeLatencyUs || 0,
  ice: 0,
  jitter: props.audioJitterBufferUs || 0,
  decode: 0,
  present: 0,
}))
const panel = ref<HTMLElement | null>(null)
const position = ref({ x: 24, y: 8 })
let dragOffset: OverlayPoint = { x: 0, y: 0 }
let dragging = false
let dragHandle: HTMLElement | null = null
let dragPointerId: number | null = null

const panelStyle = computed(() => ({
  left: `${position.value.x}px`,
  top: `${position.value.y}px`,
}))

function hostRect() {
  const parent = panel.value?.offsetParent
  const stage = parent instanceof HTMLElement
    ? parent.querySelector(':scope > .console-stage')
    : null
  return overlayDragHostRect(
    parent instanceof HTMLElement ? parent.getBoundingClientRect() : null,
    stage instanceof HTMLElement ? stage.getBoundingClientRect() : null,
    { width: window.innerWidth, height: window.innerHeight },
  )
}

function panelSize() {
  if (!props.visible || !panel.value) return null
  if (!(panel.value.offsetParent instanceof HTMLElement)) return null
  const width = panel.value.offsetWidth
  const height = panel.value.offsetHeight
  if (width <= 0 || height <= 0) return null
  return { width, height }
}

function clampPosition() {
  const size = panelSize()
  if (!size) return
  position.value = clampOverlayPosition(position.value, size, hostRect())
}

async function placePanel() {
  await nextTick()
  const size = panelSize()
  if (!size) return
  const host = hostRect()
  position.value = props.originX == null || props.originY == null
    ? { x: Math.max(8, host.width - size.width - 18), y: 8 }
    : { x: props.originX - host.left, y: props.originY - host.top }
  clampPosition()
}

const showAudioColumn = computed(() => showAudio.value)

function startDrag(event: PointerEvent) {
  if (event.button !== 0 || !panel.value) return
  if (!compact.value && window.innerWidth < 768) return
  const handle = event.currentTarget
  if (!(handle instanceof HTMLElement)) return
  handle.setPointerCapture(event.pointerId)
  event.preventDefault()
  event.stopPropagation()
  const rect = panel.value.getBoundingClientRect()
  dragOffset = overlayGrabOffset(event.clientX, event.clientY, rect)
  dragging = true
  dragHandle = handle
  dragPointerId = event.pointerId
  window.addEventListener('pointermove', drag)
  window.addEventListener('pointerup', stopDrag)
  window.addEventListener('pointercancel', stopDrag)
}

function drag(event: PointerEvent) {
  if (!dragging) return
  event.preventDefault()
  position.value = overlayPointerPosition(event.clientX, event.clientY, hostRect(), dragOffset)
  clampPosition()
}

function stopDrag() {
  if (!dragging) return
  dragging = false
  if (dragHandle && dragPointerId != null && dragHandle.hasPointerCapture(dragPointerId)) {
    dragHandle.releasePointerCapture(dragPointerId)
  }
  dragHandle = null
  dragPointerId = null
  window.removeEventListener('pointermove', drag)
  window.removeEventListener('pointerup', stopDrag)
  window.removeEventListener('pointercancel', stopDrag)
}

onMounted(() => {
  window.addEventListener('resize', clampPosition)
  if (props.visible) void placePanel()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', clampPosition)
  stopDrag()
})

watch(() => props.visible, (visible) => {
  if (visible) void placePanel()
})
watch(() => [props.canvasWidth, props.canvasHeight], () => {
  if (props.visible) clampPosition()
})
function persistLayout() {
  if (!props.visible) return
  void nextTick().then(() => clampPosition())
}

watch(advanced, (value) => {
  localStorage.setItem(ADVANCED_KEY, String(value))
  persistLayout()
})
watch(showAudio, (value) => {
  localStorage.setItem(AUDIO_KEY, String(value))
  persistLayout()
})
watch(compact, (value) => {
  localStorage.setItem(COMPACT_KEY, String(value))
  persistLayout()
})
</script>

<template>
  <section
    ref="panel"
    class="video-performance-overlay"
    :class="{ 'is-advanced': advanced && !compact, 'has-audio': showAudioColumn && !compact, 'is-compact': compact }"
    :style="panelStyle"
    role="dialog"
    :aria-label="t('screen.performance', 'Performance')"
  >
    <div
      v-if="compact"
      class="performance-compact-bar"
      @pointerdown="startDrag"
    >
      <GripHorizontal :size="14" class="floating-window-grip" />
      <span class="performance-compact-metric">
        <strong>{{ videoFps }}</strong>
        <span>FPS</span>
      </span>
      <span class="performance-compact-sep" />
      <span class="performance-compact-metric">
        <strong>{{ formatCompactBitrate(videoBitrate) }}</strong>
        <span>{{ codec || '—' }}</span>
      </span>
      <template v-if="showAudioColumn">
        <span class="performance-compact-sep" />
        <span class="performance-compact-metric">
          <strong>{{ audioFps || 0 }}</strong>
          <span>/s</span>
        </span>
        <span class="performance-compact-metric">
          <strong>{{ formatCompactBitrate(audioBitrate || 0) }}</strong>
          <span>{{ (audioEncoder || '').toUpperCase() || 'AUD' }}</span>
        </span>
      </template>
      <div class="performance-compact-actions" @pointerdown.stop>
        <n-button
          quaternary
          circle
          size="tiny"
          :aria-label="t('screen.performanceExpand', 'Expand performance overlay')"
          @click="compact = false"
        >
          <template #icon><Square :size="11" /></template>
        </n-button>
        <n-button
          quaternary
          circle
          size="tiny"
          :aria-label="t('screen.hidePerformance', 'Hide performance overlay')"
          @click="emit('close')"
        >
          <template #icon><X :size="13" /></template>
        </n-button>
      </div>
    </div>
    <header v-else class="display-status-titlebar" @pointerdown="startDrag">
      <GripHorizontal :size="15" class="floating-window-grip" />
      <Activity :size="15" />
      <strong>{{ t('screen.performance', 'Performance') }}</strong>
      <div class="control-popover-header-actions" @pointerdown.stop>
        <label class="performance-advanced-toggle">
          <span>{{ t('screen.performanceAudio', 'Audio') }}</span>
          <n-switch v-model:value="showAudio" size="small" />
        </label>
        <label class="performance-advanced-toggle">
          <span>{{ t('screen.performanceAdvanced', 'Advanced') }}</span>
          <n-switch v-model:value="advanced" size="small" />
        </label>
        <n-tooltip to=".console-workspace" :z-index="4000">
          <template #trigger>
            <n-button
              quaternary
              circle
              size="tiny"
              :aria-label="t('screen.performanceMinimize', 'Compact performance overlay')"
              @click="compact = true"
            >
              <template #icon><Minus /></template>
            </n-button>
          </template>
          {{ t('screen.performanceMinimize', 'Compact performance overlay') }}
        </n-tooltip>
        <n-tooltip to=".console-workspace" :z-index="4000">
          <template #trigger>
            <n-button
              quaternary
              circle
              size="tiny"
              :aria-label="t('screen.hidePerformance', 'Hide performance overlay')"
              @click="emit('close')"
            >
              <template #icon><X /></template>
            </n-button>
          </template>
          {{ t('screen.hidePerformance', 'Hide performance overlay') }}
        </n-tooltip>
      </div>
    </header>
    <div v-if="!compact" class="display-status-content">
      <DisplayStatusValues
        :canvas-width="canvasWidth"
        :canvas-height="canvasHeight"
        :video-fps="videoFps"
        :video-bitrate="videoBitrate"
        :stream-samples="samples"
        :latency-samples="latencySamples"
        :target-fps="targetFps"
        :codec="codec"
        :transport="transport"
        :input-width="inputWidth"
        :input-height="inputHeight"
        :capture-latency-us="captureLatencyUs"
        :encode-latency-us="encodeLatencyUs"
        :ice-rtt-us="iceRttUs"
        :jitter-buffer-us="jitterBufferUs"
        :decode-us="decodeUs"
        :present-us="presentUs"
        :show-latency="advanced"
        :audio-enabled="showAudioColumn"
        :audio-encoder="audioEncoder"
        :audio-quality="audioQuality"
        :audio-sample-rate="audioSampleRate"
        :audio-channels="audioChannels"
        :audio-fps="audioFps"
        :audio-bitrate="audioBitrate"
        :audio-stream-samples="audioSamples"
        :audio-latency-samples="audioLatencySamples"
        :audio-capture-latency-us="audioCaptureLatencyUs"
        :audio-encode-latency-us="audioEncodeLatencyUs"
        :audio-jitter-buffer-us="audioJitterBufferUs"
      />
    </div>
  </section>
</template>
