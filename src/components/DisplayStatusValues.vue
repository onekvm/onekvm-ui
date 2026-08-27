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
  audioEnabled?: boolean
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
const knownLatencyTotal = computed(() => formatLatencyUs(
  Math.max(0, props.captureLatencyUs)
  + Math.max(0, props.encodeLatencyUs)
  + Math.max(0, props.presentUs),
))

const protocol = computed(() => {
  if (props.transport === 'webrtc') return 'WebRTC'
  if (props.transport === 'websocket') return 'WebSocket'
  if (props.transport === 'mjpeg') return t('screen.protocolHttpMjpeg', 'HTTP (MJPEG only)')
  return '-'
})

const audioEncoder = computed(() => (props.audioEncoder || '').toUpperCase() || '-')
const audioQuality = computed(() => {
  switch (props.audioQuality) {
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
const audioLatencyTotal = computed(() => formatLatencyUs(
  Math.max(0, props.audioCaptureLatencyUs || 0)
  + Math.max(0, props.audioEncodeLatencyUs || 0),
))
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
          <span>{{ t('screen.latencyTotal', 'Total measured latency') }}</span>
          <strong>{{ knownLatencyTotal }}</strong>
        </div>
      </div>
      <div class="display-status-chart">
        <VideoLatencyChart :samples="latencySamples" />
      </div>
    </section>

    <section v-if="audioEnabled" class="display-status-column">
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
          <span>{{ t('screen.audioPacketRate', 'Packet rate') }}</span>
          <strong>{{ audioFps || 0 }} /s</strong>
        </div>
        <div>
          <span>{{ t('screen.bitrate', 'Bitrate') }}</span>
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

    <section v-if="showLatency && audioEnabled" class="display-status-column">
      <h2>{{ t('screen.audioLatencyColumn', 'Audio latency') }}</h2>
      <div class="display-status-meta">
        <div>
          <span>{{ t('screen.captureLatency', 'Capture latency') }}</span>
          <strong>{{ audioCaptureLatency }}</strong>
        </div>
        <div>
          <span>{{ t('screen.encodeLatency', 'Encode latency') }}</span>
          <strong>{{ audioEncodeLatency }}</strong>
        </div>
      </div>
      <div class="display-status-meta">
        <div>
          <span>{{ t('screen.audioJitterBuffer', 'Audio jitter buffer') }}</span>
          <strong>{{ audioJitterBuffer }}</strong>
        </div>
        <div>
          <span>{{ t('screen.latencyTotal', 'Total measured latency') }}</span>
          <strong>{{ audioLatencyTotal }}</strong>
        </div>
      </div>
      <div class="display-status-chart">
        <VideoLatencyChart :samples="audioLatencySamples || []" />
      </div>
    </section>
  </div>
</template>
