<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, shallowRef, useTemplateRef, watch } from 'vue'
import { FolderOpen, FolderPlus, RefreshCw, X } from '@lucide/vue'

import { api, type DeviceFileEntry } from '@/api/client'

import type { StorageDirectoryTreeNode } from './storage-directory-tree'
import XpStorageTreeNode from './XpStorageTreeNode.vue'
import XpTransferDialog from './XpTransferDialog.vue'

const props = withDefaults(defineProps<{
  show: boolean
  title?: string
  confirmText?: string
  cancelText?: string
  rootLabel?: string
  initialPath?: string
  currentFolderLabel?: string
  refreshLabel?: string
  loadingText?: string
  emptyText?: string
  newFolderText?: string
  folderNameText?: string
  createFolderText?: string
  folderCreatedText?: string
  invalidFolderNameText?: string
}>(), {
  title: 'Select folder',
  confirmText: 'Select',
  cancelText: 'Cancel',
  rootLabel: '/mnt/storage',
  initialPath: '/mnt/storage',
  currentFolderLabel: 'Current folder',
  refreshLabel: 'Refresh',
  loadingText: 'Loading…',
  emptyText: 'This folder has no subfolders.',
  newFolderText: 'New folder',
  folderNameText: 'Folder name',
  createFolderText: 'Create',
  folderCreatedText: 'Folder created.',
  invalidFolderNameText: 'Enter a valid folder name.',
})

const emit = defineEmits<{
  'update:show': [show: boolean]
  select: [path: string]
}>()

const dialog = useTemplateRef<InstanceType<typeof XpTransferDialog>>('dialog')
const folderNameInput = useTemplateRef<HTMLInputElement>('folderNameInput')
const root = shallowRef<StorageDirectoryTreeNode | null>(null)
const selectedRelativePath = shallowRef('')
const loading = shallowRef(false)
const creating = shallowRef(false)
const creatingFolder = shallowRef(false)
const folderName = shallowRef('')
const error = shallowRef('')
const notice = shallowRef('')
const position = shallowRef<{ x: number; y: number } | null>(null)
let generation = 0
let dragging = false
let dragOffset = { x: 0, y: 0 }

const selectedPath = computed(() => selectedRelativePath.value
  ? `${props.rootLabel}/${selectedRelativePath.value}`
  : props.rootLabel)
const windowStyle = computed(() => position.value
  ? { position: 'fixed' as const, left: `${position.value.x}px`, top: `${position.value.y}px` }
  : undefined)
const folderNameValid = computed(() => {
  const name = folderName.value.trim()
  return Boolean(name) && name !== '.' && name !== '..' && name.length <= 255 && !/[\\/\0]/.test(name)
})

function relativePath(path: string) {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '')
  if (!normalized || normalized === props.rootLabel) return ''
  const prefix = `${props.rootLabel}/`
  return normalized.startsWith(prefix) ? normalized.slice(prefix.length) : ''
}

function joinPath(parent: string, name: string) {
  return parent ? `${parent}/${name}` : name
}

function updateNode(
  node: StorageDirectoryTreeNode,
  path: string,
  update: (current: StorageDirectoryTreeNode) => StorageDirectoryTreeNode,
): StorageDirectoryTreeNode {
  if (node.path === path) return update(node)
  if (!node.children) return node
  let changed = false
  const children = node.children.map((child) => {
    const next = updateNode(child, path, update)
    if (next !== child) changed = true
    return next
  })
  return changed ? { ...node, children } : node
}

function patchNode(path: string, patch: Partial<StorageDirectoryTreeNode>) {
  if (!root.value) return
  root.value = updateNode(root.value, path, (node) => ({ ...node, ...patch }))
}

function findNode(node: StorageDirectoryTreeNode | null, path: string): StorageDirectoryTreeNode | null {
  if (!node || node.path === path) return node
  for (const child of node.children || []) {
    const found = findNode(child, path)
    if (found) return found
  }
  return null
}

function childNode(entry: DeviceFileEntry, parentPath: string, previous?: StorageDirectoryTreeNode) {
  const path = joinPath(parentPath, entry.name)
  return previous?.path === path
    ? previous
    : { name: entry.name, path, expanded: false, loading: false, error: '', children: null }
}

async function loadChildren(path: string, expectedGeneration = generation) {
  patchNode(path, { loading: true, error: '' })
  try {
    const listing = await api.listDeviceFiles(path)
    if (expectedGeneration !== generation) return false
    const previous = new Map((findNode(root.value, path)?.children || []).map((node) => [node.name, node]))
    const children = listing.entries
      .filter((entry) => entry.directory)
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((entry) => childNode(entry, path, previous.get(entry.name)))
    patchNode(path, { children, loading: false, error: '' })
    return true
  } catch (reason) {
    if (expectedGeneration !== generation) return false
    patchNode(path, {
      children: [],
      loading: false,
      error: reason instanceof Error ? reason.message : String(reason),
    })
    return false
  }
}

async function initializeTree() {
  const expectedGeneration = ++generation
  loading.value = true
  error.value = ''
  notice.value = ''
  selectedRelativePath.value = ''
  root.value = {
    name: props.rootLabel,
    path: '',
    expanded: true,
    loading: false,
    error: '',
    children: null,
  }
  try {
    if (!await loadChildren('', expectedGeneration)) return
    let path = ''
    for (const part of relativePath(props.initialPath).split('/').filter(Boolean)) {
      const nextPath = joinPath(path, part)
      if (!findNode(root.value, nextPath)) break
      path = nextPath
      patchNode(path, { expanded: true })
      await loadChildren(path, expectedGeneration)
      if (expectedGeneration !== generation) return
    }
    selectedRelativePath.value = path
  } finally {
    if (expectedGeneration === generation) loading.value = false
  }
}

function selectNode(path: string) {
  selectedRelativePath.value = path
  error.value = ''
  notice.value = ''
}

async function toggleNode(path: string) {
  const node = findNode(root.value, path)
  if (!node || node.loading) return
  const expanded = !node.expanded
  patchNode(path, { expanded })
  if (expanded && node.children === null) await loadChildren(path)
}

async function refreshSelected() {
  if (loading.value || creatingFolder.value) return
  notice.value = ''
  await loadChildren(selectedRelativePath.value)
}

async function beginCreateFolder() {
  folderName.value = ''
  error.value = ''
  notice.value = ''
  creating.value = true
  await nextTick()
  folderNameInput.value?.focus()
}

function cancelCreateFolder() {
  creating.value = false
  folderName.value = ''
}

async function createFolder() {
  if (!folderNameValid.value || creatingFolder.value) {
    if (!folderNameValid.value) error.value = props.invalidFolderNameText
    return
  }
  const name = folderName.value.trim()
  const path = joinPath(selectedRelativePath.value, name)
  creatingFolder.value = true
  error.value = ''
  notice.value = ''
  try {
    await api.createDeviceDirectory(path)
    patchNode(selectedRelativePath.value, { expanded: true })
    await loadChildren(selectedRelativePath.value)
    selectedRelativePath.value = path
    creating.value = false
    folderName.value = ''
    notice.value = props.folderCreatedText
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    creatingFolder.value = false
  }
}

function close() {
  generation += 1
  emit('update:show', false)
}

function selectCurrent() {
  emit('select', selectedPath.value)
  close()
}

function clampPosition() {
  const element = dialog.value?.windowElement
  if (!element || !position.value) return
  const bounds = element.getBoundingClientRect()
  position.value = {
    x: Math.max(8, Math.min(window.innerWidth - bounds.width - 8, position.value.x)),
    y: Math.max(8, Math.min(window.innerHeight - bounds.height - 8, position.value.y)),
  }
}

function startDrag(event: PointerEvent) {
  const element = dialog.value?.windowElement
  if (event.button !== 0 || !element || (event.target as Element).closest('button')) return
  const bounds = element.getBoundingClientRect()
  position.value = { x: bounds.left, y: bounds.top }
  dragOffset = { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
  dragging = true
  window.addEventListener('pointermove', moveDrag)
  window.addEventListener('pointerup', stopDrag, { once: true })
  window.addEventListener('pointercancel', stopDrag, { once: true })
  event.preventDefault()
}

function moveDrag(event: PointerEvent) {
  if (!dragging) return
  position.value = {
    x: event.clientX - dragOffset.x,
    y: event.clientY - dragOffset.y,
  }
  clampPosition()
}

function stopDrag() {
  dragging = false
  window.removeEventListener('pointermove', moveDrag)
  window.removeEventListener('pointerup', stopDrag)
  window.removeEventListener('pointercancel', stopDrag)
}

watch(() => props.show, async (show) => {
  if (!show) {
    stopDrag()
    generation += 1
    return
  }
  position.value = null
  creating.value = false
  await initializeTree()
  await nextTick()
  dialog.value?.windowElement?.focus()
})

onBeforeUnmount(() => {
  generation += 1
  stopDrag()
})
</script>

<template>
  <XpTransferDialog
    ref="dialog"
    :show="show"
    :dialog-label="title"
    :window-style="windowStyle"
    :show-animation="false"
    @title-pointerdown="startDrag"
  >
    <template #title>
      <FolderOpen :size="15" aria-hidden="true" />{{ title }}
    </template>
    <template #title-actions>
      <button class="xp-picker-close" type="button" :title="cancelText" :aria-label="cancelText" @click="close">
        <X :size="15" :stroke-width="3" aria-hidden="true" />
      </button>
    </template>
    <template #default>
      <div class="xp-picker-toolbar">
        <button type="button" :disabled="loading || creatingFolder" @click="beginCreateFolder">
          <FolderPlus :size="16" aria-hidden="true" />{{ newFolderText }}
        </button>
        <button type="button" :title="refreshLabel" :aria-label="refreshLabel" :disabled="loading || creatingFolder" @click="refreshSelected">
          <RefreshCw :size="14" aria-hidden="true" />{{ refreshLabel }}
        </button>
      </div>

      <div class="xp-picker-path-row">
        <span>{{ currentFolderLabel }}:</span>
        <strong :title="selectedPath">{{ selectedPath }}</strong>
      </div>

      <form v-if="creating" class="xp-picker-create" @submit.prevent="createFolder">
        <label for="xp-picker-folder-name">{{ folderNameText }}:</label>
        <input
          id="xp-picker-folder-name"
          ref="folderNameInput"
          v-model="folderName"
          maxlength="255"
          :disabled="creatingFolder"
          @keydown.esc.prevent="cancelCreateFolder"
        >
        <button type="submit" :disabled="!folderNameValid || creatingFolder">{{ createFolderText }}</button>
        <button type="button" :disabled="creatingFolder" @click="cancelCreateFolder">{{ cancelText }}</button>
      </form>

      <div class="xp-picker-tree" :aria-busy="loading">
        <div v-if="loading && !root" class="xp-picker-state">{{ loadingText }}</div>
        <ul v-else-if="root" class="xp-picker-tree-root" role="tree" :aria-label="title">
          <XpStorageTreeNode
            :node="root"
            :selected-path="selectedRelativePath"
            :level="1"
            :disabled="creatingFolder"
            @select="selectNode"
            @toggle="toggleNode"
          />
        </ul>
        <div v-else class="xp-picker-state">{{ emptyText }}</div>
      </div>

      <p v-if="error" class="xp-picker-feedback xp-picker-error" role="alert">{{ error }}</p>
      <p v-else-if="notice" class="xp-picker-feedback" role="status">{{ notice }}</p>

      <footer class="xp-upload-actions xp-picker-actions">
        <button type="button" :disabled="loading || creatingFolder" @click="selectCurrent">{{ confirmText }}</button>
        <button type="button" @click="close">{{ cancelText }}</button>
      </footer>
    </template>
  </XpTransferDialog>
</template>

<style scoped>
.xp-picker-close { display: grid !important; border: 1px solid #fff !important; border-radius: 3px !important; background: linear-gradient(135deg, #e8846b 0%, #d9422f 46%, #b7190b 100%) !important; box-shadow: inset 1px 1px rgba(255, 255, 255, .55), inset -1px -1px rgba(91, 0, 0, .45) !important; color: #fff; place-items: center; }
.xp-picker-close:hover { background: linear-gradient(135deg, #ffad95 0%, #ef5a43 46%, #c52110 100%) !important; }
.xp-picker-close:active { background: linear-gradient(135deg, #a8170b 0%, #d83c28 100%) !important; box-shadow: inset 1px 1px rgba(77, 0, 0, .55) !important; }
.xp-picker-toolbar { display: flex; gap: 4px; padding: 2px; border: 1px solid #aca899; background: #f1efe2; }
.xp-picker-toolbar button { display: inline-flex; min-height: 27px; align-items: center; gap: 5px; padding: 2px 7px; border: 1px solid transparent; background: transparent; color: #111; font: 11px Tahoma, "Noto Sans SC", sans-serif; }
.xp-picker-toolbar button:not(:disabled):hover { border-color: #316ac5; background: #dbeaff; }
.xp-picker-toolbar svg { color: #bd8010; }
.xp-picker-path-row { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 6px; color: #444; font: 11px Tahoma, "Noto Sans SC", sans-serif; }
.xp-picker-path-row strong { overflow: hidden; color: #16365c; font-weight: 400; text-overflow: ellipsis; white-space: nowrap; }
.xp-picker-create { display: grid; grid-template-columns: auto minmax(80px, 1fr) auto auto; align-items: center; gap: 5px; padding: 6px; border: 1px solid #aca899; background: #f7f5e9; font: 11px Tahoma, "Noto Sans SC", sans-serif; }
.xp-picker-create input { min-width: 0; height: 23px; padding: 1px 4px; border: 1px solid #7f9db9; background: #fff; color: #111; font: inherit; }
.xp-picker-create input:focus { outline: 1px solid #316ac5; outline-offset: -2px; }
.xp-picker-create button { min-height: 24px; }
.xp-picker-tree { min-height: 260px; max-height: min(46vh, 390px); overflow: auto; padding: 4px; border: 1px solid #7f9db9; background: #fff; box-shadow: inset 1px 1px #d2d2d2; }
.xp-picker-tree-root { min-width: max-content; margin: 0; padding: 0; }
.xp-picker-state { display: grid; min-height: 250px; color: #555; place-items: center; text-align: center; }
.xp-picker-feedback { min-height: 16px; margin: -4px 0 0; color: #2d6b18; font: 11px Tahoma, "Noto Sans SC", sans-serif; }
.xp-picker-error { color: #a40000; }
.xp-picker-actions { padding-top: 0; }
@media (max-width: 520px) { .xp-picker-create { grid-template-columns: auto minmax(0, 1fr); } .xp-picker-create button { grid-row: 2; } }
</style>
