<script setup lang="ts">
import { computed, shallowRef, useTemplateRef, watchEffect } from 'vue'

const props = withDefaults(defineProps<{
  percentage?: number
  indeterminate?: boolean
}>(), {
  percentage: 0,
  indeterminate: false,
})

const track = useTemplateRef<HTMLElement>('track')
const cellCount = shallowRef(0)
const step = shallowRef(0)
const litCount = computed(() => {
  const percentage = Number.isFinite(props.percentage) ? Math.max(0, Math.min(100, props.percentage)) : 0
  return Math.floor(cellCount.value * percentage / 100)
})

function isLit(cell: number) {
  return props.indeterminate
    ? cell - 1 <= step.value && cell - 1 > step.value - 3
    : cell <= litCount.value
}

watchEffect((onCleanup) => {
  const element = track.value
  if (!element) return
  const observer = new ResizeObserver(([entry]) => {
    // Render only cells that fit completely: 8 px each with 2 px gaps.
    if (entry) cellCount.value = Math.max(0, Math.floor((entry.contentRect.width + 2) / 10))
  })
  observer.observe(element)
  onCleanup(() => observer.disconnect())
})

watchEffect((onCleanup) => {
  if (!props.indeterminate) return
  step.value = 0
  const timer = window.setInterval(() => {
    // Light three fixed cells, then let the tail leave before restarting.
    step.value = (step.value + 1) % (cellCount.value + 2)
  }, 80)
  onCleanup(() => window.clearInterval(timer))
})
</script>

<template>
  <div ref="track" class="xp-progress-cells" :class="{ 'xp-progress-indeterminate': indeterminate }" aria-hidden="true">
    <span
      v-for="cell in cellCount"
      :key="cell"
      class="xp-progress-cell"
      :class="{ 'is-lit': isLit(cell) }"
    />
  </div>
</template>

<style scoped>
.xp-progress-cells { display: flex; height: 100%; gap: 2px; padding-left: 2px; }
.xp-progress-cell { flex: 0 0 8px; height: 100%; border-radius: 1px; background: linear-gradient(180deg, #acedad 0%, #7be47d 14%, #4cda50 28%, #2ed330 42%, #42d845 57%, #76e275 71%, #8fe791 85%, #fff 100%); opacity: 0; }
.xp-progress-cell.is-lit { opacity: 1; }
@media (prefers-reduced-motion: reduce) {
  .xp-progress-indeterminate .xp-progress-cell.is-lit { opacity: 0; }
  .xp-progress-indeterminate .xp-progress-cell:nth-child(-n + 3) { opacity: 1; }
}
</style>
