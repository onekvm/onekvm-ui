<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { api, type SystemUpdateLocalFile, type SystemUpdateSource } from '@/api/client'
import { t } from '@/i18n/runtime'

export type UpdateMethod = 'github' | 'http' | 'tftp' | 'nfs' | 'local' | 'upload'

defineProps<{ disabled: boolean }>()
const emit = defineEmits<{ install: [source: SystemUpdateSource] }>()
const method = defineModel<UpdateMethod>({ required: true })
defineSlots<{ github(): unknown; upload(): unknown; error(): unknown }>()

const httpUrl = shallowRef('')
const tftpServer = shallowRef('')
const tftpPath = shallowRef('')
const tftpPort = shallowRef<number | null>(69)
const nfsServer = shallowRef('')
const nfsExport = shallowRef('')
const nfsPath = shallowRef('')
const localPath = shallowRef<string | null>(null)
const localFiles = shallowRef<SystemUpdateLocalFile[]>([])
const localLoading = shallowRef(false)
const localError = shallowRef('')

const methods = computed(() => [
  { value: 'github', label: t('settings.advancedSettings.systemPage.sourceGithub', 'GitHub 在线升级') },
  { value: 'http', label: t('settings.advancedSettings.systemPage.sourceHttp', 'HTTP 地址') },
  { value: 'tftp', label: t('settings.advancedSettings.systemPage.sourceTftp', 'TFTP') },
  { value: 'nfs', label: t('settings.advancedSettings.systemPage.sourceNfs', 'NFS') },
  { value: 'local', label: t('settings.advancedSettings.systemPage.sourceLocal', '本地文件') },
  { value: 'upload', label: t('settings.advancedSettings.systemPage.sourceUpload', '上传文件') },
] as const)

const localOptions = computed(() => localFiles.value.map(file => ({
  label: `${file.name} · ${(file.size / 1048576).toFixed(1)} MiB`,
  value: file.path,
})))

const request = computed<SystemUpdateSource | null>(() => {
  if (method.value === 'http') {
    const url = httpUrl.value.trim()
    if (!/^https?:\/\/[^\s]+$/i.test(url)) return null
    return { source: 'http', url }
  }
  if (method.value === 'tftp') {
    const server = tftpServer.value.trim()
    const path = tftpPath.value.trim()
    if (!server || !path.endsWith('.fwup') || !tftpPort.value || tftpPort.value < 1 || tftpPort.value > 65535) return null
    return { source: 'tftp', server, path, port: tftpPort.value }
  }
  if (method.value === 'nfs') {
    const server = nfsServer.value.trim()
    const exportPath = nfsExport.value.trim()
    const path = nfsPath.value.trim()
    if (!server || !exportPath.startsWith('/') || !path.endsWith('.fwup')) return null
    return { source: 'nfs', server, export: exportPath, path }
  }
  if (method.value === 'local' && localPath.value) return { source: 'local', path: localPath.value }
  return null
})

async function loadLocalFiles() {
  localLoading.value = true
  localError.value = ''
  try {
    localFiles.value = (await api.getSystemUpdateFiles()).files
    if (!localFiles.value.some(file => file.path === localPath.value)) localPath.value = null
  } catch (error) {
    localFiles.value = []
    localError.value = error instanceof Error ? error.message : String(error)
  } finally {
    localLoading.value = false
  }
}

watch(method, value => { if (value === 'local') void loadLocalFiles() }, { immediate: true })

function install() {
  if (request.value) emit('install', request.value)
}
</script>

<template>
  <div class="update-sources">
    <div class="update-source-menu">
      <div class="update-sources-label">{{ t('settings.advancedSettings.systemPage.updateMethod', '升级方式') }}</div>
      <n-radio-group v-model:value="method" name="system-update-method" :disabled="disabled" class="update-source-radios">
        <n-radio v-for="option in methods" :key="option.value" :value="option.value">{{ option.label }}</n-radio>
      </n-radio-group>
    </div>
    <div class="update-source-detail">
      <slot name="error" />
      <slot v-if="method === 'github'" name="github" />
      <slot v-else-if="method === 'upload'" name="upload" />

    <div v-else-if="method === 'http'" class="update-source-form">
      <label for="system-update-http">{{ t('settings.advancedSettings.systemPage.httpUrl', '升级包 URL') }}</label>
      <n-input id="system-update-http" v-model:value="httpUrl" type="text" placeholder="https://example.com/update.fwup" :disabled="disabled" />
    </div>
    <div v-else-if="method === 'tftp'" class="update-source-form">
      <label for="system-update-tftp-server">{{ t('settings.advancedSettings.systemPage.server', '服务器') }}</label>
      <n-input id="system-update-tftp-server" v-model:value="tftpServer" placeholder="192.168.1.10" :disabled="disabled" />
      <label for="system-update-tftp-port">{{ t('settings.advancedSettings.systemPage.port', '端口') }}</label>
      <n-input-number id="system-update-tftp-port" v-model:value="tftpPort" :min="1" :max="65535" :disabled="disabled" />
      <label for="system-update-tftp-path">{{ t('settings.advancedSettings.systemPage.remoteFile', '远程文件') }}</label>
      <n-input id="system-update-tftp-path" v-model:value="tftpPath" placeholder="releases/update.fwup" :disabled="disabled" />
    </div>
    <div v-else-if="method === 'nfs'" class="update-source-form">
      <label for="system-update-nfs-server">{{ t('settings.advancedSettings.systemPage.server', '服务器') }}</label>
      <n-input id="system-update-nfs-server" v-model:value="nfsServer" placeholder="192.168.1.10" :disabled="disabled" />
      <label for="system-update-nfs-export">{{ t('settings.advancedSettings.systemPage.nfsExport', '共享目录') }}</label>
      <n-input id="system-update-nfs-export" v-model:value="nfsExport" placeholder="/srv/updates" :disabled="disabled" />
      <label for="system-update-nfs-path">{{ t('settings.advancedSettings.systemPage.remoteFile', '远程文件') }}</label>
      <n-input id="system-update-nfs-path" v-model:value="nfsPath" placeholder="update.fwup" :disabled="disabled" />
    </div>
    <div v-else-if="method === 'local'" class="update-source-form">
      <label>{{ t('settings.advancedSettings.systemPage.localBundle', '/mnt/storage 中的升级包') }}</label>
      <div class="update-local-picker">
        <n-select v-model:value="localPath" :options="localOptions" :loading="localLoading" :disabled="disabled" :placeholder="t('settings.advancedSettings.systemPage.selectLocalBundle', '选择 .fwup 文件')" filterable />
        <n-button secondary :loading="localLoading" :disabled="disabled" @click="loadLocalFiles">{{ t('common.refresh', '刷新') }}</n-button>
      </div>
      <n-alert v-if="localError" type="error" :bordered="false">{{ localError }}</n-alert>
      <span v-else-if="!localLoading && localFiles.length === 0" class="update-source-hint">{{ t('settings.advancedSettings.systemPage.noLocalBundles', '/mnt/storage 中没有 .fwup 升级包') }}</span>
    </div>
    <div v-if="method !== 'github' && method !== 'upload'" class="update-source-actions">
      <n-button type="primary" :disabled="disabled || !request" @click="install">{{ t('settings.advancedSettings.systemPage.install', '安装') }}</n-button>
    </div>
    </div>
  </div>
</template>

<style scoped>
.update-sources { display: grid; grid-template-columns: minmax(190px, 230px) minmax(0, 1fr); min-width: 0; }
.update-source-menu { display: grid; align-content: start; gap: 12px; padding: 20px 16px 20px 20px; border-right: 1px solid var(--border); }
.update-sources-label { color: var(--foreground); font-size: 13px; font-weight: 650; }
.update-source-radios { display: grid; grid-template-columns: minmax(0, 1fr); gap: 2px; }
.update-source-radios :deep(.n-radio) { min-width: 0; margin: 0; padding: 8px 10px; border-radius: 7px; transition: background-color 150ms ease-out; }
.update-source-radios :deep(.n-radio:hover), .update-source-radios :deep(.n-radio--checked) { background: color-mix(in srgb, var(--primary) 8%, var(--card)); }
.update-source-radios :deep(.n-radio:not(.n-radio--disabled) .n-radio__dot) { background: #fff; }
.update-source-detail { display: grid; align-content: start; gap: 16px; min-width: 0; padding: 20px 22px; }
.update-source-form { display: grid; grid-template-columns: minmax(100px, 150px) minmax(0, 1fr); gap: 12px; align-items: center; }
.update-source-form label { color: var(--muted-foreground); font-size: 12px; }
.update-local-picker { display: flex; gap: 8px; min-width: 0; }
.update-local-picker :deep(.n-select) { min-width: 0; flex: 1; }
.update-source-hint { color: var(--muted-foreground); font-size: 12px; }
.update-source-actions { display: flex; justify-content: flex-start; }
@media (max-width: 680px) {
  .update-sources { grid-template-columns: minmax(0, 1fr); }
  .update-source-menu { padding: 14px 16px; border-right: 0; border-bottom: 1px solid var(--border); }
  .update-source-radios { grid-template-columns: minmax(0, 1fr); }
  .update-source-detail { padding: 16px; }
  .update-source-form { grid-template-columns: 1fr; }
}
</style>
