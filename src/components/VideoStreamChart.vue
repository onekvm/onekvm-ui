<script setup lang="ts">
import { computed, ref } from 'vue'

import { t } from '@/i18n/runtime'
import {
  areaPath,
  bitrateScaleMax,
  formatSampleTime,
  fpsScaleMax,
  linePath,
  nearestSampleIndex,
  sampleX,
  type StreamSample,
} from '@/lib/video-stream-chart'

const props = defineProps<{
  samples: readonly StreamSample[]
  targetFps: number
  kind?: 'video' | 'audio'
}>()

const isAudio = computed(() => props.kind === 'audio')
const chartLabel = computed(() => isAudio.value
  ? t('screen.streamChartAudio', 'Bitrate & packet rate')
  : t('screen.streamChart', 'Bitrate & FPS'))
const rateLabel = computed(() => isAudio.value
  ? t('screen.audioPacketRate', 'Packet rate')
  : t('screen.currentFps', 'Current FPS'))
const rateValue = (fps: number) => isAudio.value ? `${fps} /s` : `${fps} FPS`

const padLeft = 22
const padRight = 26
const padTop = 8
const padBottom = 16
const width = 252
const height = 72
const viewWidth = padLeft + width + padRight
const viewHeight = padTop + height + padBottom

const hoverIndex = ref(-1)
const tooltip = ref({ x: 0, y: 0 })

const fpsValues = computed(() => props.samples.map((sample) => sample.fps))
const bitrateValues = computed(() => props.samples.map((sample) => sample.bitrate))
const fpsMax = computed(() => fpsScaleMax(fpsValues.value, props.targetFps))
const bitrateMax = computed(() => bitrateScaleMax(bitrateValues.value))
const fpsLine = computed(() => linePath(fpsValues.value, fpsMax.value, width, height))
const bitrateLine = computed(() => linePath(bitrateValues.value, bitrateMax.value, width, height))
const fpsArea = computed(() => areaPath(fpsValues.value, fpsMax.value, width, height))
const bitrateArea = computed(() => areaPath(bitrateValues.value, bitrateMax.value, width, height))
const targetY = computed(() => {
  if (props.targetFps <= 0 || fpsMax.value <= 0) return null
  const y = height - (Math.min(fpsMax.value, props.targetFps) / fpsMax.value) * height
  if (y <= 0) return null
  return y
})
const hover = computed(() => {
  const index = hoverIndex.value
  if (index < 0 || index >= props.samples.length) return null
  const sample = props.samples[index]
  return {
    x: sampleX(index, props.samples.length, width),
    time: formatSampleTime(sample.t),
    fps: sample.fps,
    bitrate: sample.bitrate,
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

function formatBitrate(value: number) {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)} Mbps`
  return `${Math.round(value)} kbps`
}

function formatAxisBitrate(value: number) {
  if (value >= 1000) return `${trimTrailingZero(value / 1000)}M`
  return `${Math.round(value)}`
}

function trimTrailingZero(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

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
  <div class="stream-chart">
    <svg
      class="stream-chart-svg"
      :viewBox="`0 0 ${viewWidth} ${viewHeight}`"
      role="img"
      :aria-label="chartLabel"
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
        <line
          v-if="targetY !== null"
          class="stream-chart-target"
          x1="0"
          :y1="targetY"
          :x2="width"
          :y2="targetY"
        />
        <path v-if="bitrateArea" class="stream-chart-area stream-chart-area-bitrate" :d="bitrateArea" />
        <path v-if="fpsArea" class="stream-chart-area stream-chart-area-fps" :d="fpsArea" />
        <path v-if="bitrateLine" class="stream-chart-line stream-chart-line-bitrate" :d="bitrateLine" />
        <path v-if="fpsLine" class="stream-chart-line stream-chart-line-fps" :d="fpsLine" />
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
        <text class="stream-chart-axis stream-chart-axis-fps" x="-4" y="4" text-anchor="end">{{ fpsMax }}</text>
        <text class="stream-chart-axis stream-chart-axis-fps" x="-4" :y="height + 4" text-anchor="end">0</text>
        <text class="stream-chart-axis stream-chart-axis-bitrate" :x="width + 4" y="4">{{ formatAxisBitrate(bitrateMax) }}</text>
        <text class="stream-chart-axis stream-chart-axis-bitrate" :x="width + 4" :y="height + 4">0</text>
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
        <span class="stream-chart-swatch stream-chart-swatch-fps" aria-hidden="true" />
        <span>{{ rateLabel }}</span>
        <strong>{{ rateValue(hover.fps) }}</strong>
      </div>
      <div>
        <span class="stream-chart-swatch stream-chart-swatch-bitrate" aria-hidden="true" />
        <span>{{ t('screen.bitrate', 'Bitrate') }}</span>
        <strong>{{ formatBitrate(hover.bitrate) }}</strong>
      </div>
    </div>

    <div class="stream-chart-legend">
      <span class="stream-chart-key">
        <span class="stream-chart-swatch stream-chart-swatch-fps" aria-hidden="true" />
        {{ rateLabel }}
      </span>
      <span class="stream-chart-key">
        <span class="stream-chart-swatch stream-chart-swatch-bitrate" aria-hidden="true" />
        {{ t('screen.bitrate', 'Bitrate') }}
      </span>
    </div>
  </div>
</template>
