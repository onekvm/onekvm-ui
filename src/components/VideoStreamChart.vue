<script setup lang="ts">
import { computed } from 'vue'

import { t } from '@/i18n/runtime'
import {
  areaPath,
  bitrateScaleMax,
  fpsScaleMax,
  linePath,
  type StreamSample,
} from '@/lib/video-stream-chart'

const props = defineProps<{
  samples: readonly StreamSample[]
  targetFps: number
}>()

const width = 220
const height = 72

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
    <svg
      class="stream-chart-svg"
      viewBox="0 0 300 88"
      role="img"
      :aria-label="t('screen.streamChart', 'Bitrate & FPS')"
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
        <text class="stream-chart-axis stream-chart-axis-fps" x="-4" y="4" text-anchor="end">{{ fpsMax }}</text>
        <text class="stream-chart-axis stream-chart-axis-fps" x="-4" :y="height + 4" text-anchor="end">0</text>
        <text class="stream-chart-axis stream-chart-axis-bitrate" :x="width + 4" y="4">{{ formatAxisBitrate(bitrateMax) }}</text>
        <text class="stream-chart-axis stream-chart-axis-bitrate" :x="width + 4" :y="height + 4">0</text>
      </g>
    </svg>

    <div class="stream-chart-legend">
      <span class="stream-chart-key">
        <span class="stream-chart-swatch stream-chart-swatch-fps" aria-hidden="true" />
        {{ t('screen.currentFps', 'Current FPS') }}
      </span>
      <span class="stream-chart-key">
        <span class="stream-chart-swatch stream-chart-swatch-bitrate" aria-hidden="true" />
        {{ t('screen.bitrate', 'Bitrate') }}
      </span>
    </div>
  </div>
</template>
