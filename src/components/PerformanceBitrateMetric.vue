<script setup lang="ts">
import { computed, shallowRef, useId } from 'vue'
import { t } from '@/i18n/runtime'

defineProps<{ value: string; hint: string; compact?: boolean }>()
const hovered = shallowRef(false)
const focused = shallowRef(false)
const dismissed = shallowRef(false)
const hintId = useId()
const show = computed(() => !dismissed.value && (hovered.value || focused.value))
</script>

<template>
  <n-tooltip trigger="manual" :show="show" to=".console-workspace" :z-index="4000" :style="{ maxWidth: 'min(320px, calc(100vw - 32px))' }">
    <template #trigger>
      <component
        :is="compact ? 'span' : 'div'"
        class="performance-bitrate-metric"
        :class="{ 'performance-compact-metric': compact }"
        tabindex="0"
        :aria-label="`${t('screen.bitrate')}: ${value}`"
        :aria-describedby="show ? hintId : undefined"
        @mouseenter="hovered = true; dismissed = false"
        @mouseleave="hovered = false"
        @focus="focused = true; dismissed = false"
        @blur="focused = false"
        @keydown.esc.stop="dismissed = true"
      >
        <span class="performance-metric-label"><span v-if="!compact" class="stream-chart-swatch stream-chart-swatch-bitrate" aria-hidden="true" />{{ compact ? t('screen.performanceCompact.bitrate') : t('screen.bitrate') }}</span>
        <strong>{{ value }}</strong>
      </component>
    </template>
    <span :id="hintId" style="white-space: pre-line">{{ hint }}</span>
  </n-tooltip>
</template>

<style scoped>
.performance-bitrate-metric { cursor: help; }
.performance-bitrate-metric:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; border-radius: 3px; }
</style>
