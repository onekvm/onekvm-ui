<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import { BrickWallShield, Download, Store } from '@/icons'
import { NAlert, NButton, NTag } from 'naive-ui'
import { api, type ExtensionSummary } from '@/api/client'
import { t } from '@/i18n/runtime'
import { PLUGIN_MARKETPLACE_ID } from '@/lib/cloud-services'
import { loadMarketplaceInstallPackage } from '@/lib/marketplace-install-client'
import type { MarketplaceInstallPackage } from '@/lib/marketplace-install'
import MarketplaceInstallDialog from './MarketplaceInstallDialog.vue'

const props = defineProps<{ catalog: ExtensionSummary[]; loading?: boolean }>()
const emit = defineEmits<{
  catalog: [value: ExtensionSummary[]]
  installed: []
  openPlugins: []
}>()

const key = 'settings.firewall.installation.'
const preparing = ref(false)
const showInstaller = ref(false)
const entry = shallowRef<MarketplaceInstallPackage | null>(null)
const error = ref('')
const installed = computed(() => props.catalog.some((item) => item.id === 'firewall' && item.installed))
const marketplace = computed(() => props.catalog.find((item) => item.id === PLUGIN_MARKETPLACE_ID && item.installed))
const canInstall = computed(() => Boolean(marketplace.value?.enabled && marketplace.value.shell?.entrypoint))

async function prepareInstall() {
  if (props.loading || !canInstall.value || !marketplace.value || preparing.value) return
  preparing.value = true
  error.value = ''
  try {
    entry.value = await loadMarketplaceInstallPackage(marketplace.value, 'firewall')
    if (!entry.value) throw new Error(t(key + 'packageUnavailable', 'The firewall package is unavailable. Refresh the package source and try again.'))
    showInstaller.value = true
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    preparing.value = false
  }
}

async function afterInstall() {
  const [catalog, status] = await Promise.all([api.getExtensions(), api.getFirewall()])
  emit('catalog', catalog)
  if (!status.available) return false
  emit('installed')
  return true
}
</script>

<template>
  <article class="firewall-install-card">
    <header>
      <span class="firewall-install-icon" aria-hidden="true"><BrickWallShield :size="28" /></span>
      <div class="firewall-install-title">
        <h2>{{ t('settings.firewall.title', 'Firewall') }}</h2>
        <p>{{ t('settings.firewall.description', 'Choose who can connect to this device.') }}</p>
      </div>
      <n-tag size="small" :bordered="false" :type="installed ? 'warning' : 'default'">
        {{ installed ? t(key + 'incomplete', 'Components missing') : t(key + 'notInstalled', 'Not installed') }}
      </n-tag>
    </header>
    <p>{{ installed
      ? t(key + 'repairHint', 'The firewall tools or matching kernel modules are missing. Install the required components before managing rules.')
      : t(key + 'description', 'Install the firewall tools and matching kernel modules to manage access rules. Protection stays off until you enable it.') }}</p>
    <n-alert v-if="error" type="error" :bordered="false">{{ error }}</n-alert>
    <n-alert v-if="!loading && !canInstall" type="warning" :bordered="false" :show-icon="false">
      {{ marketplace?.enabled
        ? t(key + 'marketplaceOutdated', 'Update Plugin Marketplace to install the firewall online. You can also upload a package from the Plugins page.')
        : t(key + 'marketplaceMissing', 'Online installation requires an enabled Plugin Marketplace. You can also upload a package from the Plugins page.') }}
    </n-alert>
    <footer>
      <n-button type="primary" :loading="preparing || loading" :disabled="loading || !canInstall || preparing" @click="prepareInstall">
        <template #icon><Download /></template>
        {{ installed ? t(key + 'repair', 'Install required components') : t(key + 'install', 'Install firewall') }}
      </n-button>
      <n-button secondary :disabled="preparing" @click="emit('openPlugins')">
        <template #icon><Store /></template>{{ t(key + 'openPlugins', 'Open Plugins') }}
      </n-button>
    </footer>
  </article>
  <MarketplaceInstallDialog v-model:show="showInstaller" :entry="entry" :on-installed="afterInstall"
    :failed-text="t(key + 'failed', 'Firewall installation failed. Try again.')"
    :timed-out-text="t(key + 'timedOut', 'Firewall installation timed out. Try again.')"
    :unavailable-text="t(key + 'repairHint', 'The firewall tools or matching kernel modules are missing. Install the required components before managing rules.')" />
</template>

<style scoped>
.firewall-install-card { display: grid; gap: 16px; padding: 20px; border: 1px solid var(--border); border-radius: var(--radius-large); background: var(--card); }
.firewall-install-card header { display: flex; align-items: center; gap: 12px; }
.firewall-install-icon { display: grid; place-items: center; width: 48px; height: 48px; flex: 0 0 48px; border-radius: var(--radius); background: var(--muted); color: var(--muted-foreground); }
.firewall-install-title { flex: 1; min-width: 0; }
.firewall-install-title h2 { margin: 0; color: var(--foreground); font-size: 18px; font-weight: 650; }
.firewall-install-card p { margin: 0; color: var(--muted-foreground); font-size: 13px; line-height: 1.6; text-wrap: pretty; }
.firewall-install-card footer { display: flex; flex-wrap: wrap; gap: 8px; }
@media (max-width: 620px) {
  .firewall-install-card { padding: 16px; }
  .firewall-install-card header { flex-wrap: wrap; }
  .firewall-install-card footer > * { min-height: 44px; }
}
</style>
