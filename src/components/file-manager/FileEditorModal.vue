<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { FileCode2, Save } from '@lucide/vue'
import { useDialog, useMessage } from 'naive-ui'

import type { DeviceFileEntry } from '@/api/client'
import { MAX_EDITABLE_FILE_BYTES, useFileEditor } from '@/composables/useFileEditor'
import { t } from '@/i18n/runtime'
import { FileTextError } from '@/utils/fileText'

const props = defineProps<{
  entry: DeviceFileEntry | null
  path: string
}>()
const emit = defineEmits<{
  saved: []
}>()
const show = defineModel<boolean>('show', { required: true })

const dialog = useDialog()
const message = useMessage()
const editor = useFileEditor()
const targetPath = computed(() => {
  if (!props.entry) return ''
  return props.path ? `${props.path}/${props.entry.name}` : props.entry.name
})
const loadErrorMessage = computed(() => {
  const reason = editor.loadError.value
  if (reason instanceof FileTextError) {
    if (reason.code === 'too-large') {
      return t('settings.advancedSettings.fileManager.editorTooLarge', 'Files larger than 2 MiB cannot be edited in the browser.')
    }
    if (reason.code === 'binary') {
      return t('settings.advancedSettings.fileManager.editorBinary', 'This appears to be a binary file and cannot be edited as text.')
    }
    return t('settings.advancedSettings.fileManager.editorInvalidUtf8', 'This file is not valid UTF-8 text.')
  }
  return reason instanceof Error ? reason.message : reason ? String(reason) : ''
})
const saveErrorMessage = computed(() => {
  const reason = editor.saveError.value
  return reason instanceof Error ? reason.message : reason ? String(reason) : ''
})
const mode = computed(() => props.entry?.mode.toString(8).padStart(3, '0') || '---')
const maxSize = computed(() => `${MAX_EDITABLE_FILE_BYTES / 1024 / 1024} MiB`)
const cursorLine = ref(1)
const cursorColumn = ref(1)
const selectionLength = ref(0)

watch(
  [show, targetPath],
  ([visible, path]) => {
    if (visible && path && props.entry) {
      cursorLine.value = 1
      cursorColumn.value = 1
      selectionLength.value = 0
      void editor.load(path, props.entry.size)
    }
  },
  { immediate: true },
)

function closeEditor() {
  if (!editor.dirty.value) {
    show.value = false
    return
  }
  dialog.warning({
    title: t('settings.advancedSettings.fileManager.editorDiscardTitle', 'Discard unsaved changes?'),
    content: t('settings.advancedSettings.fileManager.editorDiscardWarning', 'Your changes to this file will be lost.'),
    positiveText: t('settings.advancedSettings.fileManager.editorDiscard', 'Discard'),
    negativeText: t('common.cancel', 'Cancel'),
    onPositiveClick: () => {
      show.value = false
    },
  })
}

function updateVisibility(value: boolean) {
  if (value) show.value = true
  else closeEditor()
}

async function save() {
  if (!editor.dirty.value) return
  if (!await editor.save()) return
  message.success(t('settings.advancedSettings.fileManager.editorSaved', 'File saved'))
  emit('saved')
}

function updateCursor(event: Event) {
  if (!(event.target instanceof HTMLTextAreaElement)) return
  const start = event.target.selectionStart ?? 0
  const end = event.target.selectionEnd ?? start
  const before = event.target.value.slice(0, start)
  const lastBreak = before.lastIndexOf('\n')
  cursorLine.value = before.split('\n').length
  cursorColumn.value = start - lastBreak
  selectionLength.value = Math.max(0, end - start)
}
</script>

<template>
  <n-modal
    :show="show"
    preset="card"
    class="file-editor-modal"
    :title="`${t('settings.advancedSettings.fileManager.edit', 'Edit')} — ${entry?.name || ''}`"
    :mask-closable="false"
    :style="{ width: 'min(960px, calc(100vw - 24px))' }"
    @update:show="updateVisibility"
    @after-leave="editor.reset"
  >
    <div class="file-editor-path">
      <FileCode2 :size="16" aria-hidden="true" />
      <span>{{ targetPath }}</span>
      <i v-if="editor.dirty.value">{{ t('settings.advancedSettings.fileManager.editorUnsaved', 'Unsaved') }}</i>
    </div>

    <n-spin :show="editor.loading.value" class="file-editor-loading">
      <n-alert v-if="loadErrorMessage" type="error" :bordered="false">
        {{ loadErrorMessage }}
      </n-alert>
      <template v-else>
        <n-alert v-if="saveErrorMessage" class="file-editor-save-error" type="error" :bordered="false">
          {{ saveErrorMessage }}
        </n-alert>
        <n-input
          v-model:value="editor.content.value"
          class="file-editor-input"
          type="textarea"
          :rows="22"
          :disabled="editor.loading.value || editor.saving.value"
          :placeholder="t('settings.advancedSettings.fileManager.editorPlaceholder', 'File contents')"
          :input-props="{ spellcheck: false, autocapitalize: 'off', autocomplete: 'off' }"
          @keydown.ctrl.s.prevent="save"
          @keydown.meta.s.prevent="save"
          @click="updateCursor"
          @keyup="updateCursor"
          @select="updateCursor"
        />
      </template>
    </n-spin>

    <template #footer>
      <div class="file-editor-footer">
        <div class="file-editor-status">
          <span
            class="file-editor-save-state"
            :class="{ 'is-dirty': editor.dirty.value }"
            aria-live="polite"
          >
            <i aria-hidden="true" />
            {{ editor.dirty.value
              ? t('settings.advancedSettings.fileManager.editorUnsaved', 'Unsaved')
              : t('settings.advancedSettings.fileManager.editorClean', 'Saved') }}
          </span>
          <span class="file-editor-cursor">
            {{ t('settings.advancedSettings.fileManager.editorLine', 'Ln') }} {{ cursorLine }},
            {{ t('settings.advancedSettings.fileManager.editorColumn', 'Col') }} {{ cursorColumn }}
          </span>
          <span v-if="selectionLength > 0" class="file-editor-selection">
            {{ selectionLength }} {{ t('settings.advancedSettings.fileManager.editorSelected', 'selected') }}
          </span>
          <span>{{ editor.lineCount.value }} {{ t('settings.advancedSettings.fileManager.editorLines', 'lines') }}</span>
          <span class="file-editor-secondary">UTF-8{{ editor.byteOrderMark.value ? ' BOM' : '' }}</span>
          <span class="file-editor-secondary">{{ editor.lineEnding.value.toUpperCase() }}</span>
          <span class="file-editor-secondary">{{ entry?.owner || '—' }}:{{ mode }}</span>
          <span class="file-editor-secondary">{{ maxSize }}</span>
        </div>
        <div class="file-editor-actions">
          <n-button :disabled="editor.saving.value" @click="closeEditor">
            {{ t('common.close', 'Close') }}
          </n-button>
          <n-button
            type="primary"
            :loading="editor.saving.value"
            :disabled="editor.loading.value || Boolean(loadErrorMessage) || !editor.dirty.value"
            @click="save"
          >
            <template #icon><Save /></template>
            {{ t('common.save', 'Save') }}
          </n-button>
        </div>
      </div>
    </template>
  </n-modal>
</template>

<style scoped>
.file-editor-path {
  display: flex;
  min-height: 36px;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  overflow: hidden;
  border: 1px solid var(--border);
  border-bottom: 0;
  border-radius: var(--radius) var(--radius) 0 0;
  color: var(--muted-foreground);
  background: var(--muted);
  font-family: var(--onekvm-font-mono);
  font-size: 11px;
}

.file-editor-path > svg { flex: 0 0 auto; color: var(--primary); }
.file-editor-path > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-editor-path > i {
  flex: 0 0 auto;
  margin-left: auto;
  color: var(--warning);
  font-family: inherit;
  font-style: normal;
  font-weight: 600;
}

.file-editor-loading { min-height: 420px; }
.file-editor-save-error { margin-bottom: 8px; }
.file-editor-input { width: 100%; }
.file-editor-input:deep(.n-input-wrapper) { padding: 0; }
.file-editor-input:deep(textarea) {
  min-height: min(58vh, 560px);
  padding: 12px 14px;
  font-family: var(--onekvm-font-mono);
  font-size: 13px;
  line-height: 1.6;
  tab-size: 4;
  white-space: pre;
}

.file-editor-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.file-editor-status {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 4px 12px;
  color: var(--muted-foreground);
  font-family: var(--onekvm-font-mono);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.file-editor-status > span {
  display: inline-flex;
  min-height: 20px;
  align-items: center;
  padding-right: 12px;
  border-right: 1px solid var(--border);
  white-space: nowrap;
}

.file-editor-status > span:last-child { padding-right: 0; border-right: 0; }
.file-editor-save-state { color: var(--muted-foreground); font-weight: 600; }
.file-editor-save-state > i {
  width: 6px;
  height: 6px;
  margin-right: 6px;
  border-radius: 50%;
  background: var(--primary);
}
.file-editor-save-state.is-dirty { color: var(--warning); }
.file-editor-save-state.is-dirty > i { background: var(--warning); }
.file-editor-cursor { color: var(--foreground); }
.file-editor-selection { color: var(--primary); }
.file-editor-secondary { opacity: .78; }

.file-editor-actions { display: flex; flex: 0 0 auto; gap: 8px; }

@media (max-width: 720px) {
  .file-editor-footer { align-items: stretch; flex-direction: column; }
  .file-editor-status { gap: 4px 8px; }
  .file-editor-status > span { padding-right: 8px; }
  .file-editor-actions { justify-content: flex-end; }
  .file-editor-input:deep(textarea) { min-height: 52vh; }
}
</style>
