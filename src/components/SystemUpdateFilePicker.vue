<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, shallowRef, useTemplateRef, watch } from 'vue'
import { ArrowUp, Check, ChevronRight, FileUp, Folder, RefreshCw } from '@/icons'
import { api, type DeviceFileEntry, type DeviceFileListing, type SystemUpdateLocalFile } from '@/api/client'
import { t } from '@/i18n/runtime'

const props = defineProps<{ selected: SystemUpdateLocalFile | null; disabled: boolean }>()
const show = defineModel<boolean>('show', { required: true })
const emit = defineEmits<{ select: [file: SystemUpdateLocalFile] }>()

const currentPath = shallowRef('')
const listing = shallowRef<DeviceFileListing | null>(null)
const loading = shallowRef(false)
const error = shallowRef('')
const selection = shallowRef<SystemUpdateLocalFile | null>(null)
const breadcrumbNav = useTemplateRef<HTMLElement>('breadcrumbNav')
let requestId = 0

const root = computed(() => listing.value?.root || '/mnt/storage')
const entries = computed(() => (listing.value?.entries || []).filter(entry => entry.directory || entry.name.endsWith('.fwup')))
const breadcrumbs = computed(() => {
  const parts = currentPath.value.split('/').filter(Boolean)
  return [
    { label: root.value, path: '' },
    ...parts.map((label, index) => ({ label, path: parts.slice(0, index + 1).join('/') })),
  ]
})
const parentPath = computed(() => currentPath.value.split('/').slice(0, -1).join('/'))
const blocked = computed(() => loading.value || props.disabled)

function relativePath(name: string) {
  return currentPath.value ? `${currentPath.value}/${name}` : name
}

function absolutePath(entry: DeviceFileEntry) {
  return `${root.value}/${relativePath(entry.name)}`
}

function formatSize(size: number) {
  if (size < 1024) return `${size} B`
  const units = ['KiB', 'MiB', 'GiB', 'TiB']
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)) - 1, units.length - 1)
  return `${Number((size / 1024 ** (index + 1)).toFixed(1))} ${units[index]}`
}

async function load(path = currentPath.value) {
  const id = ++requestId
  loading.value = true
  error.value = ''
  selection.value = null
  try {
    const result = await api.listDeviceFiles(path)
    if (id !== requestId) return
    listing.value = result
    currentPath.value = result.path
    const selectedEntry = entries.value.find(entry => !entry.directory && absolutePath(entry) === props.selected?.path)
    if (selectedEntry) selectEntry(selectedEntry)
    await nextTick()
    if (id === requestId && breadcrumbNav.value) breadcrumbNav.value.scrollLeft = breadcrumbNav.value.scrollWidth
  } catch (reason) {
    if (id !== requestId) return
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    if (id === requestId) loading.value = false
  }
}

function selectEntry(entry: DeviceFileEntry) {
  selection.value = { path: absolutePath(entry), name: entry.name, size: entry.size }
}

function openEntry(entry: DeviceFileEntry) {
  if (blocked.value) return
  if (entry.directory) void load(relativePath(entry.name))
  else selectEntry(entry)
}

function confirm() {
  if (!selection.value || blocked.value || error.value) return
  emit('select', selection.value)
  show.value = false
}

watch(show, visible => {
  if (visible) void load()
  else {
    requestId++
    loading.value = false
  }
})
watch(() => props.disabled, disabled => { if (disabled) show.value = false })
onBeforeUnmount(() => { requestId++ })
</script>

<template>
  <n-modal v-model:show="show" preset="card" class="update-file-picker"
    :title="t('settings.advancedSettings.systemPage.selectLocalBundle', 'Select a .fwup file')"
    style="width: min(640px, calc(100vw - 28px))">
    <div class="update-file-navigation">
      <n-button quaternary circle :disabled="blocked || !currentPath"
        :aria-label="t('settings.advancedSettings.systemPage.parentFolder', 'Up one folder')" @click="load(parentPath)">
        <template #icon><ArrowUp /></template>
      </n-button>
      <nav ref="breadcrumbNav" class="update-file-breadcrumbs" :aria-label="t('settings.advancedSettings.fileManager.path', 'Current path')">
        <template v-for="(item, index) in breadcrumbs" :key="item.path">
          <ChevronRight v-if="index" :size="14" aria-hidden="true" />
          <button type="button" :disabled="blocked || index === breadcrumbs.length - 1"
            :aria-current="index === breadcrumbs.length - 1 ? 'location' : undefined" @click="load(item.path)">{{ item.label }}</button>
        </template>
      </nav>
      <n-button quaternary circle :disabled="blocked" :aria-label="t('common.refresh', 'Refresh')" @click="load()">
        <template #icon><RefreshCw /></template>
      </n-button>
    </div>

    <n-spin :show="loading" class="update-file-content" :aria-busy="loading">
      <n-alert v-if="error" type="error" :bordered="false" role="alert">{{ error }}</n-alert>
      <div v-else-if="!loading && entries.length === 0" class="update-file-empty" role="status">
        <Folder :size="28" aria-hidden="true" />
        <span>{{ t('settings.advancedSettings.systemPage.noLocalBundles', 'No .fwup bundles in this folder') }}</span>
      </div>
      <ul v-else class="update-file-list">
        <li v-for="entry in entries" :key="entry.name">
          <button type="button" class="update-file-entry" :class="{ selected: !entry.directory && selection?.path === absolutePath(entry) }"
            :disabled="blocked" :aria-pressed="entry.directory ? undefined : selection?.path === absolutePath(entry)"
            @click="openEntry(entry)" @dblclick="!entry.directory && confirm()">
            <Folder v-if="entry.directory" :size="20" class="update-folder-icon" aria-hidden="true" />
            <FileUp v-else :size="20" aria-hidden="true" />
            <span class="update-file-name" :title="entry.name">{{ entry.name }}</span>
            <ChevronRight v-if="entry.directory" :size="16" aria-hidden="true" />
            <template v-else>
              <span class="update-file-size">{{ formatSize(entry.size) }}</span>
              <Check v-if="selection?.path === absolutePath(entry)" :size="16" aria-hidden="true" />
              <span v-else class="update-file-check-space" />
            </template>
          </button>
        </li>
      </ul>
    </n-spin>

    <template #footer>
      <div class="update-file-footer">
        <span class="update-file-selection" :title="selection?.path" aria-live="polite">{{ selection?.name || t('settings.advancedSettings.systemPage.bundleFormat', 'Signed .fwup update package') }}</span>
        <div class="update-file-actions">
          <n-button @click="show = false">{{ t('common.cancel', 'Cancel') }}</n-button>
          <n-button type="primary" :disabled="blocked || !selection || !!error" @click="confirm">{{ t('settings.advancedSettings.systemPage.selectBundle', 'Select bundle') }}</n-button>
        </div>
      </div>
    </template>
  </n-modal>
</template>

<style scoped>
.update-file-navigation { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.update-file-navigation > :deep(.n-button) { flex-shrink: 0; }
.update-file-breadcrumbs { display: flex; flex: 1; min-width: 0; align-items: center; overflow-x: auto; scrollbar-width: thin; }
.update-file-breadcrumbs > svg { flex-shrink: 0; color: var(--muted-foreground); }
.update-file-breadcrumbs button { flex-shrink: 0; max-width: 220px; min-height: 36px; padding: 0 8px; overflow: hidden; border: 0; border-radius: var(--radius); color: var(--onekvm-text-secondary); background: transparent; font-family: var(--onekvm-font-mono); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.update-file-breadcrumbs button:hover:not(:disabled) { color: var(--foreground); background: var(--accent); }
.update-file-breadcrumbs button[aria-current] { color: var(--foreground); font-weight: 600; cursor: default; }
.update-file-content { min-height: min(220px, 35dvh); max-height: min(360px, 45dvh); overflow-y: auto; border: 1px solid var(--border); border-radius: var(--radius); }
.update-file-list { margin: 0; padding: 4px; list-style: none; }
.update-file-entry { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 44px; padding: 8px 12px; border: 0; border-radius: var(--radius); color: var(--foreground); background: transparent; text-align: left; cursor: pointer; }
.update-file-entry:hover:not(:disabled) { background: var(--accent); }
.update-file-entry.selected { background: color-mix(in srgb, var(--primary) 12%, var(--card)); }
.update-file-entry:focus-visible, .update-file-breadcrumbs button:focus-visible { outline: 2px solid var(--primary); outline-offset: -2px; }
.update-file-entry > svg { flex-shrink: 0; color: var(--muted-foreground); }
.update-file-entry .update-folder-icon, .update-file-entry.selected > svg { color: var(--primary); }
.update-file-name { flex: 1; min-width: 0; overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.update-file-size { flex-shrink: 0; color: var(--muted-foreground); font-size: 12px; font-variant-numeric: tabular-nums; }
.update-file-check-space { width: 16px; flex-shrink: 0; }
.update-file-empty { display: grid; min-height: min(220px, 35dvh); align-content: center; justify-items: center; gap: 12px; padding: 16px; color: var(--muted-foreground); text-align: center; font-size: 13px; }
.update-file-footer { display: flex; align-items: center; gap: 16px; }
.update-file-selection { flex: 1; min-width: 0; overflow: hidden; color: var(--muted-foreground); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.update-file-actions { display: flex; flex-shrink: 0; gap: 8px; }
@media (max-width: 480px) {
  .update-file-entry { gap: 8px; padding: 8px; }
  .update-file-footer { align-items: stretch; flex-direction: column; gap: 12px; }
  .update-file-actions { justify-content: flex-end; }
}
</style>
