<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronDown, ChevronUp, Folder, FolderPlus, Pencil, Trash2, iconComponent } from '@/icons'
import type { PersonalizationConfig, ToolbarFolder } from '@/api/client'
import { t } from '@/i18n/runtime'
import { MAX_TOOLBAR_FOLDERS, normalizeToolbarFolders, removeToolbarFolder, toolbarLayoutOrder, upsertToolbarFolder } from '@/lib/toolbar-layout'
import { useToolbarFolderOptions } from '@/composables/useToolbarFolderOptions'
import { useToolboxContext } from '@/composables/useToolbox'
import ToolbarFolderDialog from './ToolbarFolderDialog.vue'

const props = defineProps<{ modelValue: PersonalizationConfig; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: PersonalizationConfig] }>()
const toolbox = useToolboxContext()
const options = useToolbarFolderOptions()
const folders = computed(() => normalizeToolbarFolders(props.modelValue.toolbar_folders))
const editing = ref<ToolbarFolder | null>(null)
const dialogOpen = ref(false)
function edit(folder: ToolbarFolder | null) { editing.value = folder; dialogOpen.value = true }
function save(folder: ToolbarFolder) { emit('update:modelValue', upsertToolbarFolder(props.modelValue, folder)); dialogOpen.value = false }
function remove(id: string) { emit('update:modelValue', removeToolbarFolder(props.modelValue, id)) }
function move(id: string, direction: number) {
  const order = toolbarLayoutOrder(props.modelValue, toolbox.pinned.map(({ tool }) => tool.id))
  const ordered = [...folders.value].sort((a, b) => order.indexOf(`folder:${a.id}`) - order.indexOf(`folder:${b.id}`))
  const index = ordered.findIndex(folder => folder.id === id)
  const neighbor = ordered[index + direction]
  if (!neighbor) return
  const from = order.indexOf(`folder:${id}`)
  const to = order.indexOf(`folder:${neighbor.id}`)
  ;[order[from], order[to]] = [order[to]!, order[from]!]
  emit('update:modelValue', { ...props.modelValue, toolbar_order: order })
}
const orderedFolders = computed(() => {
  const order = toolbarLayoutOrder(props.modelValue, toolbox.pinned.map(({ tool }) => tool.id))
  return [...folders.value].sort((a, b) => order.indexOf(`folder:${a.id}`) - order.indexOf(`folder:${b.id}`))
})
</script>

<template>
  <div class="toolbar-folder-settings">
    <header class="toolbar-folder-settings-heading">
      <h3>{{ t('toolbar.folders.title', 'Folders') }}</h3>
      <n-button size="small" :disabled="disabled || folders.length >= MAX_TOOLBAR_FOLDERS" @click="edit(null)"><template #icon><FolderPlus /></template>{{ t('toolbar.folders.create', 'Create folder') }}</n-button>
    </header>
    <div v-for="(folder, index) in orderedFolders" :key="folder.id" class="toolbar-folder-settings-row" :data-folder-settings="folder.id">
      <component :is="iconComponent(folder.icon) || Folder" :size="20" aria-hidden="true" />
      <div class="toolbar-folder-settings-name"><strong>{{ folder.name }}</strong><span>{{ t('toolbar.folders.itemCount', '{count} icons').replace('{count}', String(folder.items.length)) }}</span></div>
      <n-button quaternary size="small" :disabled="disabled || index === 0" :aria-label="`${t('settings.advancedSettings.personalizationPage.moveUp', 'Move up')}: ${folder.name}`" @click="move(folder.id, -1)"><template #icon><ChevronUp /></template></n-button>
      <n-button quaternary size="small" :disabled="disabled || index === orderedFolders.length - 1" :aria-label="`${t('settings.advancedSettings.personalizationPage.moveDown', 'Move down')}: ${folder.name}`" @click="move(folder.id, 1)"><template #icon><ChevronDown /></template></n-button>
      <n-button quaternary size="small" :disabled="disabled" :aria-label="`${t('toolbar.folders.edit', 'Edit folder')}: ${folder.name}`" @click="edit(folder)"><template #icon><Pencil /></template></n-button>
      <n-button quaternary size="small" :disabled="disabled" :aria-label="`${t('toolbar.folders.remove', 'Delete folder')}: ${folder.name}`" @click="remove(folder.id)"><template #icon><Trash2 /></template></n-button>
    </div>
    <p v-if="folders.length" class="toolbar-folder-settings-hint">{{ t('toolbar.folders.removeHint', 'Deleting a folder returns its icons to the toolbar.') }}</p>
    <ToolbarFolderDialog :show="dialogOpen" :folder="editing" :options="options" @update:show="dialogOpen = $event" @save="save" />
  </div>
</template>

<style scoped>
.toolbar-folder-settings { display: grid; gap: 8px; margin-top: 20px; }
.toolbar-folder-settings-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.toolbar-folder-settings-heading h3 { margin: 0; font-size: 14px; font-weight: 600; }
.toolbar-folder-settings-row { display: flex; align-items: center; gap: 6px; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; }
.toolbar-folder-settings-name { flex: 1; min-width: 0; display: grid; gap: 2px; }
.toolbar-folder-settings-name strong { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 14px; }
.toolbar-folder-settings-name span, .toolbar-folder-settings-hint { color: var(--muted-foreground); font-size: 12px; }
.toolbar-folder-settings-hint { margin: 0; line-height: 1.5; }
</style>
