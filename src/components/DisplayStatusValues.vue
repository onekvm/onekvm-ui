<script setup lang="ts">
import { computed } from 'vue'

import { t } from '@/i18n/runtime'
import type { StreamSample } from '@/lib/video-stream-chart'

import VideoStreamChart from './VideoStreamChart.vue'

const props = defineProps<{
  canvasWidth: number
  canvasHeight: number
  videoFps: number
  videoBitrate: number
  streamSamples: readonly StreamSample[]
  targetFps: number
  codec: string
  transport: 'webrtc' | 'websocket' | 'mjpeg'
  inputWidth: number
  inputHeight: number
  captureLatencyUs: number
  encodeLatencyUs: number
}>()

const canvasSize = computed(() => {
  if (!props.canvasWidth || !props.canvasHeight) return '-'
  return `${props.canvasWidth} × ${props.canvasHeight}`
})

const inputSize = computed(() => {
  if (!props.inputWidth || !props.inputHeight) return '-'
  return `${props.inputWidth} × ${props.inputHeight}`
})

function formatLatencyUs(value: number) {
  if (!value || value < 0) return '-'
  if (value >= 10_000) return `${Math.round(value / 1000)} ms`
  if (value >= 1000) return `${(value / 1000).toFixed(1)} ms`
  return `${value} µs`
}

const captureLatency = computed(() => formatLatencyUs(props.captureLatencyUs))
const encodeLatency = computed(() => formatLatencyUs(props.encodeLatencyUs))

const protocol = computed(() => {
  if (props.transport === 'webrtc') return 'WebRTC'
  if (props.transport === 'websocket') return 'WebSocket'
  if (props.transport === 'mjpeg') return t('screen.protocolHttpMjpeg', 'HTTP (MJPEG only)')
  return '-'
})
</script>

<template>
  <div class="display-status-values">
    <div class="display-status-meta">
      <div>
        <span>{{ t('screen.codec', 'Codec') }}</span>
        <strong>{{ codec || '-' }}</strong>
      </div>
      <div>
        <span>{{ t('screen.protocol', 'Protocol') }}</span>
        <strong>{{ protocol }}</strong>
      </div>
    </div>
    <div class="display-status-metrics">
      <div class="display-status-metric">
        <span>{{ t('screen.inputResolution', 'Input resolution') }}</span>
        <strong>{{ inputSize }}</strong>
      </div>
      <div class="display-status-metric">
        <span>{{ t('screen.canvasSize', 'Canvas size') }}</span>
        <strong>{{ canvasSize }}</strong>
      </div>
      <div class="display-status-metric">
        <span>{{ t('screen.currentFps', 'Current FPS') }}</span>
        <strong>{{ videoFps }} FPS</strong>
      </div>
      <div class="display-status-metric">
        <span>{{ t('screen.bitrate', 'Bitrate') }}</span>
        <strong>{{ videoBitrate }} kbps</strong>
      </div>
    </div>
    <div class="display-status-metrics display-status-metrics-latency">
      <div class="display-status-metric">
        <span>{{ t('screen.captureLatency', 'Capture latency') }}</span>
        <strong>{{ captureLatency }}</strong>
      </div>
      <div class="display-status-metric">
        <span>{{ t('screen.encodeLatency', 'Encode latency') }}</span>
        <strong>{{ encodeLatency }}</strong>
      </div>
    </div>
    <div class="display-status-chart">
      <VideoStreamChart :samples="streamSamples" :target-fps="targetFps" />
    </div>
  </div>
</template>
