<script setup lang="ts">
import { useAsyncDialog } from '@/composables/useAsyncDialog'
import { computed, ref, shallowRef } from 'vue'
import { CloudOff, RefreshCw, Store } from '@/icons'
import { useMessage } from 'naive-ui'

import { api, type ExtensionSummary } from '@/api/client'
import { useCloudServices } from '@/composables/useCloudServices'
import { t } from '@/i18n/runtime'
import { PLUGIN_MARKETPLACE_ID, type CloudServiceEntry } from '@/lib/cloud-services'
import { loadMarketplaceInstallPackage } from '@/lib/marketplace-install-client'
import type { MarketplaceInstallPackage } from '@/lib/marketplace-install'

import CloudProviderCard from './CloudProviderCard.vue'
import MarketplaceInstallDialog from './MarketplaceInstallDialog.vue'

const props = defineProps<{
  catalog: ExtensionSummary[]
  loading?: boolean
}>()

const emit = defineEmits<{
  catalog: [value: ExtensionSummary[]]
  manage: [id: string]
  open: [id: string]
  openPlugins: []
}>()

const dialog = useAsyncDialog()
const message = useMessage()
const catalogRef = computed(() => props.catalog)
const {
  activeService,
  activate,
  featuredService,
  installedServices,
  loadMarketplace,
  marketplaceState,
  marketplaceUsable,
  operation,
  operationId,
  otherServices,
  stop,
} = useCloudServices({
  catalog: catalogRef,
  onCatalog: (catalog) => emit('catalog', catalog),
})

const marketplaceProblem = computed(() => {
  if (marketplaceState.value === 'missing') {
    return {
      title: t('settings.cloudProviders.marketplaceMissingTitle', 'Plugin marketplace is not installed'),
      detail: t('settings.cloudProviders.marketplaceMissing', 'Online cloud service installation requires the Plugin Marketplace. You can still upload a provider package from the Plugins page.'),
    }
  }
  if (marketplaceState.value === 'incompatible') {
    return {
      title: t('settings.cloudProviders.marketplaceOutdatedTitle', 'Plugin marketplace must be updated'),
      detail: t('settings.cloudProviders.marketplaceOutdated', 'The installed marketplace does not expose its Shell installation service.'),
    }
  }
  if (marketplaceState.value === 'error') {
    return {
      title: t('settings.cloudProviders.marketplaceErrorTitle', 'Plugin marketplace is unavailable'),
      detail: t('settings.cloudProviders.marketplaceError', 'Could not load cloud service packages from the marketplace.'),
    }
  }
  return null
})

const marketplace = computed(() => props.catalog.find(
  (item) => item.id === PLUGIN_MARKETPLACE_ID && item.installed,
) || null)
const preparingInstall = ref(false)
const showInstaller = ref(false)
const installerEntry = shallowRef<MarketplaceInstallPackage | null>(null)

function operationFor(service: CloudServiceEntry) {
  return operationId.value === service.id ? operation.value : ''
}

async function requestInstall(service: CloudServiceEntry) {
  if (preparingInstall.value || !marketplace.value) return
  preparingInstall.value = true
  try {
    const entry = await loadMarketplaceInstallPackage(marketplace.value, service.id)
    if (!entry) {
      throw new Error(t(
        'settings.cloudProviders.packageUnavailable',
        'This cloud service is not available from the configured package sources.',
      ))
    }
    installerEntry.value = entry
    showInstaller.value = true
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : String(reason))
  } finally {
    preparingInstall.value = false
  }
}

async function afterCloudInstall() {
  const entry = installerEntry.value
  const catalog = await api.getExtensions()
  emit('catalog', catalog)
  await loadMarketplace(false)
  return Boolean(entry && catalog.some((item) => item.id === entry.id && item.installed))
}

async function runActivate(service: CloudServiceEntry) {
  try {
    await activate(service)
    emit('open', service.id)
    message.success(t('settings.cloudProviders.startedMessage', 'Cloud service started'))
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : String(reason))
    return false
  }
}

function requestActivate(service: CloudServiceEntry) {
  const current = activeService.value
  if (!current || current.id === service.id) {
    void runActivate(service)
    return
  }
  dialog.warning({
    title: t('settings.cloudProviders.switchTitle', 'Switch cloud service?'),
    content: t('settings.cloudProviders.switchConfirm', '{current} will be stopped before {next} starts. Only one cloud service can run at a time.')
      .replace('{current}', current.name || current.id)
      .replace('{next}', service.name || service.id),
    positiveText: t('settings.cloudProviders.switchAction', 'Switch service'),
    negativeText: t('common.cancel', 'Cancel'),
    onPositiveClick: () => runActivate(service),
  })
}

async function stopService(service: CloudServiceEntry) {
  try {
    await stop(service)
    message.success(t('settings.cloudProviders.stoppedMessage', 'Cloud service stopped'))
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : String(reason))
  }
}
</script>

<template>
  <section class="cloud-services-page">
    <header class="cloud-services-heading">
      <p>{{ t('settings.cloudProviders.description', 'Choose one provider for remote cloud access. Only one cloud service can run at a time.') }}</p>
      <n-button
        quaternary
        size="small"
        :loading="marketplaceState === 'loading'"
        :disabled="loading"
        @click="loadMarketplace()"
      >
        <template #icon><RefreshCw /></template>
        {{ t('common.refresh', 'Refresh') }}
      </n-button>
    </header>

    <section v-if="!activeService" class="cloud-services-empty">
      <span class="cloud-services-empty-icon"><CloudOff :size="25" /></span>
      <div>
        <strong>{{ t('settings.cloudProviders.emptyTitle', 'No cloud service selected') }}</strong>
        <p>
          {{ installedServices.length === 0
            ? t('settings.cloudProviders.empty', 'No cloud service is installed or running by default. Install a provider below, then choose it to start.')
            : t('settings.cloudProviders.inactive', 'No cloud service is running. Choose an installed provider to start.') }}
        </p>
      </div>
    </section>

    <n-alert v-if="marketplaceProblem" type="warning" :show-icon="false" class="cloud-marketplace-alert">
      <div class="cloud-marketplace-alert-copy">
        <span><strong>{{ marketplaceProblem.title }}</strong>{{ marketplaceProblem.detail }}</span>
        <n-button size="small" secondary @click="emit('openPlugins')">
          <template #icon><Store /></template>
          {{ t('settings.cloudProviders.openPlugins', 'Open Plugins') }}
        </n-button>
      </div>
    </n-alert>

    <n-spin :show="Boolean(loading)" class="cloud-services-content">
      <CloudProviderCard
        :service="featuredService"
        featured
        :marketplace-usable="marketplaceUsable"
        :operation="operationFor(featuredService)"
        :progress="null"
        @install="requestInstall"
        @start="requestActivate"
        @stop="stopService"
        @open="emit('open', $event.id)"
        @manage="emit('manage', $event.id)"
      />

      <section class="other-cloud-services">
        <header>
          <div>
            <h3>{{ t('settings.cloudProviders.otherTitle', 'Other providers') }}</h3>
            <p>{{ t('settings.cloudProviders.otherDescription', 'Cloud service plugins available from the Plugin Marketplace and local installations.') }}</p>
          </div>
          <n-tag size="small" :bordered="false">{{ otherServices.length }}</n-tag>
        </header>
        <n-empty
          v-if="marketplaceState !== 'loading' && otherServices.length === 0"
          :description="t('settings.cloudProviders.noOtherProviders', 'No other cloud service providers are available')"
        />
        <div v-else class="other-cloud-service-grid">
          <CloudProviderCard
            v-for="service in otherServices"
            :key="service.id"
            :service="service"
            :marketplace-usable="marketplaceUsable"
            :operation="operationFor(service)"
            :progress="null"
            @install="requestInstall"
            @start="requestActivate"
            @stop="stopService"
            @open="emit('open', $event.id)"
            @manage="emit('manage', $event.id)"
          />
        </div>
      </section>
    </n-spin>
  </section>
  <MarketplaceInstallDialog
    v-model:show="showInstaller"
    :entry="installerEntry"
    :on-installed="afterCloudInstall"
    :failed-text="t('settings.cloudProviders.installFailed', 'Cloud service installation failed. Try again.')"
    :timed-out-text="t('settings.cloudProviders.installTimedOut', 'Cloud service installation timed out. Try again.')"
    :unavailable-text="t('settings.cloudProviders.installRejected', 'The Plugin Marketplace could not start this installation.')"
  />
</template>

<style scoped>
.cloud-services-page { display: grid; gap: 16px; }
.cloud-services-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.other-cloud-services h3 { margin: 0; color: var(--foreground); font-weight: 650; letter-spacing: -.015em; }
.cloud-services-heading p,
.other-cloud-services p,
.cloud-services-empty p { margin: 4px 0 0; color: var(--muted-foreground); font-size: 12px; line-height: 1.55; text-wrap: pretty; }
.cloud-services-heading p { max-width: 720px; }

.cloud-services-empty {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-large);
  background: var(--muted);
}
.cloud-services-empty strong { color: var(--onekvm-text-secondary); font-size: 13px; }
.cloud-services-empty-icon { display: grid; width: 40px; height: 40px; flex: 0 0 40px; place-items: center; border-radius: var(--radius); background: var(--input); color: var(--muted-foreground); }
.cloud-marketplace-alert-copy { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
.cloud-marketplace-alert-copy > span { display: grid; gap: 3px; }
.cloud-services-content { min-height: 240px; }
.cloud-services-content :deep(.n-spin-content) { display: grid; gap: 20px; }
.other-cloud-services { display: grid; gap: 12px; }
.other-cloud-services > header { display: flex; align-items: end; justify-content: space-between; gap: 12px; }
.other-cloud-services h3 { font-size: 15px; }
.other-cloud-service-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }

@media (max-width: 900px) {
  .other-cloud-service-grid { grid-template-columns: 1fr; }
}

@media (max-width: 620px) {
  .cloud-services-heading,
  .cloud-marketplace-alert-copy { align-items: stretch; flex-direction: column; }
  .cloud-services-heading > .n-button { align-self: flex-start; }
}
</style>
