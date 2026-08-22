<script setup lang="ts">
import { computed, ref } from 'vue'

import { t } from '@/i18n/runtime'
import {
  LATENCY_STACK_KEYS,
  formatSampleTime,
  latencyScaleMax,
  latencyStackBands,
  latencyStackTotal,
  linePath,
  nearestSampleIndex,
  sampleX,
  type LatencySample,
  type LatencyStackKey,
} from '@/lib/video-stream-chart'

const props = defineProps<{
  samples: readonly LatencySample[]
}>()

const padLeft = 28
const padRight = 8
const padTop = 8
const padBottom = 16
const width = 252
const height = 72
const viewWidth = padLeft + width + padRight
const viewHeight = padTop + height + padBottom

const hoverIndex = ref(-1)
const tooltip = ref({ x: 0, y: 0 })

const scaleMax = computed(() => latencyScaleMax(props.samples))
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
    total: latencyStackTotal(sample),
    sample,
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

const stackLegend: { key: LatencyStackKey; label: string; fallback: string }[] = [
  { key: 'capture', label: 'screen.captureLatency', fallback: 'Capture latency' },
  { key: 'encode', label: 'screen.encodeLatency', fallback: 'Encode latency' },
  { key: 'jitter', label: 'screen.jitterBuffer', fallback: 'Jitter buffer' },
  { key: 'decode', label: 'screen.decodeLatency', fallback: 'Decode latency' },
  { key: 'present', label: 'screen.presentLatency', fallback: 'Receive to display' },
]

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
  tooltip.value = {
    x: event.clientX - box.left,
    y: event.clientY - box.top,
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
          v-for="key in LATENCY_STACK_KEYS"
          :key="key"
          v-show="bands[key]"
          class="stream-chart-area"
          :class="`latency-band-${key}`"
          :d="bands[key]"
        />
        <path v-if="iceLine" class="stream-chart-line latency-line-ice" :d="iceLine" />
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
      v-if="hover"
      class="stream-chart-tooltip"
      :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }"
    >
      <div class="stream-chart-tooltip-time">{{ hover.time }}</div>
      <div>
        <span>{{ t('screen.latencyTotal', 'Total') }}</span>
        <strong>{{ formatMs(hover.total) }}</strong>
      </div>
      <div v-for="item in stackLegend" :key="item.key">
        <span class="stream-chart-swatch" :class="`latency-swatch-${item.key}`" aria-hidden="true" />
        <span>{{ t(item.label, item.fallback) }}</span>
        <strong>{{ formatMs(hover.sample[item.key]) }}</strong>
      </div>
      <div>
        <span class="stream-chart-swatch latency-swatch-ice" aria-hidden="true" />
        <span>{{ t('screen.iceRtt', 'ICE RTT') }}</span>
        <strong>{{ formatMs(hover.sample.ice) }}</strong>
      </div>
    </div>

    <div class="stream-chart-legend">
      <span v-for="item in stackLegend" :key="item.key" class="stream-chart-key">
        <span class="stream-chart-swatch" :class="`latency-swatch-${item.key}`" aria-hidden="true" />
        {{ t(item.label, item.fallback) }}
      </span>
      <span class="stream-chart-key">
        <span class="stream-chart-swatch latency-swatch-ice" aria-hidden="true" />
        {{ t('screen.iceRtt', 'ICE RTT') }}
      </span>
    </div>
  </div>
</template>
