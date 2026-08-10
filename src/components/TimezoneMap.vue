<script setup lang="ts">
import { computed, ref } from 'vue'
import { RotateCcw, ZoomIn, ZoomOut } from '@lucide/vue'
import { geoEquirectangular, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import landTopologyData from 'world-atlas/land-110m.json'

import { t } from '@/i18n/runtime'
import { timezoneLocations } from '@/lib/timezones'

type TimezoneMarker = {
  timezone: string
  x: number
  y: number
}

const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [timezone: string]
}>()

const mapWidth = 1000
const mapHeight = 500
const minimumZoom = 1
const maximumZoom = 8
const projection = geoEquirectangular()
  .translate([mapWidth / 2, mapHeight / 2])
  .scale(mapWidth / (2 * Math.PI))
  .precision(0.1)
const landTopology = landTopologyData as unknown as Topology<{ land: GeometryCollection }>
const landPath = geoPath(projection)(feature(landTopology, landTopology.objects.land)) || ''

const svg = ref<SVGSVGElement | null>(null)
const hoveredTimezone = ref('')
const zoom = ref(1)
const translateX = ref(0)
const translateY = ref(0)
const drag = ref<{ pointerId: number; x: number; y: number; moved: boolean } | null>(null)
const gridLongitudes = Array.from({ length: 11 }, (_, index) => (index + 1) * mapWidth / 12)
const gridLatitudes = Array.from({ length: 5 }, (_, index) => (index + 1) * mapHeight / 6)
const markers: TimezoneMarker[] = timezoneLocations.flatMap(({ timezone, latitude, longitude }) => {
  const point = projection([longitude, latitude])
  return point ? [{ timezone, x: point[0], y: point[1] }] : []
})
const activeLabel = computed(() => hoveredTimezone.value || props.modelValue)
const mapTransform = computed(() => `translate(${translateX.value} ${translateY.value}) scale(${zoom.value})`)

function clampTranslation(value: number, extent: number) {
  return Math.min(0, Math.max(extent - extent * zoom.value, value))
}

function setZoom(value: number, anchorX = mapWidth / 2, anchorY = mapHeight / 2) {
  const previousZoom = zoom.value
  const nextZoom = Math.min(maximumZoom, Math.max(minimumZoom, value))
  if (nextZoom === previousZoom) return
  const worldX = (anchorX - translateX.value) / previousZoom
  const worldY = (anchorY - translateY.value) / previousZoom
  zoom.value = nextZoom
  translateX.value = clampTranslation(anchorX - worldX * nextZoom, mapWidth)
  translateY.value = clampTranslation(anchorY - worldY * nextZoom, mapHeight)
}

function resetView() {
  zoom.value = 1
  translateX.value = 0
  translateY.value = 0
}

function pointerPosition(event: WheelEvent) {
  const bounds = svg.value?.getBoundingClientRect()
  if (!bounds) return [mapWidth / 2, mapHeight / 2] as const
  return [
    (event.clientX - bounds.left) * mapWidth / bounds.width,
    (event.clientY - bounds.top) * mapHeight / bounds.height,
  ] as const
}

function onWheel(event: WheelEvent) {
  const [x, y] = pointerPosition(event)
  setZoom(zoom.value * (event.deltaY < 0 ? 1.28 : 1 / 1.28), x, y)
}

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0 || event.target instanceof SVGCircleElement) return
  svg.value?.setPointerCapture(event.pointerId)
  drag.value = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false }
}

function onPointerMove(event: PointerEvent) {
  if (!drag.value || drag.value.pointerId !== event.pointerId || !svg.value) return
  const bounds = svg.value.getBoundingClientRect()
  const dx = (event.clientX - drag.value.x) * mapWidth / bounds.width
  const dy = (event.clientY - drag.value.y) * mapHeight / bounds.height
  if (Math.abs(dx) + Math.abs(dy) > 1) drag.value.moved = true
  drag.value.x = event.clientX
  drag.value.y = event.clientY
  translateX.value = clampTranslation(translateX.value + dx, mapWidth)
  translateY.value = clampTranslation(translateY.value + dy, mapHeight)
}

function onPointerUp(event: PointerEvent) {
  if (drag.value?.pointerId !== event.pointerId) return
  svg.value?.releasePointerCapture(event.pointerId)
  window.setTimeout(() => { drag.value = null }, 0)
}

function selectTimezone(timezone: string) {
  if (!drag.value?.moved) emit('update:modelValue', timezone)
}
</script>

<template>
  <div class="timezone-map-shell">
    <svg
      ref="svg"
      class="timezone-map"
      :class="{ dragging: drag }"
      :viewBox="`0 0 ${mapWidth} ${mapHeight}`"
      role="listbox"
      :aria-label="activeLabel"
      @wheel.prevent="onWheel"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <rect class="timezone-map-ocean" :width="mapWidth" :height="mapHeight" />
      <g :transform="mapTransform">
        <path class="timezone-map-land" :d="landPath" />
        <g class="timezone-map-grid">
          <line v-for="x in gridLongitudes" :key="`x-${x}`" :x1="x" y1="0" :x2="x" :y2="mapHeight" />
          <line v-for="y in gridLatitudes" :key="`y-${y}`" x1="0" :y1="y" :x2="mapWidth" :y2="y" />
        </g>
        <circle
          v-for="marker in markers"
          :key="marker.timezone"
          :cx="marker.x"
          :cy="marker.y"
          :r="marker.timezone === modelValue ? 5 : 3.5"
          :class="{ selected: marker.timezone === modelValue }"
          role="option"
          tabindex="0"
          :aria-label="marker.timezone"
          :aria-selected="marker.timezone === modelValue"
          @click.stop="selectTimezone(marker.timezone)"
          @keydown.enter.prevent="selectTimezone(marker.timezone)"
          @keydown.space.prevent="selectTimezone(marker.timezone)"
          @mouseenter="hoveredTimezone = marker.timezone"
          @mouseleave="hoveredTimezone = ''"
          @focus="hoveredTimezone = marker.timezone"
          @blur="hoveredTimezone = ''"
        >
          <title>{{ marker.timezone.split('_').join(' ') }}</title>
        </circle>
      </g>
    </svg>
    <div class="timezone-map-controls">
      <n-button quaternary circle :title="t('settings.advancedSettings.systemPage.zoomIn', 'Zoom in')" :disabled="zoom >= maximumZoom" @click="setZoom(zoom * 1.5)">
        <template #icon><ZoomIn /></template>
      </n-button>
      <n-button quaternary circle :title="t('settings.advancedSettings.systemPage.zoomOut', 'Zoom out')" :disabled="zoom <= minimumZoom" @click="setZoom(zoom / 1.5)">
        <template #icon><ZoomOut /></template>
      </n-button>
      <n-button quaternary circle :title="t('settings.advancedSettings.systemPage.resetMap', 'Reset map')" :disabled="zoom === 1" @click="resetView">
        <template #icon><RotateCcw /></template>
      </n-button>
    </div>
    <output>{{ activeLabel.split('_').join(' ') }}</output>
  </div>
</template>
