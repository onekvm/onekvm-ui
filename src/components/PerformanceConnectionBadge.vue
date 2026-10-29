<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef, useId } from 'vue'
import { t } from '@/i18n/runtime'
import { videoConnectionType, type WebRTCConnectionStats } from '@/lib/webrtc-connection-stats'

const props = defineProps<{
  transport: 'webrtc' | 'websocket' | 'mjpeg'
  stats?: WebRTCConnectionStats | null
}>()

const value = computed(() => videoConnectionType(props.transport, props.stats) ?? t('screen.videoFormatUnknown'))
const hovered = shallowRef(false)
const focused = shallowRef(false)
const dismissed = shallowRef(false)
const hintId = useId()
const show = computed(() => !dismissed.value && (hovered.value || focused.value))

function updateHover(value: boolean) {
  hovered.value = value
  if (value) dismissed.value = false
}
function dismiss(event: KeyboardEvent) {
  if (event.key === 'Escape' && show.value) dismissed.value = true
}
onMounted(() => document.addEventListener('keydown', dismiss))
onBeforeUnmount(() => document.removeEventListener('keydown', dismiss))
</script>

<template>
  <n-tooltip trigger="hover" :show="show" :keep-alive-on-hover="true" to=".console-workspace" :z-index="4000" :style="{ maxWidth: 'min(320px, calc(100vw - 32px))' }" @update:show="updateHover">
    <template #trigger>
      <n-tag
        class="performance-connection-badge"
        size="small"
        round
        :bordered="false"
        tabindex="0"
        :aria-label="`${t('screen.connectionType')}: ${value}`"
        :aria-describedby="show ? hintId : undefined"
        @focus="focused = true; dismissed = false"
        @blur="focused = false"
        @keydown.esc.stop="dismissed = true"
      >
        <span class="performance-connection-label">{{ t('screen.connectionType') }}</span>
        <span class="performance-connection-value">{{ value }}</span>
      </n-tag>
    </template>
    <span :id="hintId" class="performance-connection-hint">{{ t('screen.connectionTypeHint') }}</span>
  </n-tooltip>
</template>

<style scoped>
.performance-connection-badge { font-size: 10px; cursor: help; }
.performance-connection-badge:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
.performance-connection-label { margin-right: 4px; color: var(--muted-foreground); }
.performance-connection-value { color: var(--foreground); font-weight: 500; }
.performance-connection-hint { white-space: pre-line; }
</style>
