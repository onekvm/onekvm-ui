<script setup lang="ts">
import type { WebRTCConnectionStats } from '@/lib/webrtc-connection-stats'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { Activity, Minus } from '@/icons'

import { t } from '@/i18n/runtime'
import { usePerformanceDock } from '@/composables/usePerformanceDock'
import { usePerformanceDockMotion } from '@/composables/usePerformanceDockMotion'
import PerformanceCompactBar from './PerformanceCompactBar.vue'
import { usePerformanceContentMotion } from '@/composables/usePerformanceContentMotion'
import { useLatencyHistory } from '@/composables/useLatencyHistory'
import { useVideoStreamHistory } from '@/composables/useVideoStreamHistory'
import {
  clampOverlayPosition,
  overlayDragHostRect,
  overlayGrabOffset,
  overlayPointerPosition,
  type OverlayPoint,
} from '@/lib/overlay-drag'
import {
  COMPACT_CHART_HEIGHT,
  COMPACT_CHART_WIDTH,
  performanceAudioVisible,
} from '@/lib/performance-compact'
import { TOOLBAR_LAUNCHER_QUERY, toolbarLauncherActive } from '@/lib/toolbar-dock'
import { compactChartPaths, sumLatencyUs } from '@/lib/video-stream-chart'

import DisplayStatusValues from './DisplayStatusValues.vue'
import ConsoleFloatingWindow from './ConsoleFloatingWindow.vue'

const props = defineProps<{
  canvasWidth: number
  canvasHeight: number
  videoFps: number
  videoBitrate: number
  bitrateLimitKbps?: number | null
  targetFps: number
  codec: string
  bitDepth?: number | null
  colorRange?: 'unknown' | 'limited' | 'full' | 'unspecified'
  transport: 'webrtc' | 'websocket' | 'mjpeg'
  webrtcConnection?: WebRTCConnectionStats | null
  inputWidth: number
  inputHeight: number
  captureLatencyUs: number
  encodeLatencyUs: number
  iceRttUs: number
  jitterBufferUs: number
  decodeUs: number
  presentUs: number
  transportUs?: number | null
  transportErrorUs?: number | null
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

const bitrateHint = computed(() => {
  if (!/^h26[45]$/i.test(props.codec) || props.bitrateLimitKbps === undefined) {
    return `${t('screen.bitrateLimit')}: —`
  }
  const configured = props.bitrateLimitKbps
  const limit = configured != null && configured > 0 ? `${configured} kbps` : t('screen.auto')
  const lines = [`${t('screen.bitrateLimit')}: ${limit}`]
  const adaptive = props.webrtcConnection?.autoBitrateKbps
  if ((configured == null || configured <= 0) && props.transport === 'webrtc' && adaptive && adaptive > 0) {
    lines.push(`${t('screen.adaptiveBitrateLimit')}: ${adaptive} kbps`)
  }
  return lines.join('\n')
})

const emit = defineEmits<{
  close: []
}>()

const ADVANCED_KEY = 'onekvm-performance-advanced'
const AUDIO_KEY = 'onekvm-performance-audio'
const COMPACT_KEY = 'onekvm-performance-compact'
const advanced = ref(localStorage.getItem(ADVANCED_KEY) === 'true')
const showAudio = ref(localStorage.getItem(AUDIO_KEY) !== 'false')
const compact = ref(localStorage.getItem(COMPACT_KEY) === 'true')
const dock = usePerformanceDock()
const dragMoved = shallowRef(false)
let dragStart = { x: 0, y: 0 }
let dragFromDock = false
const embedded = computed(() => dock.docked.value && compact.value && !!dock.target.value && !mobile.value)
const mobile = ref(toolbarLauncherActive(window.innerWidth, window.innerHeight))
const floatingBar = shallowRef<InstanceType<typeof PerformanceCompactBar> | null>(null)
const dockedBar = shallowRef<InstanceType<typeof PerformanceCompactBar> | null>(null)
const dockMotion = usePerformanceDockMotion(() => embedded.value, docked =>
  (docked ? dockedBar.value : floatingBar.value)?.element || null,
)
let launcherMedia: MediaQueryList | undefined

const { samples } = useVideoStreamHistory(() => props.videoFps, () => props.videoBitrate)
const { samples: latencySamples } = useLatencyHistory(() => ({
  packetSource: props.transport === 'webrtc' ? props.webrtcConnection?.inboundId : null,
  packetsLost: props.webrtcConnection?.packetsLost,
  capture: props.captureLatencyUs,
  encode: props.encodeLatencyUs,
  transport: props.transportUs ?? null,
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
const frame = ref<InstanceType<typeof ConsoleFloatingWindow> | null>(null)
const panel = computed(() => frame.value?.element || null)
const position = ref({ x: 24, y: 8 })
let dragOffset: OverlayPoint = { x: 0, y: 0 }
let dragging = false
let dragPointerId: number | null = null
const panelStyle = computed(() => ({
  left: `${position.value.x}px`,
  top: `${position.value.y}px`,
}))

function hostRect() {
  const parent = panel.value?.offsetParent || dock.target.value?.closest('.console-workspace')
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

const showAudioColumn = computed(() => performanceAudioVisible(Boolean(props.audioEnabled), showAudio.value))
const contentMotion = usePerformanceContentMotion({
  panel,
  content: () => ({ advanced: advanced.value, audio: showAudioColumn.value, compact: compact.value }),
  visible: () => props.visible,
  place: size => { position.value = clampOverlayPosition(position.value, size, hostRect()) },
})
const renderedContent = contentMotion.rendered

function onWindowResize() {
  contentMotion.cancel()
  clampPosition()
}
watch(mobile, onWindowResize)
const compactChart = computed(() => compactChartPaths(
  samples.value,
  props.targetFps,
  COMPACT_CHART_WIDTH,
  COMPACT_CHART_HEIGHT,
))
const videoLatencyUs = computed(() => sumLatencyUs(
  props.captureLatencyUs, props.encodeLatencyUs, props.transportUs, props.presentUs,
))
const audioLatencyUs = computed(() => sumLatencyUs(
  props.audioCaptureLatencyUs, props.audioEncodeLatencyUs, props.audioJitterBufferUs,
))

function startDrag(event: PointerEvent) {
  if (event.button !== 0 || dragging) return
  const handle = event.currentTarget
  if (!(handle instanceof HTMLElement)) return
  const element = embedded.value ? handle : panel.value
  if (!element) return
  contentMotion.cancel()
  event.preventDefault()
  event.stopPropagation()
  dragOffset = overlayGrabOffset(event.clientX, event.clientY, element.getBoundingClientRect())
  dragStart = { x: event.clientX, y: event.clientY }
  dragFromDock = embedded.value
  dragMoved.value = false
  dragging = true
  dragPointerId = event.pointerId
  // Window listeners survive moving the bar between the toolbar and window.
  // Pointer capture would be lost when its original element is unmounted.
  window.addEventListener('pointermove', drag)
  window.addEventListener('pointerup', stopDrag)
  window.addEventListener('pointercancel', stopDrag)
}

function drag(event: PointerEvent) {
  if (!dragging || event.pointerId !== dragPointerId) return
  if (!dragMoved.value && Math.hypot(event.clientX - dragStart.x, event.clientY - dragStart.y) < 5) return
  event.preventDefault()
  dragMoved.value = true
  if (dragFromDock) {
    dock.setDocked(false)
    dragFromDock = false
  }
  position.value = overlayPointerPosition(event.clientX, event.clientY, hostRect(), dragOffset)
  clampPosition()
  if (compact.value) dock.updateDrag({ x: event.clientX, y: event.clientY })
}

function stopDrag(event?: PointerEvent) {
  if (!dragging || (event && event.pointerId !== dragPointerId)) return
  if (event?.type === 'pointerup' && compact.value && dragMoved.value) {
    dock.updateDrag({ x: event.clientX, y: event.clientY })
    if (dock.preview.value) dock.setDocked(true)
  }
  dragging = false
  dragMoved.value = false
  dragPointerId = null
  dock.updateDrag(null)
  window.removeEventListener('pointermove', drag)
  window.removeEventListener('pointerup', stopDrag)
  window.removeEventListener('pointercancel', stopDrag)
}

function expand() {
  dock.setDocked(false)
  compact.value = false
  void placePanel()
}

function undock() {
  dock.setDocked(false)
  void placePanel()
}

function syncMobile() {
  mobile.value = toolbarLauncherActive(window.innerWidth, window.innerHeight)
}

onMounted(() => {
  launcherMedia = window.matchMedia(TOOLBAR_LAUNCHER_QUERY)
  launcherMedia.addEventListener('change', syncMobile)
  window.addEventListener('resize', onWindowResize)
  if (props.visible) void placePanel()
})

onBeforeUnmount(() => {
  contentMotion.cancel()
  launcherMedia?.removeEventListener('change', syncMobile)
  window.removeEventListener('resize', onWindowResize)
  stopDrag()
  dock.setVisible(false)
})

watch(() => props.visible, (visible) => {
  dock.setVisible(visible)
  contentMotion.cancel()
  if (visible) void placePanel()
  else stopDrag()
}, { immediate: true })
watch(() => [props.canvasWidth, props.canvasHeight], () => {
  if (props.visible) clampPosition()
})
watch(panel, (element, _previous, onCleanup) => {
  if (!element) return
  const observer = new ResizeObserver(() => {
    if (props.visible) clampPosition()
  })
  observer.observe(element)
  onCleanup(() => observer.disconnect())
}, { flush: 'post' })
watch(advanced, (value) => {
  localStorage.setItem(ADVANCED_KEY, String(value))
})
watch(showAudio, (value) => {
  localStorage.setItem(AUDIO_KEY, String(value))
})
watch(compact, (value) => {
  localStorage.setItem(COMPACT_KEY, String(value))
})
</script>

<template>
  <ConsoleFloatingWindow
    ref="frame"
    :title="t('screen.performance', 'Performance')"
    :show="visible && !embedded"
    :animate="!dockMotion.active.value"
    :chrome-visible="renderedContent.compact"
    :close-label="t('screen.hidePerformance', 'Hide performance overlay')"
    class="video-performance-overlay"
    :class="{
      'is-advanced': renderedContent.advanced && !renderedContent.compact,
      'has-audio': renderedContent.audio && !renderedContent.compact,
      'is-compact': renderedContent.compact,
      'is-mobile-sheet': mobile,
    }"
    :style="panelStyle"
    @close="emit('close')"
    @header-pointerdown="startDrag"
  >
    <template #chrome>
    <PerformanceCompactBar
      ref="floatingBar"
      :video-fps="videoFps"
      :video-bitrate="videoBitrate"
      :bitrate-hint="bitrateHint"
      :input-width="inputWidth"
      :input-height="inputHeight"
      :codec="codec"
      :chart="compactChart"
      :video-latency-us="videoLatencyUs"
      :audio-latency-us="audioLatencyUs"
      :audio-enabled="showAudioColumn"
      @drag="startDrag"
      @expand="expand"
      @close="emit('close')"
      @undock="undock"
    />
    </template>
    <template #title-icon><Activity :size="15" /></template>
    <template #actions>
      <n-tooltip to=".console-workspace" :z-index="4000" style="pointer-events: none">
        <template #trigger>
          <n-button quaternary circle size="tiny" :aria-label="t('screen.performanceMinimize', 'Compact performance overlay')" @click="compact = true"><template #icon><Minus /></template></n-button>
        </template>
        {{ t('screen.performanceMinimize', 'Compact performance overlay') }}
      </n-tooltip>
    </template>
    <template #header-extra>
      <div class="performance-toggle-row" @pointerdown.stop>
        <label v-if="audioEnabled" class="performance-advanced-toggle">
          <span>{{ t('screen.performanceAudio', 'Audio') }}</span>
          <n-switch v-model:value="showAudio" size="small" />
        </label>
        <label class="performance-advanced-toggle">
          <span>{{ t('screen.performanceAdvanced', 'Advanced') }}</span>
          <n-switch v-model:value="advanced" size="small" />
        </label>
      </div>
    </template>
    <div v-if="!renderedContent.compact" class="display-status-content">
      <DisplayStatusValues
        :canvas-width="canvasWidth"
        :canvas-height="canvasHeight"
        :video-fps="videoFps"
        :video-bitrate="videoBitrate"
      :bitrate-hint="bitrateHint"
        :stream-samples="samples"
        :latency-samples="latencySamples"
        :target-fps="targetFps"
        :codec="codec"
        :transport="transport"
        :webrtc-connection="webrtcConnection"
        :bit-depth="bitDepth"
        :color-range="colorRange"
        :input-width="inputWidth"
        :input-height="inputHeight"
        :capture-latency-us="captureLatencyUs"
        :encode-latency-us="encodeLatencyUs"
        :jitter-buffer-us="jitterBufferUs"
        :decode-us="decodeUs"
        :present-us="presentUs"
        :transport-us="transportUs"
        :transport-error-us="transportErrorUs"
        :show-latency="renderedContent.advanced"
        :animate-panels="false"
        :audio-enabled="renderedContent.audio"
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
  </ConsoleFloatingWindow>
  <Teleport v-if="embedded && visible && dock.target.value" :to="dock.target.value">
    <PerformanceCompactBar docked
      ref="dockedBar"
      :video-fps="videoFps"
      :video-bitrate="videoBitrate"
      :bitrate-hint="bitrateHint"
      :input-width="inputWidth"
      :input-height="inputHeight"
      :codec="codec"
      :chart="compactChart"
      :video-latency-us="videoLatencyUs"
      :audio-latency-us="audioLatencyUs"
      :audio-enabled="showAudioColumn"
      @drag="startDrag"
      @expand="expand"
      @close="emit('close')"
      @undock="undock"
    />
  </Teleport>
</template>
