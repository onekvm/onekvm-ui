<script setup lang="ts">
import SystemUpdateError from './SystemUpdateError.vue'
import { computed, toRef, useTemplateRef } from 'vue'
import { NAlert, NButton } from 'naive-ui'
import { Upload } from '@/icons'
import type { SystemOnlineUpdateProgress } from '@/api/client'
import { useSystemUpdatePreflight } from '@/composables/useSystemUpdatePreflight'
import { t } from '@/i18n/runtime'

const props = defineProps<{ progress: SystemOnlineUpdateProgress | null; disabled: boolean }>()
const emit = defineEmits<{ install: []; cancel: [] }>()
const { plan, busy, error, visible, upload, commit, cancel } = useSystemUpdatePreflight(toRef(props, 'progress'))
const picker = useTemplateRef<HTMLInputElement>('picker')
const locked = computed(() => props.disabled || busy.value)
const metadataMissing = computed(() => plan.value?.missing?.some(item => item.reason === 'kernel_metadata_missing' || item.package === 'target-kernel-metadata'))
const missingPackages = computed(() => plan.value?.missing?.filter(item => item.reason !== 'kernel_metadata_missing' && item.package !== 'target-kernel-metadata') || [])
const key = 'settings.advancedSettings.systemPage.pluginUpdate.'

async function selectFiles(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  input.value = ''
  await upload(files)
}
async function install() {
  if (await commit()) emit('install')
}
async function discard() {
  if (await cancel()) emit('cancel')
}
</script>

<template>
  <n-alert v-if="plan?.phase === 'failed' && plan.error" type="error" :bordered="false" role="alert"><SystemUpdateError :error="plan.error" /></n-alert>
  <section v-if="visible && plan" class="system-settings-group" aria-live="polite">
    <h2>{{ t(key + 'title', 'Pre-update check') }}</h2>
    <div class="plugin-update-panel">
      <div class="plugin-update-kernels">
        <div v-if="plan.target_build" class="plugin-update-build-id"><span>{{ t('settings.advancedSettings.systemPage.targetBuildId', 'Target build ID') }}</span><code>{{ plan.target_build }}</code></div>
        <div><span>{{ t(key + 'currentKernel', 'Current kernel version') }}</span><code>{{ plan.current_kernel }}</code></div>
        <div><span>{{ t(key + 'targetKernel', 'Kernel version after update') }}</span><code>{{ plan.target_kernel }}</code></div>
      </div>
      <n-alert v-if="plan.allow_untrusted" type="warning" :bordered="false">{{ t('settings.advancedSettings.systemPage.untrustedFirmwareHint', 'Accept a signer outside the built-in trust store for this update only. Firmware format, signature integrity, data integrity and model checks still apply. Only install firmware from a source you trust.') }}</n-alert>
      <p>{{ t(key + 'hint', 'This update changes the kernel, so plugin dependencies must be checked first. Required packages will be installed automatically on the first boot of the new system, before OneKVM and plugins start.') }}</p>
      <n-alert v-if="error" type="error" :bordered="false"><SystemUpdateError :error="error" /></n-alert>
      <n-alert v-if="metadataMissing" type="error" :bordered="false"><SystemUpdateError error="target-kernel-metadata" /></n-alert>
      <template v-if="missingPackages.length">
        <strong>{{ t(key + 'missing', 'Packages to upload') }}</strong>
        <ul class="plugin-update-packages">
          <li v-for="item in missingPackages" :key="item.package"><code>{{ item.package }}</code><span>{{ item.plugin }}</span></li>
        </ul>
      </template>
      <n-alert v-else-if="!metadataMissing" type="success" :bordered="false">{{ t(key + 'ready', 'All required packages are ready. You can continue the update.') }}</n-alert>
      <template v-if="plan.packages?.length">
        <strong>{{ t(key + 'staged', 'Uploaded packages') }}</strong>
        <ul class="plugin-update-packages">
          <li v-for="item in plan.packages" :key="item.name"><code>{{ item.name }}</code><span>{{ item.version }}</span></li>
        </ul>
      </template>
      <p v-if="!metadataMissing">{{ t(key + 'uploadHint', 'Upload plugin or kernel module packages (.ipk or .ipks), up to 32 MiB per file.') }}</p>
      <input ref="picker" class="system-update-input" type="file" accept=".ipk,.ipks" multiple :disabled="locked" :aria-label="t(key + 'upload', 'Upload packages')" @change="selectFiles" />
      <div class="plugin-update-actions">
        <n-button v-if="!metadataMissing" secondary :disabled="locked" :loading="busy" @click="picker?.click()"><template #icon><Upload /></template>{{ t(key + 'upload', 'Upload packages') }}</n-button>
        <n-button type="primary" :disabled="locked || !plan.ready" @click="install">{{ t(key + 'continue', 'Continue update') }}</n-button>
        <n-button quaternary :disabled="locked" @click="discard">{{ t(key + 'cancel', 'Cancel this update') }}</n-button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.plugin-update-panel { display: grid; gap: 14px; }
.plugin-update-kernels { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.plugin-update-kernels > div { display: grid; gap: 5px; }
.plugin-update-build-id { grid-column: 1 / -1; }
.plugin-update-kernels span, .plugin-update-packages span { color: var(--muted-foreground); font-size: 12px; }
.plugin-update-panel p { margin: 0; color: var(--muted-foreground); line-height: 1.6; }
.plugin-update-panel strong { font-size: 13px; font-weight: 600; }
.plugin-update-panel code { overflow-wrap: anywhere; font-size: 12px; }
.plugin-update-packages { display: grid; gap: 9px; list-style: none; padding: 0; margin: 0; }
.plugin-update-packages li { display: flex; justify-content: space-between; gap: 12px; }
.plugin-update-actions { display: flex; flex-wrap: wrap; gap: 8px; }
@media (max-width: 600px) { .plugin-update-kernels { grid-template-columns: 1fr; } .plugin-update-packages li { flex-direction: column; gap: 3px; } }
</style>
