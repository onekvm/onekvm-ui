<script setup lang="ts">
import { computed, ref } from 'vue'

import { t } from '@/i18n/runtime'
import {
  areaPath,
  bitrateScaleMax,
  fpsScaleMax,
  linePath,
  nearestSampleIndex,
  sampleX,
  type StreamSample,
} from '@/lib/video-stream-chart'

const props = defineProps<{
  samples: readonly StreamSample[]
  targetFps: number
}>()

const width = 220
const height = 72
const hoverIndex = ref(-1)

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
  return height - (Math.min(fpsMax.value, props.targetFps) / fpsMax.value) * height
})
const hover = computed(() => {
  const index = hoverIndex.value
  if (index < 0 || index >= props.samples.length) return null
  const sample = props.samples[index]
  return {
    x: sampleX(index, props.samples.length, width),
    fps: sample.fps,
    bitrate: sample.bitrate,
  }
})

function setHover(event: PointerEvent) {
  const svg = event.currentTarget
  if (!(svg instanceof SVGSVGElement)) return
  const rect = svg.getBoundingClientRect()
  if (rect.width <= 0) return
  const offsetX = ((event.clientX - rect.left) / rect.width) * width
  hoverIndex.value = nearestSampleIndex(offsetX, props.samples.length, width)
}

function clearHover() {
  hoverIndex.value = -1
}

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
</script>

<template>
  <div class="stream-chart">
    <div class="stream-chart-legend">
      <span class="stream-chart-swatch stream-chart-swatch-fps" />
      <span>{{ t('screen.currentFps', 'Current FPS') }}</span>
      <span class="stream-chart-swatch stream-chart-swatch-bitrate" />
      <span>{{ t('screen.bitrate', 'Bitrate') }}</span>
      <span class="stream-chart-window">{{ t('screen.streamChartWindow', 'Last 60 seconds') }}</span>
    </div>

    <svg
      class="stream-chart-svg"
      viewBox="0 0 300 88"
      role="img"
      :aria-label="t('screen.streamChart', 'Bitrate & FPS')"
      @pointermove="setHover"
      @pointerleave="clearHover"
    >
      <g transform="translate(32,8)">
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
        <g v-if="hover">
          <line class="stream-chart-cursor" :x1="hover.x" y1="0" :x2="hover.x" :y2="height" />
        </g>
        <text class="stream-chart-axis stream-chart-axis-fps" x="-4" y="4" text-anchor="end">{{ fpsMax }}</text>
        <text class="stream-chart-axis stream-chart-axis-fps" x="-4" :y="height + 4" text-anchor="end">0</text>
        <text class="stream-chart-axis stream-chart-axis-bitrate" :x="width + 4" y="4">{{ formatAxisBitrate(bitrateMax) }}</text>
        <text class="stream-chart-axis stream-chart-axis-bitrate" :x="width + 4" :y="height + 4">0</text>
      </g>
    </svg>

    <p v-if="samples.length === 0" class="stream-chart-empty">
      {{ t('screen.streamChartEmpty', 'Waiting for samples…') }}
    </p>
    <p v-else-if="hover" class="stream-chart-readout">
      <strong>{{ hover.fps }} FPS</strong>
      <span>·</span>
      <strong>{{ formatBitrate(hover.bitrate) }}</strong>
    </p>
    <p v-else class="stream-chart-readout stream-chart-readout-hint">
      {{ t('screen.streamChartHint', 'Hover to inspect a sample') }}
    </p>
  </div>
</template>
