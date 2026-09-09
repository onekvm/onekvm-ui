<script setup lang="ts">
import { Download, File, FilePenLine, Folder, Pencil, Trash2 } from '@lucide/vue'

import type { DeviceFileEntry } from '@/api/client'
import { currentLanguage, t } from '@/i18n/runtime'

defineProps<{
  entries: DeviceFileEntry[]
  disabled: boolean
  downloadUrl: (entry: DeviceFileEntry) => string
}>()

const emit = defineEmits<{
  open: [entry: DeviceFileEntry]
  edit: [entry: DeviceFileEntry]
  rename: [entry: DeviceFileEntry]
  delete: [entry: DeviceFileEntry]
}>()

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  const units = ['KiB', 'MiB', 'GiB', 'TiB']
  let size = value
  let unit = -1
  do {
    size /= 1024
    unit += 1
  } while (size >= 1024 && unit < units.length - 1)
  return `${size >= 10 ? size.toFixed(1) : size.toFixed(2)} ${units[unit]}`
}

function formatModified(seconds: number) {
  return new Intl.DateTimeFormat(currentLanguage.value.replace('_', '-'), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(seconds * 1000))
}

function formatMode(mode: number) {
  return mode.toString(8).padStart(3, '0')
}
</script>

<template>
  <div class="file-list-shell">
    <table v-if="entries.length" class="file-list">
      <thead>
        <tr>
          <th>{{ t('settings.advancedSettings.fileManager.name', 'Name') }}</th>
          <th>{{ t('settings.advancedSettings.fileManager.owner', 'Owner') }}</th>
          <th>{{ t('settings.advancedSettings.fileManager.size', 'Size') }}</th>
          <th>{{ t('settings.advancedSettings.fileManager.modified', 'Modified') }}</th>
          <th>{{ t('settings.advancedSettings.fileManager.mode', 'Mode') }}</th>
          <th><span class="sr-only">{{ t('settings.advancedSettings.fileManager.actions', 'Actions') }}</span></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="entry in entries" :key="entry.name">
          <td>
            <button
              type="button"
              class="file-name"
              :class="{ directory: entry.directory }"
              :disabled="disabled || !entry.directory"
              @click="emit('open', entry)"
            >
              <Folder v-if="entry.directory" :size="18" aria-hidden="true" />
              <File v-else :size="18" aria-hidden="true" />
              <span>{{ entry.name }}</span>
            </button>
          </td>
          <td class="file-owner">{{ entry.owner }}</td>
          <td class="file-size">{{ entry.directory ? '—' : formatBytes(entry.size) }}</td>
          <td class="file-modified">{{ formatModified(entry.modified) }}</td>
          <td class="file-mode">{{ formatMode(entry.mode) }}</td>
          <td>
            <div class="file-row-actions">
              <n-tooltip v-if="!entry.directory">
                <template #trigger>
                  <n-button
                    quaternary
                    circle
                    :disabled="disabled"
                    :aria-label="`${t('settings.advancedSettings.fileManager.edit', 'Edit')} ${entry.name}`"
                    @click="emit('edit', entry)"
                  >
                    <template #icon><FilePenLine /></template>
                  </n-button>
                </template>
                {{ t('settings.advancedSettings.fileManager.edit', 'Edit') }}
              </n-tooltip>
              <n-tooltip v-if="!entry.directory">
                <template #trigger>
                  <n-button
                    tag="a"
                    quaternary
                    circle
                    :href="downloadUrl(entry)"
                    :download="entry.name"
                    :aria-label="`${t('common.download', 'Download')} ${entry.name}`"
                  >
                    <template #icon><Download /></template>
                  </n-button>
                </template>
                {{ t('common.download', 'Download') }}
              </n-tooltip>
              <n-tooltip>
                <template #trigger>
                  <n-button
                    quaternary
                    circle
                    :disabled="disabled"
                    :aria-label="`${t('settings.advancedSettings.fileManager.rename', 'Rename')} ${entry.name}`"
                    @click="emit('rename', entry)"
                  >
                    <template #icon><Pencil /></template>
                  </n-button>
                </template>
                {{ t('settings.advancedSettings.fileManager.rename', 'Rename') }}
              </n-tooltip>
              <n-tooltip>
                <template #trigger>
                  <n-button
                    quaternary
                    circle
                    type="error"
                    :disabled="disabled"
                    :aria-label="`${t('common.delete', 'Delete')} ${entry.name}`"
                    @click="emit('delete', entry)"
                  >
                    <template #icon><Trash2 /></template>
                  </n-button>
                </template>
                {{ t('common.delete', 'Delete') }}
              </n-tooltip>
            </div>
          </td>
        </tr>
      </tbody>
    </table>

    <n-empty
      v-else
      class="file-list-empty"
      :description="t('settings.advancedSettings.fileManager.empty', 'This folder is empty')"
    />
  </div>
</template>

<style scoped>
.file-list-shell {
  min-height: 280px;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-large);
  background: var(--card);
}

.file-list {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.file-list th {
  height: 38px;
  padding: 0 12px;
  border-bottom: 1px solid var(--border);
  color: var(--muted-foreground);
  background: var(--muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .02em;
  text-align: left;
  text-transform: uppercase;
}

.file-list th:first-child { width: 32%; }
.file-list th:nth-child(2) { width: 11%; }
.file-list th:nth-child(3) { width: 11%; }
.file-list th:nth-child(4) { width: 20%; }
.file-list th:nth-child(5) { width: 7%; }
.file-list th:last-child { width: 152px; }

.file-list td {
  height: 48px;
  padding: 4px 12px;
  border-bottom: 1px solid var(--border);
  color: var(--onekvm-text-secondary);
  font-size: 12px;
}

.file-list tbody tr:last-child td { border-bottom: 0; }
.file-list tbody tr:hover td { background: color-mix(in srgb, var(--accent) 66%, transparent); }

.file-name {
  display: flex;
  width: 100%;
  min-height: 40px;
  min-width: 0;
  align-items: center;
  gap: 10px;
  padding: 0;
  border: 0;
  color: var(--foreground);
  background: transparent;
  text-align: left;
}

.file-name.directory { cursor: pointer; }
.file-name:not(.directory) { cursor: default; }
.file-name > svg { flex: 0 0 auto; color: var(--muted-foreground); }
.file-name.directory > svg { color: var(--primary); }
.file-name > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-size,
.file-modified,
.file-mode { font-variant-numeric: tabular-nums; }
.file-size,
.file-mode { font-family: var(--onekvm-font-mono); }
.file-owner { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-mode { color: var(--muted-foreground) !important; }

.file-row-actions {
  display: flex;
  justify-content: flex-end;
  gap: 2px;
  opacity: .68;
  transition: opacity 120ms ease-out;
}

.file-list tr:hover .file-row-actions,
.file-row-actions:focus-within { opacity: 1; }
.file-list-empty { min-height: 278px; justify-content: center; }

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 720px) {
  .file-list th,
  .file-list td { padding-inline: 8px; }
  .file-list th:first-child { width: 48%; }
  .file-list th:last-child { width: 52%; }
  .file-list th:nth-child(2),
  .file-list th:nth-child(3),
  .file-list th:nth-child(4),
  .file-list th:nth-child(5),
  .file-list td:nth-child(2),
  .file-list td:nth-child(3),
  .file-list td:nth-child(4),
  .file-list td:nth-child(5) { display: none; }
  .file-row-actions { gap: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .file-row-actions { transition: none; }
}
</style>
