<script setup lang="ts">
import type { WebRTCConnectionStats } from '@/lib/webrtc-connection-stats'
import { computed } from 'vue'

import { t } from '@/i18n/runtime'
import { formatCanvasScale, formatCanvasSize } from '@/lib/video-fit'
import { formatLatencyUs, latencyStackParts, sumLatencyUs, type LatencySample, type StreamSample } from '@/lib/video-stream-chart'

import WebRTCConnectionDetails from './WebRTCConnectionDetails.vue'
import PerformanceLatencyMetric from './PerformanceLatencyMetric.vue'
import VideoLatencyChart from './VideoLatencyChart.vue'
import VideoStreamChart from './VideoStreamChart.vue'

const props = defineProps<{
  canvasWidth: number
  canvasHeight: number
  videoFps: number
  videoBitrate: number
  streamSamples: readonly StreamSample[]
  latencySamples: readonly LatencySample[]
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
  jitterBufferUs: number
  decodeUs: number
  presentUs: number
  transportUs?: number | null
  transportErrorUs?: number | null
  showLatency?: boolean
  audioEnabled?: boolean
  animatePanels?: boolean
  audioEncoder?: string
  audioQuality?: string
  audioSampleRate?: number
  audioChannels?: number
  audioFps?: number
  audioBitrate?: number
  audioStreamSamples?: readonly StreamSample[]
  audioLatencySamples?: readonly LatencySample[]
  audioCaptureLatencyUs?: number
  audioEncodeLatencyUs?: number
  audioJitterBufferUs?: number
}>()

const canvasSize = computed(() => formatCanvasSize(props.canvasWidth, props.canvasHeight))
const canvasScale = computed(() => formatCanvasScale(
  props.canvasWidth,
  props.canvasHeight,
  props.inputWidth,
  props.inputHeight,
))

const inputSize = computed(() => {
  if (!props.inputWidth || !props.inputHeight) return '-'
  return `${props.inputWidth} × ${props.inputHeight}`
})

const bitDepth = computed(() => props.bitDepth ? `${props.bitDepth} bit` : t('screen.videoFormatUnknown'))
const colorRange = computed(() => {
  if (props.colorRange === 'full') return t('screen.colorRangeFull')
  if (props.colorRange === 'limited') return t('screen.colorRangeLimited')
  if (props.colorRange === 'unspecified') return t('screen.colorRangeUnspecified')
  return t('screen.videoFormatUnknown')
})

const captureLatency = computed(() => formatLatencyUs(props.captureLatencyUs))
const encodeLatency = computed(() => formatLatencyUs(props.encodeLatencyUs))
const jitterBuffer = computed(() => formatLatencyUs(props.jitterBufferUs))
const transportLatency = computed(() => props.transportUs == null ? '-' : props.transportUs === 0 ? '0 µs' : formatLatencyUs(props.transportUs))
const transportHint = computed(() => t('screen.transportLatencyHint')
  + (props.transportErrorUs == null ? '' : ` ±${props.transportErrorUs === 0 ? '0 µs' : formatLatencyUs(props.transportErrorUs)}`))
const decodeLatency = computed(() => formatLatencyUs(props.decodeUs))
const displayOverhead = computed(() => {
  if (props.presentUs <= 0) return '-'
  const us = Math.round(latencyStackParts({
    t: 0, capture: 0, encode: 0, ice: 0,
    jitter: props.jitterBufferUs, decode: props.decodeUs, present: props.presentUs,
  }).present)
  return us === 0 ? '0 µs' : formatLatencyUs(us)
})
const knownLatencyTotal = computed(() => formatLatencyUs(sumLatencyUs(
  props.captureLatencyUs, props.encodeLatencyUs, props.transportUs, props.presentUs,
)))
const latencyTotalHint = computed(() => t('screen.latencyTotalHint'))

const protocol = computed(() => {
  if (props.transport === 'webrtc') return 'WebRTC'
  if (props.transport === 'websocket') return 'WebSocket'
  if (props.transport === 'mjpeg') return t('screen.protocolHttpMjpeg', 'HTTP (MJPEG only)')
  return '-'
})

const audioEncoder = computed(() => (props.audioEncoder || '').toUpperCase() || '-')
const audioQuality = computed(() => {
  switch (props.audioQuality) {
    case 'pcm':
      return t('screen.qualityPCM', 'Original (PCM)')
    case 'low':
      return t('screen.qualityLow', 'Low')
    case 'high':
      return t('screen.qualityHigh', 'High')
    case 'medium':
      return t('screen.qualityMedium', 'Medium')
    default:
      return '-'
  }
})
const audioSampleRate = computed(() => {
  const rate = props.audioSampleRate || 0
  if (rate <= 0) return '-'
  return `${rate / 1000} kHz`
})
const audioChannels = computed(() => {
  if (props.audioChannels === 1) return t('screen.audioMono', 'Mono')
  if (props.audioChannels === 2) return t('screen.audioStereo', 'Stereo')
  return '-'
})
const audioCaptureLatency = computed(() => formatLatencyUs(props.audioCaptureLatencyUs || 0))
const audioEncodeLatency = computed(() => formatLatencyUs(props.audioEncodeLatencyUs || 0))
const audioJitterBuffer = computed(() => formatLatencyUs(props.audioJitterBufferUs || 0))
const audioLatencyTotal = computed(() => formatLatencyUs(sumLatencyUs(
  props.audioCaptureLatencyUs, props.audioEncodeLatencyUs, props.audioJitterBufferUs,
)))
</script>

<template>
  <TransitionGroup :name="animatePanels === false ? 'performance-panel-static' : 'performance-panel'" :css="animatePanels !== false" tag="div" class="display-status-values">
    <section key="stream" class="display-status-column" data-performance-panel="stream">
      <h2>
        <span>{{ t('screen.streamColumn', 'Stream') }}</span>
        <span class="display-status-format">
          <n-tag class="display-status-format-badge" size="small" round :bordered="false" :title="`${t('screen.bitDepth')}: ${t('screen.bitDepthHint')}`">
            <span class="display-status-format-label">{{ t('screen.bitDepth') }}</span>
            <span class="display-status-format-value">{{ bitDepth }}</span>
          </n-tag>
          <n-tag class="display-status-format-badge" size="small" round :bordered="false" :title="`${t('screen.colorRange')}: ${t('screen.colorRangeHint')}`">
            <span class="display-status-format-label">{{ t('screen.colorRange') }}</span>
            <span class="display-status-format-value">{{ colorRange }}</span>
          </n-tag>
        </span>
      </h2>
      <div class="display-status-meta">
        <div>
          <span>{{ t('screen.codec', 'Codec') }}</span>
          <strong>{{ codec || '-' }}</strong>
        </div>
        <div>
          <span>{{ t('screen.protocol', 'Protocol') }}</span>
          <WebRTCConnectionDetails v-if="transport === 'webrtc'" :stats="webrtcConnection" />
          <strong v-else>{{ protocol }}</strong>
        </div>
      </div>
      <div class="display-status-meta">
        <div>
          <span>{{ t('screen.inputResolution', 'Input res.') }}</span>
          <strong>{{ inputSize }}</strong>
        </div>
        <div :title="canvasScale">
          <span>{{ t('screen.canvasSize', 'Canvas size') }}</span>
          <strong>{{ canvasSize }}</strong>
        </div>
      </div>
      <div class="display-status-meta">
        <div>
          <span class="performance-metric-label"><span class="stream-chart-swatch stream-chart-swatch-fps" aria-hidden="true" />{{ t('screen.currentFps', 'Current FPS') }}</span>
          <strong>{{ videoFps }} FPS</strong>
        </div>
        <div>
          <span class="performance-metric-label"><span class="stream-chart-swatch stream-chart-swatch-bitrate" aria-hidden="true" />{{ t('screen.bitrate', 'Bitrate') }}</span>
          <strong>{{ videoBitrate }} kbps</strong>
        </div>
      </div>
      <div class="display-status-chart">
        <VideoStreamChart :samples="streamSamples" :target-fps="targetFps" />
      </div>
    </section>

    <section v-if="showLatency" key="latency" class="display-status-column" data-performance-panel="latency">
      <h2>
        <span>{{ t('screen.latencyColumn', 'Latency') }}</span>
        <PerformanceLatencyMetric variant="total" :label="t('screen.videoLatency', 'Video latency')" :value="knownLatencyTotal" :hint="latencyTotalHint" />
      </h2>
      <div class="display-status-meta">
        <PerformanceLatencyMetric swatch="capture" :label="t('screen.captureLatency', 'Capture latency')" :value="captureLatency" :hint="t('screen.captureLatencyHint')" />
        <PerformanceLatencyMetric swatch="encode" :label="t('screen.encodeLatency', 'Encode latency')" :value="encodeLatency" :hint="t('screen.encodeLatencyHint')" />
      </div>
      <div class="display-status-meta">
        <PerformanceLatencyMetric swatch="transport" :label="t('screen.transportLatency', 'Encode to receive')" :value="transportLatency" :hint="transportHint" />
        <PerformanceLatencyMetric swatch="jitter" :label="t('screen.jitterBuffer', 'Jitter buffer')" :value="jitterBuffer" :hint="t('screen.jitterBufferHint')" />
      </div>
      <div class="display-status-meta">
        <PerformanceLatencyMetric swatch="decode" :label="t('screen.decodeLatency', 'Decode latency')" :value="decodeLatency" :hint="t('screen.decodeLatencyHint')" />
        <PerformanceLatencyMetric swatch="present" :label="t('screen.presentLatency', 'Display overhead')" :value="displayOverhead" :hint="t('screen.presentLatencyHint')" />
      </div>
      <div class="display-status-chart">
        <VideoLatencyChart :samples="latencySamples" />
      </div>
    </section>

    <section v-if="audioEnabled" key="audio" class="display-status-column" data-performance-panel="audio">
      <h2>{{ t('screen.audioColumn', 'Audio') }}</h2>
      <div class="display-status-meta">
        <div>
          <span>{{ t('screen.codec', 'Codec') }}</span>
          <strong>{{ audioEncoder }}</strong>
        </div>
        <div>
          <span>{{ t('screen.audioQuality', 'Audio quality') }}</span>
          <strong>{{ audioQuality }}</strong>
        </div>
      </div>
      <div class="display-status-meta">
        <div>
          <span>{{ t('screen.audioSampleRate', 'Sample rate') }}</span>
          <strong>{{ audioSampleRate }}</strong>
        </div>
        <div>
          <span>{{ t('screen.audioChannels', 'Channels') }}</span>
          <strong>{{ audioChannels }}</strong>
        </div>
      </div>
      <div class="display-status-meta">
        <div>
          <span class="performance-metric-label"><span class="stream-chart-swatch stream-chart-swatch-fps" aria-hidden="true" />{{ t('screen.audioPacketRate', 'Packet rate') }}</span>
          <strong>{{ audioFps || 0 }} /s</strong>
        </div>
        <div>
          <span class="performance-metric-label"><span class="stream-chart-swatch stream-chart-swatch-bitrate" aria-hidden="true" />{{ t('screen.bitrate', 'Bitrate') }}</span>
          <strong>{{ audioBitrate || 0 }} kbps</strong>
        </div>
      </div>
      <div class="display-status-chart">
        <VideoStreamChart
          :samples="audioStreamSamples || []"
          :target-fps="50"
          kind="audio"
        />
      </div>
    </section>

    <section v-if="showLatency && audioEnabled" key="audio-latency" class="display-status-column" data-performance-panel="audio-latency">
      <h2>
        <span>{{ t('screen.audioLatencyColumn', 'Audio latency') }}</span>
        <PerformanceLatencyMetric variant="total" :label="t('screen.audioLatencyColumn', 'Audio latency')" :value="audioLatencyTotal" :hint="t('screen.audioLatencyTotalHint')" />
      </h2>
      <div class="display-status-meta">
        <PerformanceLatencyMetric swatch="capture" :label="t('screen.captureLatency', 'Capture latency')" :value="audioCaptureLatency" :hint="t('screen.audioCaptureLatencyHint')" />
        <PerformanceLatencyMetric swatch="encode" :label="t('screen.encodeLatency', 'Encode latency')" :value="audioEncodeLatency" :hint="t('screen.audioEncodeLatencyHint')" />
      </div>
      <div class="display-status-meta">
        <PerformanceLatencyMetric swatch="jitter" :label="t('screen.audioJitterBuffer', 'Audio jitter buffer')" :value="audioJitterBuffer" :hint="t('screen.audioJitterBufferHint')" />
      </div>
      <div class="display-status-chart">
        <VideoLatencyChart :samples="audioLatencySamples || []" kind="audio" />
      </div>
    </section>
  </TransitionGroup>
</template>

<style scoped>
.display-status-values { position: relative; }

.display-status-format {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  padding-left: 12px;
  color: var(--muted-foreground);
  font-size: 11px;
  font-weight: 400;
  font-variant-numeric: tabular-nums;
  letter-spacing: normal;
  text-transform: none;
  white-space: nowrap;
}

.display-status-format-badge { font-size: 10px; cursor: help; }
.display-status-format-label { margin-right: 4px; color: var(--muted-foreground); }
.display-status-format-value { color: var(--foreground); font-weight: 500; }

.performance-panel-enter-active,
.performance-panel-leave-active,
.performance-panel-move {
  transition:
    opacity var(--win11-enter) var(--win11-ease-out),
    transform var(--win11-enter) var(--win11-ease-out);
}

.performance-panel-leave-active {
  position: absolute;
  pointer-events: none;
}

.performance-panel-enter-from {
  opacity: 0;
  transform: translateY(8px) scale(.98);
}

.performance-panel-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(.98);
}

@media (prefers-reduced-motion: reduce) {
  .performance-panel-enter-active,
  .performance-panel-leave-active,
  .performance-panel-move { transition: none; }
}
</style>
