<script setup lang="ts">
import { ChevronDown, ChevronRight, Folder, FolderOpen, LoaderCircle } from '@lucide/vue'

import type { StorageDirectoryTreeNode } from './storage-directory-tree'

const props = defineProps<{
  node: StorageDirectoryTreeNode
  selectedPath: string
  level: number
  disabled?: boolean
}>()

const emit = defineEmits<{
  select: [path: string]
  toggle: [path: string]
}>()

function select() {
  if (!props.disabled) emit('select', props.node.path)
}

function toggle() {
  if (!props.disabled) emit('toggle', props.node.path)
}
</script>

<template>
  <li class="xp-tree-item" role="none">
    <div
      class="xp-tree-row"
      :class="{ 'is-selected': node.path === selectedPath }"
      role="treeitem"
      :aria-level="level"
      :aria-expanded="node.expanded"
      :aria-selected="node.path === selectedPath"
    >
      <button
        class="xp-tree-toggle"
        type="button"
        tabindex="-1"
        :disabled="disabled || node.loading"
        :aria-label="node.expanded ? 'Collapse' : 'Expand'"
        @click="toggle"
      >
        <LoaderCircle v-if="node.loading" class="xp-tree-spinner" :size="12" aria-hidden="true" />
        <ChevronDown v-else-if="node.expanded" :size="12" aria-hidden="true" />
        <ChevronRight v-else :size="12" aria-hidden="true" />
      </button>
      <button
        class="xp-tree-label"
        type="button"
        :disabled="disabled"
        :title="node.name"
        @click="select"
        @dblclick="toggle"
      >
        <FolderOpen v-if="node.expanded" :size="17" aria-hidden="true" />
        <Folder v-else :size="17" aria-hidden="true" />
        <span>{{ node.name }}</span>
      </button>
    </div>
    <div v-if="node.error" class="xp-tree-error" role="alert">{{ node.error }}</div>
    <ul v-if="node.expanded && node.children?.length" class="xp-tree-group" role="group">
      <XpStorageTreeNode
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :selected-path="selectedPath"
        :level="level + 1"
        :disabled="disabled"
        @select="emit('select', $event)"
        @toggle="emit('toggle', $event)"
      />
    </ul>
  </li>
</template>

<style scoped>
.xp-tree-item { margin: 0; padding: 0; list-style: none; }
.xp-tree-row { display: flex; height: 23px; min-width: max-content; align-items: center; color: #111; }
.xp-tree-row.is-selected { background: #316ac5; color: #fff; }
.xp-tree-row:focus-within { outline: 1px dotted currentColor; outline-offset: -1px; }
.xp-tree-toggle { display: grid; width: 18px; min-width: 18px; height: 22px; padding: 0; border: 0; background: transparent; color: inherit; place-items: center; }
.xp-tree-toggle:disabled { color: inherit; }
.xp-tree-label { display: flex; min-width: 0; height: 23px; flex: 1; align-items: center; gap: 4px; padding: 0 5px 0 0; border: 0; background: transparent; color: inherit; font: 11px Tahoma, "Noto Sans SC", sans-serif; text-align: left; }
.xp-tree-label > svg { flex: 0 0 auto; color: #d59b16; }
.xp-tree-row.is-selected .xp-tree-label > svg { color: #ffd45c; }
.xp-tree-label > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.xp-tree-group { margin: 0 0 0 17px; padding: 0; }
.xp-tree-error { margin-left: 36px; color: #a40000; font: 10px Tahoma, "Noto Sans SC", sans-serif; }
.xp-tree-spinner { animation: xp-tree-spin .8s linear infinite; }
@keyframes xp-tree-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .xp-tree-spinner { animation: none; } }
</style>
