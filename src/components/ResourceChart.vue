<script setup lang="ts">
import { computed, ref } from 'vue'

export interface ResourceChartSeries {
  name: string
  color: string
  values: number[]
}

const props = defineProps<{
  title: string
  value: string
  series: ResourceChartSeries[]
  timestamps: number[]
  formatValue: (value: number) => string
  max?: number
  maxLabel: string
  emptyLabel: string
  nowLabel: string
}>()

const plot = { left: 10, right: 590, top: 12, bottom: 142 }
const canvas = ref<HTMLDivElement | null>(null)
const hoveredIndex = ref<number | null>(null)
const scaleMax = computed(() => {
  if (props.max && props.max > 0) return props.max
  const maximum = Math.max(0, ...props.series.flatMap((item) => item.values))
  return maximum > 0 ? maximum * 1.12 : 1
})

function points(values: number[]) {
  if (!values.length) return ''
  const width = plot.right - plot.left
  const height = plot.bottom - plot.top
  return values.map((value, index) => {
    const x = values.length === 1 ? plot.right : plot.left + width * index / (values.length - 1)
    const y = plot.bottom - height * Math.min(Math.max(value, 0), scaleMax.value) / scaleMax.value
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
}

const sampleCount = computed(() => Math.max(props.timestamps.length, ...props.series.map(({ values }) => values.length)))
const hoveredX = computed(() => {
  if (hoveredIndex.value === null || sampleCount.value < 1) return plot.right
  if (sampleCount.value === 1) return plot.right
  return plot.left + (plot.right - plot.left) * hoveredIndex.value / (sampleCount.value - 1)
})
const tooltipLeft = computed(() => `${hoveredX.value / 6}%`)

function valueY(value: number) {
  const height = plot.bottom - plot.top
  return plot.bottom - height * Math.min(Math.max(value, 0), scaleMax.value) / scaleMax.value
}

function updateHover(event: PointerEvent) {
  if (!canvas.value || sampleCount.value < 1) return
  const bounds = canvas.value.getBoundingClientRect()
  const chartX = (event.clientX - bounds.left) * 600 / bounds.width
  const ratio = Math.min(1, Math.max(0, (chartX - plot.left) / (plot.right - plot.left)))
  hoveredIndex.value = sampleCount.value === 1 ? 0 : Math.round(ratio * (sampleCount.value - 1))
}

function formatTimestamp(timestamp: number | undefined) {
  if (!timestamp) return ''
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(new Date(timestamp * 1000))
}
</script>

<template>
<section class="resource-chart-card">
  <header>
    <span>{{ title }}</span>
    <strong>{{ value }}</strong>
  </header>
  <div
    ref="canvas"
    class="resource-chart-canvas"
    @pointermove="updateHover"
    @pointerleave="hoveredIndex = null"
  >
    <svg viewBox="0 0 600 160" preserveAspectRatio="none" role="img" :aria-label="title">
      <line v-for="y in [12, 55.3, 98.7, 142]" :key="y" x1="10" x2="590" :y1="y" :y2="y" />
      <polyline
        v-for="item in series"
        :key="item.name"
        :points="points(item.values)"
        :stroke="item.color"
      />
      <template v-if="hoveredIndex !== null">
        <line class="resource-chart-hover-line" :x1="hoveredX" :x2="hoveredX" :y1="plot.top" :y2="plot.bottom" />
        <circle
          v-for="item in series"
          :key="`hover-${item.name}`"
          :cx="hoveredX"
          :cy="valueY(item.values[hoveredIndex] || 0)"
          r="3.5"
          :fill="item.color"
        />
      </template>
    </svg>
    <span class="resource-chart-axis-max">{{ maxLabel }}</span>
    <span v-if="!series.some((item) => item.values.length)" class="resource-chart-empty">{{ emptyLabel }}</span>
    <div
      v-if="hoveredIndex !== null"
      class="resource-chart-tooltip"
      :class="{ right: hoveredX > 390 }"
      :style="{ left: tooltipLeft }"
    >
      <time>{{ formatTimestamp(timestamps[hoveredIndex]) }}</time>
      <span v-for="item in series" :key="`tooltip-${item.name}`">
        <i :style="{ background: item.color }" />
        {{ item.name }}
        <strong>{{ formatValue(item.values[hoveredIndex] || 0) }}</strong>
      </span>
    </div>
  </div>
  <footer>
    <span v-for="item in series" :key="item.name"><i :style="{ background: item.color }" />{{ item.name }}</span>
    <time>-5 min</time>
    <time>{{ nowLabel }}</time>
  </footer>
</section>
</template>
