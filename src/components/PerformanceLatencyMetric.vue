<script setup lang="ts">
import { computed, shallowRef, useId } from 'vue'
import type { LatencyStackKey } from '@/lib/video-stream-chart'

const props = withDefaults(defineProps<{
  label: string
  shortLabel?: string
  value: string
  hint: string
  swatch?: LatencyStackKey | 'ice'
  variant?: 'row' | 'total' | 'compact' | 'inline'
}>(), { variant: 'row' })

const hovered = shallowRef(false)
const focused = shallowRef(false)
const dismissed = shallowRef(false)
const hintId = useId()
const show = computed(() => !dismissed.value && (hovered.value || focused.value))
const tag = computed(() => props.variant === 'row' ? 'div' : props.variant === 'total' ? 'strong' : 'span')
</script>

<template>
  <n-tooltip trigger="manual" :show="show" to=".console-workspace" :z-index="4000" :style="{ maxWidth: 'min(320px, calc(100vw - 32px))' }">
    <template #trigger>
      <component
        :is="tag"
        class="performance-latency-metric"
        :class="{ 'display-status-total': variant === 'total', 'performance-compact-metric': variant === 'compact', 'performance-latency-inline': variant === 'inline' }"
        tabindex="0"
        :aria-label="`${label}: ${value}`"
        :aria-describedby="show ? hintId : undefined"
        @mouseenter="hovered = true; dismissed = false"
        @mouseleave="hovered = false"
        @focus="focused = true; dismissed = false"
        @blur="focused = false"
        @keydown.esc.stop="dismissed = true"
      >
        <template v-if="variant !== 'total'">
          <span class="performance-metric-label">
            <span v-if="swatch" class="stream-chart-swatch" :class="`latency-swatch-${swatch}`" aria-hidden="true" />
            {{ shortLabel || label }}
          </span>
          <strong>{{ value }}</strong>
        </template>
        <template v-else>{{ value }}</template>
      </component>
    </template>
    <span :id="hintId">{{ hint }}</span>
  </n-tooltip>
</template>

<style scoped>
.performance-latency-metric { cursor: help; }
.performance-latency-metric:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; border-radius: 3px; }
.performance-latency-inline { display: inline-flex; align-items: center; gap: 8px; font-size: 10px; color: var(--muted-foreground); }
</style>
