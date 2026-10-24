<script setup lang="ts">
import { computed, ref } from 'vue'

import { t } from '@/i18n/runtime'
import {
  formatSampleTime,
  latencyScaleMax,
  latencyStackBands,
  latencyStackParts,
  latencyKnownTotal,
  linePath,
  nearestSampleIndex,
  sampleX,
  packetLossBands,
  type LatencySample,
  type LatencyStackKey,
} from '@/lib/video-stream-chart'

const props = withDefaults(defineProps<{
  samples: readonly LatencySample[]
  kind?: 'video' | 'audio'
}>(), { kind: 'video' })

const padLeft = 28
const padRight = 8
const padTop = 8
const padBottom = 16
const width = 252
const height = 72
const viewWidth = padLeft + width + padRight
const viewHeight = padTop + height + padBottom

const hoverIndex = ref(-1)
const tooltip = ref({ x: 0, y: 0, align: 'center' as 'left' | 'center' | 'right' })

const scaleMax = computed(() => latencyScaleMax(props.samples))
const hasPacketLossStats = computed(() => props.samples.some(sample => sample.packetsLost != null))
const lossBands = computed(() => packetLossBands(props.samples, width))
const bands = computed(() => latencyStackBands(props.samples, scaleMax.value, width, height))
const iceLine = computed(() => linePath(
  props.samples.map((sample) => sample.ice),
  scaleMax.value,
  width,
  height,
))
const hover = computed(() => {
  const index = hoverIndex.value
  if (index < 0 || index >= props.samples.length) return null
  const sample = props.samples[index]
  return {
    x: sampleX(index, props.samples.length, width),
    time: formatSampleTime(sample.t),
    total: latencyKnownTotal(sample),
    parts: latencyStackParts(sample),
    ice: sample.ice,
    transport: sample.transport,
    packetsLost: sample.packetsLost,
  }
})

const timeTicks = computed(() => {
  const samples = props.samples
  if (samples.length === 0) return []
  const last = samples.length - 1
  const marks = last === 0 ? [0] : last < 4 ? [0, last] : [0, Math.round(last / 2), last]
  return marks.map((index, order) => ({
    x: sampleX(index, samples.length, width),
    label: formatSampleTime(samples[index].t),
    anchor: order === 0 ? 'start' : order === marks.length - 1 ? 'end' : 'middle',
  }))
})

function formatMs(value: number) {
  if (value >= 10) return `${Math.round(value)} ms`
  if (value > 0) return `${value.toFixed(1)} ms`
  return '0 ms'
}

function formatAxis(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

const allStackLegend: { key: LatencyStackKey; label: string; fallback: string }[] = [
  { key: 'capture', label: 'screen.captureLatency', fallback: 'Capture latency' },
  { key: 'encode', label: 'screen.encodeLatency', fallback: 'Encode latency' },
  { key: 'transport', label: 'screen.transportLatency', fallback: 'Encode to receive' },
  { key: 'jitter', label: 'screen.jitterBuffer', fallback: 'Jitter buffer' },
  { key: 'decode', label: 'screen.decodeLatency', fallback: 'Decode latency' },
  { key: 'present', label: 'screen.presentLatency', fallback: 'Display overhead' },
]

const stackLegend = computed(() => allStackLegend.filter(item => props.kind === 'video' || ['capture', 'encode', 'jitter'].includes(item.key)))

function setHover(event: PointerEvent) {
  if (props.samples.length === 0) return
  const target = event.currentTarget
  if (!(target instanceof SVGGraphicsElement)) return
  const rect = target.getBoundingClientRect()
  if (rect.width <= 0) return
  const plotX = ((event.clientX - rect.left) / rect.width) * width
  hoverIndex.value = nearestSampleIndex(plotX, props.samples.length, width)
  const chart = target.closest('.stream-chart')
  if (!(chart instanceof HTMLElement)) return
  const box = chart.getBoundingClientRect()
  const x = event.clientX - box.left
  const y = event.clientY - box.top
  tooltip.value = {
    x: Math.min(Math.max(x, 8), Math.max(8, box.width - 8)),
    y: Math.max(y, 24),
    align: x > box.width * 0.55 ? 'right' : x < box.width * 0.45 ? 'left' : 'center',
  }
}

function clearHover() {
  hoverIndex.value = -1
}
</script>

<template>
  <div class="stream-chart latency-chart">
    <svg
      class="stream-chart-svg"
      :viewBox="`0 0 ${viewWidth} ${viewHeight}`"
      role="img"
      :aria-label="t('screen.latencyChart', 'Latency')"
    >
      <g :transform="`translate(${padLeft},${padTop})`">
        <rect
          v-for="(band, index) in lossBands"
          :key="index"
          class="latency-packet-loss-background"
          :x="band.x"
          y="0"
          :width="band.width"
          :height="height"
        />
        <line
          v-for="tick in 3"
          :key="tick"
          class="stream-chart-grid"
          x1="0"
          :y1="(height / 2) * (tick - 1)"
          :x2="width"
          :y2="(height / 2) * (tick - 1)"
        />
        <path
          v-for="item in stackLegend"
          :key="item.key"
          v-show="bands[item.key]"
          class="stream-chart-area"
          :class="`latency-band-${item.key}`"
          :d="bands[item.key]"
        />
        <path v-if="kind === 'video' && iceLine" class="stream-chart-line latency-line-ice" :d="iceLine" />
        <line
          v-if="hover"
          class="stream-chart-cursor"
          :x1="hover.x"
          y1="0"
          :x2="hover.x"
          :y2="height"
        />
        <rect
          class="stream-chart-hit"
          x="0"
          y="0"
          :width="width"
          :height="height"
          @pointermove="setHover"
          @pointerleave="clearHover"
        />
        <text class="stream-chart-axis latency-axis" x="-4" y="4" text-anchor="end">{{ formatAxis(scaleMax) }}</text>
        <text class="stream-chart-axis latency-axis" x="-4" :y="height + 4" text-anchor="end">0</text>
        <text
          v-for="tick in timeTicks"
          :key="`${tick.x}-${tick.label}`"
          class="stream-chart-axis stream-chart-axis-time"
          :x="tick.x"
          :y="height + 13"
          :text-anchor="tick.anchor"
        >{{ tick.label }}</text>
      </g>
    </svg>

    <div
      v-if="hasPacketLossStats"
      class="latency-loss-legend"
      :title="t('screen.packetLossBackground', 'Red background marks intervals with packet loss')"
    >
      <span class="latency-loss-key" aria-hidden="true" />
      {{ t('screen.packetLoss', 'Packet loss') }}
    </div>
    <div
      v-if="hover"
      class="stream-chart-tooltip"
      :data-align="tooltip.align"
      :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }"
    >
      <div class="stream-chart-tooltip-time">{{ hover.time }}</div>
      <div>
        <span>{{ t('screen.latencyTotal', 'Total') }}</span>
        <strong>{{ formatMs(hover.total) }}</strong>
      </div>
      <div v-for="item in stackLegend" :key="item.key">
        <span class="stream-chart-swatch" :class="`latency-swatch-${item.key}`" aria-hidden="true" />
        <span>{{ item.key === 'jitter' && kind === 'audio' ? t('screen.audioJitterBuffer', 'Audio jitter buffer') : t(item.label, item.fallback) }}</span>
        <strong>{{ item.key === 'transport' && hover.transport == null ? '-' : formatMs(hover.parts[item.key]) }}</strong>
      </div>
      <div v-if="hover.packetsLost != null">
        <span class="stream-chart-swatch latency-swatch-loss" aria-hidden="true" />
        <span>{{ t('screen.packetLoss', 'Packet loss') }}</span>
        <strong>{{ hover.packetsLost }}</strong>
      </div>
      <div v-if="kind === 'video'">
        <span class="stream-chart-swatch latency-swatch-ice" aria-hidden="true" />
        <span>{{ t('screen.iceRtt', 'ICE RTT') }}</span>
        <strong>{{ formatMs(hover.ice) }}</strong>
      </div>
    </div>

  </div>
</template>
