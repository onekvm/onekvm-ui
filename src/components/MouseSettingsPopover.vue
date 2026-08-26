<script setup lang="ts">
import { type MouseMode } from '@/composables/useMouse'
import { t } from '@/i18n/runtime'

defineProps<{
  mouseMode: MouseMode
  scrollInterval: number
  mouseReportRate: number
  placement?: 'top-end' | 'bottom-end' | 'right-start' | 'left-start'
}>()

const emit = defineEmits<{
  'update:show': [show: boolean]
}>()

function modeLabel(mode: MouseMode) {
  return mode === 'relative' ? t('mouse.relative', 'Relative') : t('mouse.absolute', 'Absolute')
}
</script>

<template>
  <n-popover
    trigger="click"
    :placement="placement || 'bottom-end'"
    :show-arrow="false"
    class="control-popover mouse-control-popover"
    @update:show="emit('update:show', $event)"
  >
    <template #trigger><slot /></template>

    <div class="control-popover-title">{{ t('settings.mouse.title', 'Mouse') }}</div>
    <div class="display-status-values mouse-status-values">
      <div>
        <span>{{ t('mouse.mode', 'Mouse mode') }}</span>
        <strong>{{ modeLabel(mouseMode) }}</strong>
      </div>
      <div>
        <span>{{ t('settings.mouse.scroll', 'Scroll interval') }}</span>
        <strong>{{ scrollInterval }} ms</strong>
      </div>
      <div>
        <span>{{ t('settings.mouse.reportRate', 'Report rate') }}</span>
        <strong>{{ mouseReportRate }} Hz</strong>
      </div>
    </div>
  </n-popover>
</template>
