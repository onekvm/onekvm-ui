<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { SelectGroupOption } from 'naive-ui'
import type { ToolbarFolder } from '@/api/client'
import { Folder, iconComponent } from '@/icons'
import { t } from '@/i18n/runtime'
import { TOOLBAR_FOLDER_ICONS } from '@/lib/toolbar-layout'
import { validPersonalizationText } from '@/lib/console-title'
import { useOverlayMount } from '@/composables/useOverlayMount'

const props = defineProps<{ show: boolean; folder?: ToolbarFolder | null; options: SelectGroupOption[]; saving?: boolean }>()
const emit = defineEmits<{ 'update:show': [show: boolean]; save: [folder: ToolbarFolder] }>()
const overlayTo = useOverlayMount()
const draft = ref<ToolbarFolder>({ id: '', name: '', icon: 'Folder', items: [] })
const valid = computed(() => validPersonalizationText(draft.value.name, true))
watch(() => props.show, show => {
  if (!show) return
  draft.value = props.folder ? { ...props.folder, items: [...props.folder.items] } : {
    id: `folder-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: '', icon: 'Folder', items: [],
  }
}, { immediate: true })
function save() {
  if (valid.value && !props.saving) emit('save', { ...draft.value, name: draft.value.name.trim() })
}
</script>

<template>
  <n-modal :show="show" :to="overlayTo" preset="card" class="toolbar-folder-editor" :style="{ width: 'min(480px, calc(100vw - 24px))' }" :title="folder ? t('toolbar.folders.edit', 'Edit folder') : t('toolbar.folders.create', 'Create folder')" :mask-closable="!saving" :close-on-esc="!saving" :closable="!saving" @update:show="emit('update:show', $event)">
    <n-form label-placement="top" @submit.prevent="save">
      <n-form-item :label="t('toolbar.folders.name', 'Folder name')">
        <n-input v-model:value="draft.name" :maxlength="64" :disabled="saving" :input-props="{ 'aria-label': t('toolbar.folders.name', 'Folder name') }" @keydown.enter.prevent="save" />
      </n-form-item>
      <n-form-item :label="t('toolbar.folders.icon', 'Folder icon')">
        <div class="toolbar-folder-icon-picker" role="group" :aria-label="t('toolbar.folders.icon', 'Folder icon')">
          <n-button v-for="name in TOOLBAR_FOLDER_ICONS" :key="name" :type="draft.icon === name ? 'primary' : 'default'" :secondary="draft.icon === name" :disabled="saving" :aria-label="t(`toolbar.folders.icons.${name}`, name)" :aria-pressed="draft.icon === name" @click="draft.icon = name">
            <template #icon><component :is="iconComponent(name) || Folder" aria-hidden="true" /></template>
          </n-button>
        </div>
      </n-form-item>
      <n-form-item :label="t('toolbar.folders.members', 'Icons in folder')">
        <n-select v-model:value="draft.items" multiple filterable :options="options" :disabled="saving" :to="overlayTo" :aria-label="t('toolbar.folders.members', 'Icons in folder')" :placeholder="t('toolbar.folders.selectIcons', 'Select icons')" />
      </n-form-item>
      <p class="toolbar-folder-transfer-hint">{{ t('toolbar.folders.transferHint', 'Selected icons move here from their current folder.') }}</p>
      <div class="toolbar-folder-editor-actions">
        <n-button :disabled="saving" @click="emit('update:show', false)">{{ t('common.cancel', 'Cancel') }}</n-button>
        <n-button attr-type="button" type="primary" :loading="saving" :disabled="!valid || saving" @click="save">{{ t('common.save', 'Save') }}</n-button>
      </div>
    </n-form>
  </n-modal>
</template>

<style scoped>
.toolbar-folder-icon-picker { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 6px; width: 100%; }
.toolbar-folder-icon-picker :deep(.n-button) { width: 100%; height: 36px; padding: 0; }
.toolbar-folder-icon-picker :deep(.n-button__icon) { margin: 0; }
.toolbar-folder-editor-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }
.toolbar-folder-transfer-hint { margin: -6px 0 0; font-size: 12px; line-height: 1.5; color: var(--muted-foreground); }
@media (max-width: 420px) { .toolbar-folder-icon-picker { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
</style>
