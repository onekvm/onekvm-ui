<script setup lang="ts">
import { computed } from 'vue'
import { HardDrive } from '@lucide/vue'

import { t } from '@/i18n/runtime'

const props = defineProps<{
  available: boolean
  led?: boolean
  expanded?: boolean
}>()

const state = computed(() => {
  if (!props.available || typeof props.led !== 'boolean') return 'unavailable'
  return props.led ? 'active' : 'idle'
})
const label = computed(() => {
  const status = state.value === 'active'
    ? t('power.hddActive', 'Active')
    : state.value === 'idle'
      ? t('power.hddIdle', 'Idle')
      : t('power.hddUnavailable', 'Unavailable')
  return `${t('power.hddLed', 'HDD LED')}: ${status}`
})
</script>

<template>
  <n-tooltip :disabled="expanded">
    <template #trigger>
      <span
        class="device-indicator hdd-activity-indicator"
        :class="{ 'is-expanded': expanded }"
        :data-state="state"
        :aria-label="label"
        role="img"
        tabindex="0"
      >
        <HardDrive :size="expanded ? 20 : 16" aria-hidden="true" />
        <span class="device-led" aria-hidden="true" />
        <span class="toolbar-action-label" aria-hidden="true">{{ label }}</span>
      </span>
    </template>
    {{ label }}
  </n-tooltip>
</template>

<style scoped>
.hdd-activity-indicator { display: flex; flex: 0 0 auto; align-items: center; justify-content: center; border-radius: var(--radius); }
.hdd-activity-indicator:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
.hdd-activity-indicator .device-led { background: var(--border-strong); box-shadow: none; }
.hdd-activity-indicator[data-state="active"] .device-led { background: var(--primary); box-shadow: 0 0 5px color-mix(in srgb, var(--primary) 55%, transparent); }
.hdd-activity-indicator.is-expanded { justify-content: flex-start; gap: 12px; width: 100%; min-width: 0 !important; max-width: none; height: auto !important; min-height: 48px; padding: 8px 30px 8px 12px !important; }
.hdd-activity-indicator.is-expanded > svg { flex: 0 0 auto; }
.hdd-activity-indicator.is-expanded .toolbar-action-label { display: block; }
</style>
