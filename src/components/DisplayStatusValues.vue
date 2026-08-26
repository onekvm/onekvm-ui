<script setup lang="ts">
import { computed } from 'vue'

import { t } from '@/i18n/runtime'
import { formatLatencyUs, type LatencySample, type StreamSample } from '@/lib/video-stream-chart'

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
  transport: 'webrtc' | 'websocket' | 'mjpeg'
  inputWidth: number
  inputHeight: number
  captureLatencyUs: number
  encodeLatencyUs: number
  iceRttUs: number
  jitterBufferUs: number
  decodeUs: number
  presentUs: number
  showLatency?: boolean
}>()

const canvasSize = computed(() => {
  if (!props.canvasWidth || !props.canvasHeight) return '-'
  return `${props.canvasWidth} × ${props.canvasHeight}`
})

const inputSize = computed(() => {
  if (!props.inputWidth || !props.inputHeight) return '-'
  return `${props.inputWidth} × ${props.inputHeight}`
})

const captureLatency = computed(() => formatLatencyUs(props.captureLatencyUs))
const encodeLatency = computed(() => formatLatencyUs(props.encodeLatencyUs))
const iceRtt = computed(() => formatLatencyUs(props.iceRttUs))
const jitterBuffer = computed(() => formatLatencyUs(props.jitterBufferUs))
const decodeLatency = computed(() => formatLatencyUs(props.decodeUs))
const presentLatency = computed(() => formatLatencyUs(props.presentUs))

const protocol = computed(() => {
  if (props.transport === 'webrtc') return 'WebRTC'
  if (props.transport === 'websocket') return 'WebSocket'
  if (props.transport === 'mjpeg') return t('screen.protocolHttpMjpeg', 'HTTP (MJPEG only)')
  return '-'
})
</script>

<template>
  <div class="display-status-values">
    <section class="display-status-column">
      <h2>{{ t('screen.streamColumn', 'Stream') }}</h2>
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
      <div class="display-status-meta">
        <div>
          <span>{{ t('screen.inputResolution', 'Input resolution') }}</span>
          <strong>{{ inputSize }}</strong>
        </div>
        <div>
          <span>{{ t('screen.canvasSize', 'Canvas size') }}</span>
          <strong>{{ canvasSize }}</strong>
        </div>
      </div>
      <div class="display-status-meta">
        <div>
          <span>{{ t('screen.currentFps', 'Current FPS') }}</span>
          <strong>{{ videoFps }} FPS</strong>
        </div>
        <div>
          <span>{{ t('screen.bitrate', 'Bitrate') }}</span>
          <strong>{{ videoBitrate }} kbps</strong>
        </div>
      </div>
      <div class="display-status-chart">
        <VideoStreamChart :samples="streamSamples" :target-fps="targetFps" />
      </div>
    </section>

    <section v-if="showLatency" class="display-status-column">
      <h2>{{ t('screen.latencyColumn', 'Latency') }}</h2>
      <div class="display-status-meta">
        <div>
          <span>{{ t('screen.captureLatency', 'Capture latency') }}</span>
          <strong>{{ captureLatency }}</strong>
        </div>
        <div>
          <span>{{ t('screen.encodeLatency', 'Encode latency') }}</span>
          <strong>{{ encodeLatency }}</strong>
        </div>
      </div>
      <div class="display-status-meta">
        <div>
          <span>{{ t('screen.iceRtt', 'ICE RTT') }}</span>
          <strong>{{ iceRtt }}</strong>
        </div>
        <div>
          <span>{{ t('screen.jitterBuffer', 'Jitter buffer') }}</span>
          <strong>{{ jitterBuffer }}</strong>
        </div>
      </div>
      <div class="display-status-meta">
        <div>
          <span>{{ t('screen.decodeLatency', 'Decode latency') }}</span>
          <strong>{{ decodeLatency }}</strong>
        </div>
        <div>
          <span>{{ t('screen.presentLatency', 'Receive to display') }}</span>
          <strong>{{ presentLatency }}</strong>
        </div>
      </div>
      <div class="display-status-chart">
        <VideoLatencyChart :samples="latencySamples" />
      </div>
    </section>
  </div>
</template>
