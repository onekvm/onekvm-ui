<script setup lang="ts">
import { computed, useTemplateRef } from 'vue'
import { ChevronRight, FolderPlus, RefreshCw, Upload } from '@lucide/vue'

import { t } from '@/i18n/runtime'

const props = defineProps<{
  root: string
  path: string
  disabled: boolean
  uploading: boolean
}>()

const emit = defineEmits<{
  navigate: [path: string]
  refresh: []
  createDirectory: []
  selectFile: [file: File]
}>()

const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const breadcrumbs = computed(() => {
  const parts = props.path.split('/').filter(Boolean)
  return [
    { label: props.root, path: '' },
    ...parts.map((label, index) => ({ label, path: parts.slice(0, index + 1).join('/') })),
  ]
})

function selectFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) emit('selectFile', file)
}
</script>

<template>
  <div class="file-toolbar">
    <nav class="file-breadcrumbs" :aria-label="t('settings.advancedSettings.fileManager.path', 'Current path')">
      <template v-for="(item, index) in breadcrumbs" :key="item.path">
        <ChevronRight v-if="index" :size="14" aria-hidden="true" />
        <button
          type="button"
          :class="{ current: index === breadcrumbs.length - 1 }"
          :disabled="disabled || index === breadcrumbs.length - 1"
          @click="emit('navigate', item.path)"
        >
          {{ item.label }}
        </button>
      </template>
    </nav>

    <div class="file-toolbar-actions">
      <n-tooltip>
        <template #trigger>
          <n-button
            quaternary
            circle
            :disabled="disabled"
            :aria-label="t('common.refresh', 'Refresh')"
            @click="emit('refresh')"
          >
            <template #icon><RefreshCw /></template>
          </n-button>
        </template>
        {{ t('common.refresh', 'Refresh') }}
      </n-tooltip>
      <n-button
        secondary
        :disabled="disabled"
        :aria-label="t('settings.advancedSettings.fileManager.newFolder', 'New folder')"
        @click="emit('createDirectory')"
      >
        <template #icon><FolderPlus /></template>
        <span class="file-action-label">{{ t('settings.advancedSettings.fileManager.newFolder', 'New folder') }}</span>
      </n-button>
      <label class="file-upload-button">
        <input
          ref="fileInput"
          type="file"
          :disabled="disabled || uploading"
          @change="selectFile"
        />
        <n-button tag="span" type="primary" :disabled="disabled || uploading">
          <template #icon><Upload /></template>
          <span class="file-action-label">{{ t('settings.advancedSettings.fileManager.upload', 'Upload') }}</span>
        </n-button>
      </label>
    </div>
  </div>
</template>

<style scoped>
.file-toolbar {
  display: flex;
  min-height: 48px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-large);
  background: var(--card);
}

.file-breadcrumbs {
  display: flex;
  min-width: 0;
  align-items: center;
  overflow-x: auto;
  color: var(--muted-foreground);
  scrollbar-width: thin;
}

.file-breadcrumbs > svg { flex: 0 0 auto; }

.file-breadcrumbs button {
  min-width: 0;
  min-height: 32px;
  padding: 0 7px;
  overflow: hidden;
  border: 0;
  border-radius: var(--radius);
  color: var(--onekvm-text-secondary);
  background: transparent;
  cursor: pointer;
  font-family: var(--onekvm-font-mono);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-breadcrumbs button:hover:not(:disabled) {
  color: var(--foreground);
  background: var(--accent);
}

.file-breadcrumbs button.current {
  color: var(--foreground);
  cursor: default;
  font-weight: 600;
}

.file-toolbar-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
}

.file-upload-button { display: inline-flex; cursor: pointer; }
.file-upload-button input { display: none; }

@media (max-width: 760px) {
  .file-toolbar { align-items: stretch; flex-direction: column; gap: 10px; }
  .file-toolbar-actions { width: 100%; justify-content: stretch; }
  .file-toolbar-actions :deep(.n-button),
  .file-upload-button { flex: 1; }
}

@media (max-width: 420px) {
  .file-action-label { display: none; }
}
</style>
