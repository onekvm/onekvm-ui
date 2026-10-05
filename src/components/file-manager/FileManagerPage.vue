<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue'
import { AlertTriangle, FileUp } from '@lucide/vue'
import { useDialog, useMessage } from 'naive-ui'

import type { DeviceFileEntry } from '@/api/client'
import { useFileManager } from '@/composables/useFileManager'
import { t } from '@/i18n/runtime'

import FileManagerList from './FileManagerList.vue'
import FileManagerToolbar from './FileManagerToolbar.vue'
import FileEditorModal from './FileEditorModal.vue'
import XpTransferDialog from '../XpTransferDialog.vue'

const dialog = useDialog()
const message = useMessage()
const manager = useFileManager()
const editorOpen = shallowRef(false)
const editorMode = shallowRef<'create' | 'rename'>('create')
const editorName = shallowRef('')
const editorEntry = shallowRef<DeviceFileEntry | null>(null)
const fileEditorOpen = shallowRef(false)
const fileEditorEntry = shallowRef<DeviceFileEntry | null>(null)
const dragging = shallowRef(false)

const disabled = computed(() => manager.loading.value || manager.operating.value || manager.uploading.value)
const editorTitle = computed(() => editorMode.value === 'create'
  ? t('settings.advancedSettings.fileManager.newFolder', 'New folder')
  : t('settings.advancedSettings.fileManager.rename', 'Rename'))
const uploadTitle = computed(() => t('settings.advancedSettings.fileManager.uploadTitle', 'File upload'))
const uploadStatus = computed(() => t(
  'settings.advancedSettings.fileManager.uploadingFile',
  'Uploading {name}…',
).replace('{name}', manager.uploadName.value))
const uploadRemainingLabel = computed(() => {
  if (!manager.uploading.value) return ''
  const seconds = manager.uploadRemainingSeconds.value
  if (seconds <= 0) return t('virtualMedia.remainingCalculating', 'Calculating time remaining…')
  if (seconds < 60) return t('virtualMedia.remainingLessThanMinute', 'Less than 1 minute remaining')
  return t('virtualMedia.remainingMinutes', '{count} minutes remaining')
    .replace('{count}', String(Math.ceil(seconds / 60)))
})
const validEditorName = computed(() => {
  const name = editorName.value.trim()
  return Boolean(name && name !== '.' && name !== '..' && !name.includes('/') && !name.includes('\\'))
})

onMounted(() => void manager.load())

function openCreate() {
  editorMode.value = 'create'
  editorEntry.value = null
  editorName.value = ''
  editorOpen.value = true
}

function openRename(entry: DeviceFileEntry) {
  editorMode.value = 'rename'
  editorEntry.value = entry
  editorName.value = entry.name
  editorOpen.value = true
}

function openFileEditor(entry: DeviceFileEntry) {
  if (entry.directory) return
  fileEditorEntry.value = entry
  fileEditorOpen.value = true
}

async function submitEditor() {
  if (!validEditorName.value) return
  const name = editorName.value.trim()
  const success = editorMode.value === 'create'
    ? await manager.createDirectory(name)
    : editorEntry.value ? await manager.renameEntry(editorEntry.value, name) : false
  if (!success) return
  editorOpen.value = false
  message.success(editorMode.value === 'create'
    ? t('settings.advancedSettings.fileManager.folderCreated', 'Folder created')
    : t('settings.advancedSettings.fileManager.renamed', 'Item renamed'))
}

function confirmDelete(entry: DeviceFileEntry) {
  dialog.error({
    title: t('settings.advancedSettings.fileManager.deleteTitle', 'Delete item?'),
    content: entry.directory
      ? t('settings.advancedSettings.fileManager.deleteFolderWarning', 'This folder and everything inside it will be permanently deleted.')
      : t('settings.advancedSettings.fileManager.deleteFileWarning', 'This file will be permanently deleted.'),
    positiveText: t('common.delete', 'Delete'),
    negativeText: t('common.cancel', 'Cancel'),
    async onPositiveClick() {
      if (await manager.deleteEntry(entry)) {
        message.success(t('settings.advancedSettings.fileManager.deleted', 'Item deleted'))
      }
    },
  })
}

async function runUpload(file: File, overwrite: boolean) {
  if (await manager.upload(file, overwrite)) {
    message.success(t('settings.advancedSettings.fileManager.uploaded', 'Upload complete'))
  }
}

function selectUpload(file: File) {
  const existing = manager.entries.value.find((entry) => entry.name === file.name)
  if (!existing) {
    void runUpload(file, false)
    return
  }
  if (existing.directory) {
    message.error(t('settings.advancedSettings.fileManager.folderConflict', 'A folder already uses this name.'))
    return
  }
  dialog.warning({
    title: t('settings.advancedSettings.fileManager.overwriteTitle', 'Replace existing file?'),
    content: t('settings.advancedSettings.fileManager.overwriteWarning', 'The existing file will be replaced after the upload finishes.'),
    positiveText: t('settings.advancedSettings.fileManager.replace', 'Replace'),
    negativeText: t('common.cancel', 'Cancel'),
    onPositiveClick: () => runUpload(file, true),
  })
}

function dropFiles(event: DragEvent) {
  dragging.value = false
  const file = event.dataTransfer?.files[0]
  if (file) selectUpload(file)
}
</script>

<template>
  <section class="file-manager-page">
    <p class="file-manager-intro">
      {{ t('settings.advancedSettings.fileManager.description', 'Manage user data files.') }}
    </p>

    <FileManagerToolbar
      :root="manager.rootPath.value"
      :path="manager.currentPath.value"
      :disabled="disabled"
      :uploading="manager.uploading.value"
      @navigate="manager.navigate"
      @refresh="manager.load()"
      @create-directory="openCreate"
      @select-file="selectUpload"
    />

    <n-alert v-if="manager.error.value" type="error" :bordered="false">
      {{ manager.error.value }}
    </n-alert>

    <XpTransferDialog
      :show="manager.uploading.value"
      :dialog-label="uploadTitle"
      :status="uploadStatus"
      :transferred="manager.uploadLoaded.value"
      :total="manager.uploadTotal.value"
      :percentage="manager.uploadPercentage.value"
      :speed="manager.uploadSpeed.value"
      :remaining-label="uploadRemainingLabel"
    >
      <template #title>
        <FileUp :size="15" />{{ uploadTitle }}
      </template>
      <template #actions>
        <button @click="manager.cancelUpload">
          {{ t('settings.advancedSettings.fileManager.cancelUpload', 'Cancel upload') }}
        </button>
      </template>
    </XpTransferDialog>

    <div
      class="file-drop-region"
      :class="{ dragging }"
      @dragenter.prevent="dragging = true"
      @dragover.prevent="dragging = true"
      @dragleave.self="dragging = false"
      @drop.prevent="dropFiles"
    >
      <n-spin :show="manager.loading.value">
        <FileManagerList
          :entries="manager.entries.value"
          :disabled="disabled"
          :download-url="manager.downloadUrl"
          @open="manager.openDirectory"
          @edit="openFileEditor"
          @rename="openRename"
          @delete="confirmDelete"
        />
      </n-spin>
      <div v-if="dragging" class="file-drop-overlay">
        <FileUp :size="28" />
        <strong>{{ t('settings.advancedSettings.fileManager.dropToUpload', 'Drop to upload into this folder') }}</strong>
      </div>
    </div>

    <footer class="file-manager-footer">
      <span>{{ manager.entries.value.length }} {{ t('settings.advancedSettings.fileManager.items', 'items') }}</span>
      <span class="file-manager-safety"><AlertTriangle :size="14" />{{ t('settings.advancedSettings.fileManager.safety', 'Deletes cannot be undone') }}</span>
    </footer>

    <n-modal
      v-model:show="editorOpen"
      preset="card"
      :title="editorTitle"
      style="width: min(440px, calc(100vw - 28px))"
    >
      <n-input
        v-model:value="editorName"
        :placeholder="t('settings.advancedSettings.fileManager.namePlaceholder', 'Name')"
        :maxlength="255"
        @keydown.enter="submitEditor"
      />
      <template #footer>
        <div class="file-editor-actions">
          <n-button @click="editorOpen = false">{{ t('common.cancel', 'Cancel') }}</n-button>
          <n-button type="primary" :loading="manager.operating.value" :disabled="!validEditorName" @click="submitEditor">
            {{ editorMode === 'create' ? t('common.create', 'Create') : t('common.save', 'Save') }}
          </n-button>
        </div>
      </template>
    </n-modal>

    <FileEditorModal
      v-model:show="fileEditorOpen"
      :entry="fileEditorEntry"
      :path="manager.currentPath.value"
      @saved="manager.load()"
    />
  </section>
</template>

<style scoped>
.file-manager-page { display: grid; gap: 12px; }

.file-manager-intro {
  max-width: 680px;
  margin: -6px 0 4px;
  color: var(--muted-foreground);
  font-size: 13px;
  line-height: 1.5;
  text-wrap: pretty;
}

.file-drop-region { position: relative; min-width: 0; }
.file-drop-region.dragging { outline: 2px solid var(--ring); outline-offset: 2px; border-radius: var(--radius-large); }
.file-drop-overlay {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 10px;
  border-radius: var(--radius-large);
  color: var(--primary-hover);
  background: color-mix(in srgb, var(--background) 78%, transparent);
  backdrop-filter: blur(4px);
  pointer-events: none;
}

.file-manager-footer {
  display: flex;
  min-height: 28px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--muted-foreground);
  font-size: 11px;
}

.file-manager-safety { display: inline-flex; align-items: center; gap: 5px; color: var(--warning); }
.file-editor-actions { display: flex; justify-content: flex-end; gap: 8px; }

@media (max-width: 760px) {
  .file-manager-page { gap: 14px; }
  .file-manager-footer { align-items: flex-start; flex-direction: column; gap: 6px; }
  .file-editor-actions { justify-content: stretch; }
  .file-editor-actions :deep(.n-button) { flex: 1; }
}
</style>
