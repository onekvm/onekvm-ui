<script setup lang="ts">
import { computed, type Component } from 'vue'
import { Folder, iconComponent } from '@/icons'
import type { PersonalizationConfig } from '@/api/client'
import { normalizeToolbarIcons, isToolbarIconId, isKeyboardActionToolbarIcon } from '@/lib/toolbar-icons'
import { isToolbarSeparator, normalizeToolbarFolders, toolbarAnyLabelShown, toolbarFolderFor, toolbarItemShowsLabel, toolbarLayoutOrder, visibleToolbarSeparators } from '@/lib/toolbar-layout'
import { toolbarIconGlyph, toolbarIconLabel } from '@/lib/toolbar-labels'
import { useToolboxContext, type ToolboxTool } from '@/composables/useToolbox'
import { USB_GAMEPAD_UI_ENABLED } from '@/lib/ui-features'
import ToolIcon from './toolbox/ToolIcon.vue'

interface PreviewItem { id: string; title: string; glyph: Component; tool: ToolboxTool | null; status: boolean }

const props = defineProps<{ config: PersonalizationConfig; username?: string }>()
const toolbox = useToolboxContext()
const items = computed(() => {
  const folders = normalizeToolbarFolders(props.config.toolbar_folders)
  const icons = normalizeToolbarIcons(props.config.toolbar_icons)
  const hasCollectedIcons = icons.some(icon => icon.hidden && !icon.removed && !isKeyboardActionToolbarIcon(icon.id) && (icon.id !== 'gamepad' || USB_GAMEPAD_UI_ENABLED))
  const rendered = toolbarLayoutOrder(props.config, toolbox.pinned.map(({ tool }) => tool.id)).flatMap<PreviewItem>(id => {
    if (toolbarFolderFor(folders, id)) return []
    if (isToolbarSeparator(id)) return [{ id, title: '', glyph: Folder, tool: null, status: false }]
    if (isToolbarIconId(id)) {
      if (id === 'collection' && !hasCollectedIcons) return []
      if (icons.find(icon => icon.id === id)?.hidden || (id === 'gamepad' && !USB_GAMEPAD_UI_ENABLED)) return []
      return [{ id, title: toolbarIconLabel(id), glyph: toolbarIconGlyph[id], tool: null, status: ['display', 'mouse', 'keyboard', 'power', 'audio', 'virtual_media'].includes(id) && !isKeyboardActionToolbarIcon(id) }]
    }
    const folder = folders.find(folder => `folder:${folder.id}` === id)
    if (folder) return [{ id, title: folder.name, glyph: iconComponent(folder.icon) || Folder, tool: null, status: false }]
    const pin = toolbox.pinned.find(({ tool }) => `tool:${tool.id}` === id)
    return pin ? [{ id, title: pin.tool.title, glyph: Folder, tool: pin.tool, status: false }] : []
  })
  const separators = new Set(visibleToolbarSeparators(rendered.map(item => item.id), new Set(rendered.filter(item => !isToolbarSeparator(item.id)).map(item => item.id))))
  return rendered.filter(item => !isToolbarSeparator(item.id) || separators.has(item.id))
})
const anyLabel = computed(() => toolbarAnyLabelShown(props.config, items.value.map(item => item.id)))
const showsLabel = (id: string) => toolbarItemShowsLabel(props.config, id)
</script>

<template>
  <div class="toolbar-layout-preview" :class="{ 'has-text-labels': anyLabel }" :data-toolbar-label-position="config.toolbar_label_position ?? 'right'" aria-hidden="true">
    <template v-for="item in items" :key="item.id">
    <div v-if="isToolbarSeparator(item.id)" class="toolbar-separator" />
    <n-button v-else quaternary size="small" tabindex="-1" :class="{ 'device-indicator': item.status, 'account-button': item.id === 'account' }" :data-toolbar-label="showsLabel(item.id) ? '' : undefined" data-state="ready">
      <template #icon><ToolIcon v-if="item.tool" :tool="item.tool" /><component :is="item.glyph" v-else /></template>
      <span v-if="item.id === 'account' && username" class="button-label account-name">{{ username }}</span>
      <span v-else-if="showsLabel(item.id)" class="toolbar-action-label">{{ item.title }}</span>
      <span v-if="item.status" class="device-led" />
    </n-button>
    </template>
  </div>
</template>

<style scoped>
.toolbar-layout-preview { display: flex; flex: none; align-items: center; gap: 4px; }
.toolbar-layout-preview :deep(.n-button) { flex-shrink: 0; padding: 0 6px; }
.toolbar-layout-preview :deep(.n-button__icon) { margin: 0; }
.toolbar-layout-preview :deep(.account-button .n-button__icon) { margin-right: 6px; }
.toolbar-layout-preview :deep(.n-button[data-toolbar-label] .n-button__icon) { margin-right: 6px; }
</style>
