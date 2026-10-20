<script setup lang="ts">
import { computed } from 'vue'
import { Download, Upload } from '@/icons'

import { t } from '@/i18n/runtime'
import type { MediaTransferState } from '@/lib/media-transfer'

const props = defineProps<{
  state: MediaTransferState
  alwaysVisible?: boolean
  tooltipDisabled?: boolean
  taskId?: 'files' | 'media'
}>()
const emit = defineEmits<{ restore: [] }>()

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)))
  return `${(value / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`
}

const title = computed(() => props.state.title || (props.state.action === 'download'
  ? t('virtualMedia.downloadProgressTitle', 'ISO download')
  : t('virtualMedia.uploadProgressTitle', 'ISO upload')))
const label = computed(() => {
  const state = props.state
  const status = (state.action === 'download'
    ? t('virtualMedia.downloadingFile', 'Downloading {name}…')
    : t('virtualMedia.uploadingFile', 'Uploading {name}…')).replace('{name}', state.name)
  const progress = state.total > 0 ? `${state.progress}%` : formatBytes(state.transferred)
  const remaining = state.remainingSeconds <= 0
    ? t('virtualMedia.remainingCalculating', 'Calculating time remaining…')
    : state.remainingSeconds < 60
      ? t('virtualMedia.remainingLessThanMinute', 'Less than 1 minute remaining')
      : t('virtualMedia.remainingMinutes', '{count} minutes remaining').replace('{count}', String(Math.ceil(state.remainingSeconds / 60)))
  return `${title.value}: ${status} · ${progress} · ${formatBytes(state.speed)}/s · ${remaining}`
})
</script>

<template>
  <n-tooltip v-if="state.uploading && (alwaysVisible || state.minimized)" :disabled="tooltipDisabled">
    <template #trigger>
      <n-button
        quaternary
        size="small"
        class="device-indicator upload-task-indicator"
        data-state="uploading"
        :data-transfer-task="taskId || 'media'"
        :aria-expanded="!state.minimized"
        :aria-label="label"
        @click="emit('restore')"
      >
        <template #icon><component :is="state.action === 'download' ? Download : Upload" /></template>
        <span class="device-led" />
        <span class="toolbar-action-label">{{ title }}</span>
      </n-button>
    </template>
    {{ label }}
  </n-tooltip>
</template>
