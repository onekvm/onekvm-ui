<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { CircleCheck, Download, Info, PackageCheck } from '@/icons'
import { NAlert, NButton, NCard, NModal, NProgress, NTag } from 'naive-ui'

import { currentLanguage, t } from '@/i18n/runtime'
import { installMarketplacePackage } from '@/lib/marketplace-install-client'
import {
  fillMarketplaceTemplate,
  marketplaceFormatPackageSize,
  marketplaceFormatStorageBytes,
  marketplacePackageText,
  marketplacePackageVersionText,
  marketplacePackageVersions,
  marketplaceProgressPercent,
  type MarketplaceInstallPackage,
  type MarketplaceInstallProgress,
} from '@/lib/marketplace-install'
import ExtensionDetailsDialog from './ExtensionDetailsDialog.vue'

const props = defineProps<{
  show: boolean
  entry: MarketplaceInstallPackage | null
  onInstalled: () => Promise<boolean>
  failedText?: string
  timedOutText?: string
  unavailableText?: string
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
}>()

type InstallerPhase = 'confirm' | 'installing' | 'success'

const phase = ref<InstallerPhase>('confirm')
const error = ref('')
const detailsOpen = ref(false)
const progress = ref<MarketplaceInstallProgress>({
  phase: '',
  percent: null,
  bytes: 0,
  totalBytes: 0,
  message: '',
  status: '',
  error: '',
})

const installing = computed(() => phase.value === 'installing')
const localized = computed(() => props.entry
  ? marketplacePackageText(props.entry, currentLanguage.value)
  : { name: '', description: '' })
const versionText = computed(() => props.entry ? marketplacePackageVersionText(props.entry) : '')
const versions = computed(() => props.entry ? marketplacePackageVersions(props.entry) : { current: '', latest: '' })
const downloadSize = computed(() => props.entry ? marketplaceFormatPackageSize(props.entry.sizeBytes) : '')
const installedSize = computed(() => props.entry ? marketplaceFormatPackageSize(props.entry.installedSizeBytes) : '')
const percent = computed(() => marketplaceProgressPercent(progress.value))
const progressPhase = computed(() => progress.value.phase || 'prepare')

const title = computed(() => props.entry?.updateAvailable
  ? t('network.wireguard.installerUpdateTitle', 'Update extension')
  : t('network.wireguard.installerTitle', 'Install extension'))

const progressTitle = computed(() => {
  const name = localized.value.name
  if (progressPhase.value === 'download') {
    return fillMarketplaceTemplate(t('network.wireguard.installerDownloading', 'Downloading {name}'), { name })
  }
  if (progressPhase.value === 'prepare') {
    return props.entry?.updateAvailable
      ? t('network.wireguard.installerPreparingUpdate', 'Preparing to update')
      : t('network.wireguard.installerPreparing', 'Preparing to install')
  }
  const template = props.entry?.updateAvailable
    ? t('network.wireguard.installerUpdating', 'Updating {name}')
    : t('network.wireguard.installerInstalling', 'Installing {name}')
  return fillMarketplaceTemplate(template, { name })
})

const progressDescription = computed(() => {
  if (progressPhase.value === 'download') {
    return t('network.wireguard.installerDownloadingDescription', 'Downloading from the package source. Do not close this window.')
  }
  return props.entry?.updateAvailable
    ? t('network.wireguard.installerUpdatingDescription', 'Downloading and updating. Do not close this window.')
    : t('network.wireguard.installerInstallingDescription', 'Downloading from the package source and installing. Do not close this window.')
})

const progressStatus = computed(() => {
  const bytesText = progress.value.bytes > 0 || progress.value.totalBytes > 0
    ? fillMarketplaceTemplate(t('network.wireguard.installerProgressBytes', '{received} / {total}'), {
      received: marketplaceFormatStorageBytes(progress.value.bytes),
      total: marketplaceFormatStorageBytes(progress.value.totalBytes || progress.value.bytes),
    })
    : ''
  return [progress.value.message, bytesText].filter(Boolean).join(' · ')
})

const confirmCopy = computed(() => {
  if (!props.entry) return ''
  if (props.entry.updateAvailable) {
    return fillMarketplaceTemplate(
      t('network.wireguard.installerUpdateConfirm', 'Update "{name}" from {current} to {latest}? The extension will stop briefly. Settings and enabled state will be kept.'),
      { name: localized.value.name, ...versions.value },
    )
  }
  return fillMarketplaceTemplate(
    t('network.wireguard.installerConfirm', 'Install "{name}"? It will be downloaded from the package source and installed on this device.'),
    { name: localized.value.name },
  )
})

const completeCopy = computed(() => {
  if (!props.entry) return ''
  if (props.entry.updateAvailable) {
    return fillMarketplaceTemplate(
      t('network.wireguard.installerUpdateCompleteDescription', '{name} has been updated to {latest}.'),
      { name: localized.value.name, ...versions.value },
    )
  }
  return fillMarketplaceTemplate(
    t('network.wireguard.installerCompleteDescription', '{name} is ready to use.'),
    { name: localized.value.name },
  )
})

watch(() => props.show, (open) => {
  if (!open) detailsOpen.value = false
  if (!open || phase.value === 'installing') return
  phase.value = 'confirm'
  error.value = ''
  progress.value = {
    phase: '',
    percent: null,
    bytes: 0,
    totalBytes: props.entry?.sizeBytes || 0,
    message: '',
    status: '',
    error: '',
  }
})

function close() {
  if (installing.value) return
  emit('update:show', false)
}

function onUpdateShow(next: boolean) {
  if (!next) close()
}

function installErrors() {
  return {
    rejected: t('network.wireguard.installRejected', 'The Plugin Marketplace could not start this installation.'),
    failed: props.failedText || t('network.wireguard.installFailed', 'WireGuard environment installation failed. Try again.'),
    timedOut: props.timedOutText || t('network.wireguard.installTimedOut', 'WireGuard environment installation timed out. Try again.'),
  }
}

async function runInstall() {
  const entry = props.entry
  if (!entry || phase.value === 'installing') return
  error.value = ''
  progress.value = {
    phase: 'prepare',
    percent: null,
    bytes: 0,
    totalBytes: entry.sizeBytes,
    message: entry.updateAvailable
      ? t('network.wireguard.installerPreparingUpdate', 'Preparing to update')
      : t('network.wireguard.installerPreparing', 'Preparing to install'),
    status: 'running',
    error: '',
  }
  phase.value = 'installing'
  try {
    await installMarketplacePackage(entry, installErrors(), (next) => {
      progress.value = next
    })
    const ready = await props.onInstalled()
    if (!ready) {
      error.value = props.unavailableText || t(
        'network.wireguard.installEnvironmentUnavailable',
        'WireGuard is still unavailable after installation. Check that the wg command and kernel module are installed, then try again.',
      )
      phase.value = 'confirm'
      return
    }
    phase.value = 'success'
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
    phase.value = 'confirm'
  }
}
</script>

<template>
  <n-modal
    :show="show && !!entry"
    :mask-closable="!installing"
    :close-on-esc="!installing"
    :auto-focus="false"
    to="body"
    @update:show="onUpdateShow"
  >
    <n-card
      v-if="entry"
      class="plugin-marketplace-installer"
      :title="title"
      :closable="!installing"
      :bordered="false"
      size="small"
      role="dialog"
      aria-modal="true"
      @close="close"
    >
      <div v-if="phase === 'installing'" class="plugin-marketplace-installer-stage plugin-marketplace-installer-centered">
        <span class="plugin-marketplace-installer-icon">
          <PackageCheck v-if="progressPhase === 'install'" :size="31" />
          <Download v-else :size="31" />
        </span>
        <strong>{{ progressTitle }}</strong>
        <span>{{ progressDescription }}</span>
        <span v-if="progressStatus">{{ progressStatus }}</span>
        <div v-if="downloadSize || installedSize" class="plugin-marketplace-installer-badges">
          <n-tag v-if="downloadSize" size="tiny" :bordered="false" round type="info">
            {{ fillMarketplaceTemplate(t('network.wireguard.installerDownloadSize', 'Download {size}'), { size: downloadSize }) }}
          </n-tag>
          <n-tag v-if="installedSize" size="tiny" :bordered="false" round>
            {{ fillMarketplaceTemplate(t('network.wireguard.installerInstalledSize', 'Installed {size}'), { size: installedSize }) }}
          </n-tag>
        </div>
        <n-progress
          v-if="percent != null"
          class="plugin-marketplace-progress"
          type="line"
          :percentage="percent"
          :show-indicator="false"
          processing
        />
        <div
          v-else
          class="plugin-marketplace-indeterminate"
          role="progressbar"
          :aria-label="progressTitle"
        >
          <span />
        </div>
        <span v-if="percent != null">{{ percent }}%</span>
      </div>

      <div v-else-if="phase === 'success'" class="plugin-marketplace-installer-stage plugin-marketplace-installer-centered">
        <span class="plugin-marketplace-installer-icon plugin-marketplace-installer-success">
          <img v-if="entry.iconDataUrl" :src="entry.iconDataUrl" alt="" />
          <PackageCheck v-else :size="32" />
          <span class="plugin-marketplace-installer-check">
            <CircleCheck :size="16" />
          </span>
        </span>
        <strong>
          {{ entry.updateAvailable
            ? t('network.wireguard.installerUpdateComplete', 'Extension updated')
            : t('network.wireguard.installerComplete', 'Extension installed') }}
        </strong>
        <span>{{ completeCopy }}</span>
      </div>

      <div v-else class="plugin-marketplace-installer-stage">
        <div class="plugin-marketplace-installer-preview">
          <span class="plugin-marketplace-installer-icon">
            <img v-if="entry.iconDataUrl" :src="entry.iconDataUrl" alt="" />
            <PackageCheck v-else :size="32" />
          </span>
          <div class="plugin-marketplace-installer-identity">
            <strong>{{ localized.name }}</strong>
            <span v-if="versionText">{{ versionText }}</span>
          </div>
        </div>
        <p v-if="localized.description" class="plugin-marketplace-installer-description">{{ localized.description }}</p>
        <div v-if="downloadSize || installedSize" class="plugin-marketplace-installer-badges">
          <n-tag v-if="downloadSize" size="tiny" :bordered="false" round type="info">
            {{ fillMarketplaceTemplate(t('network.wireguard.installerDownloadSize', 'Download {size}'), { size: downloadSize }) }}
          </n-tag>
          <n-tag v-if="installedSize" size="tiny" :bordered="false" round>
            {{ fillMarketplaceTemplate(t('network.wireguard.installerInstalledSize', 'Installed {size}'), { size: installedSize }) }}
          </n-tag>
        </div>
        <n-alert v-if="error" type="error" :show-icon="false">{{ error }}</n-alert>
        <p class="plugin-marketplace-installer-copy">{{ confirmCopy }}</p>
      </div>

      <template #footer>
        <div class="plugin-marketplace-installer-actions">
          <template v-if="phase === 'confirm'">
            <n-button class="plugin-marketplace-details-action" @click="detailsOpen = true">
              <template #icon><Info /></template>{{ t('settings.plugins.details', 'Details') }}
            </n-button>
            <n-button @click="close">{{ t('network.wireguard.installerCancel', 'Cancel') }}</n-button>
            <n-button type="primary" @click="runInstall">
              {{ entry.updateAvailable
                ? t('network.wireguard.installerUpdate', 'Update')
                : t('network.wireguard.installerInstall', 'Install') }}
            </n-button>
          </template>
          <n-button v-else-if="phase === 'success'" type="primary" @click="close">
            {{ t('network.wireguard.installerDone', 'Done') }}
          </n-button>
        </div>
      </template>
    </n-card>
  </n-modal>
  <ExtensionDetailsDialog
    v-if="entry"
    v-model:show="detailsOpen"
    :id="entry.id"
    :name="localized.name"
  />
</template>

<style scoped>
.plugin-marketplace-installer { width: min(500px, calc(100vw - 28px)); }
.plugin-marketplace-installer-stage { display: grid; gap: 16px; min-height: 220px; }
.plugin-marketplace-installer-preview { display: flex; align-items: center; gap: 14px; }
.plugin-marketplace-installer-icon {
  position: relative;
  display: grid;
  width: 58px;
  height: 58px;
  flex: 0 0 58px;
  place-items: center;
  border-radius: 16px;
  background: color-mix(in srgb, var(--success) 12%, transparent);
  color: var(--success);
}
.plugin-marketplace-installer-icon img {
  width: 32px;
  height: 32px;
  object-fit: contain;
}
.plugin-marketplace-installer-success {
  background: color-mix(in srgb, var(--success) 16%, transparent);
  color: var(--success);
}
.plugin-marketplace-installer-check {
  position: absolute;
  right: -4px;
  bottom: -4px;
  display: grid;
  width: 22px;
  height: 22px;
  place-items: center;
  border-radius: 999px;
  background: var(--card);
  color: var(--success);
}
.plugin-marketplace-installer-identity { display: grid; min-width: 0; gap: 4px; }
.plugin-marketplace-installer-identity strong {
  overflow: hidden;
  color: var(--foreground);
  font-size: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.plugin-marketplace-installer-identity span { color: var(--muted-foreground); font-size: 12px; }
.plugin-marketplace-installer-copy,
.plugin-marketplace-installer-description {
  margin: 0;
  color: var(--muted-foreground);
  font-size: 12px;
  line-height: 1.55;
}
.plugin-marketplace-installer-badges { display: flex; flex-wrap: wrap; gap: 8px; }
.plugin-marketplace-installer-centered {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  min-height: 250px;
  text-align: center;
}
.plugin-marketplace-installer-centered > strong { color: var(--foreground); font-size: 16px; }
.plugin-marketplace-installer-centered > span:not(.plugin-marketplace-installer-icon) { color: var(--muted-foreground); font-size: 12px; }
.plugin-marketplace-progress,
.plugin-marketplace-installer-centered :deep(.n-progress),
.plugin-marketplace-indeterminate {
  width: 100%;
  max-width: 360px;
  align-self: stretch;
  margin-inline: auto;
}
.plugin-marketplace-installer-actions { display: flex; width: 100%; align-items: center; justify-content: flex-end; gap: 8px; }
.plugin-marketplace-details-action { margin-right: auto; }
.plugin-marketplace-indeterminate {
  position: relative;
  height: 4px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--muted);
}
.plugin-marketplace-indeterminate > span {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 42%;
  border-radius: inherit;
  background: var(--primary);
  animation: plugin-marketplace-progress 1.15s ease-in-out infinite;
}
@keyframes plugin-marketplace-progress {
  0% { left: -45%; }
  100% { left: 105%; }
}
@media (prefers-reduced-motion: reduce) {
  .plugin-marketplace-indeterminate > span { animation: none; left: 0; width: 100%; }
}
</style>
