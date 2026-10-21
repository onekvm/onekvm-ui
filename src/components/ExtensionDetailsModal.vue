<script setup lang="ts">
import { computed } from 'vue'
import { Cpu, Package } from '@/icons'
import { extensionRouteURL, extensionTranslation, type ExtensionStatus, type ExtensionSummary } from '@/api/client'
import { currentLanguage, t } from '@/i18n/runtime'
import { pluginIcon } from '@/lib/plugin-icons'
import { extensionCategory } from '@/lib/extension-category'
import ExtensionPermissionList from './ExtensionPermissionList.vue'
import ExtensionFeatureList from './ExtensionFeatureList.vue'
import ExtensionCapabilityList from './ExtensionCapabilityList.vue'
import PluginDetailsSectionTitle from './PluginDetailsSectionTitle.vue'

const props = defineProps<{
  show: boolean
  status?: ExtensionSummary
  detail?: ExtensionStatus
  loading: boolean
  error: string
  busy: boolean
}>()
const emit = defineEmits<{ close: []; closed: []; retry: [] }>()

const identity = computed(() => props.status ? extensionTranslation(props.status, currentLanguage.value) : undefined)
const icon = computed(() => props.status ? pluginIcon(props.status) : undefined)
const fileRoutes = computed(() => (props.detail?.routes || []).filter(route => route.backend === 'file'))
const kind = computed(() => {
  const value = extensionCategory(props.status)
  if (value === 'protocol') return t('settings.plugins.kindProtocol', 'Protocol')
  if (value === 'service') return t('settings.plugins.kindService', 'Service')
  if (value === 'network') return t('settings.plugins.kindNetwork', 'Network')
  if (value === 'environment') return t('settings.plugins.kindEnvironment', 'Environment')
  if (value === 'cloud-provider') return t('settings.plugins.kindCloudProvider', 'Cloud service')
  if (value === 'device') return t('settings.plugins.kindDevice', 'Device backend')
  return value
})
const declarations = computed(() => [
  { key: 'packages', icon: Package, title: t('settings.plugins.packageDependencies', 'Package dependencies'), values: props.detail?.package_dependencies, empty: t('settings.plugins.noPackageDependencies', 'No package dependencies') },
  { key: 'modules', icon: Cpu, title: t('settings.plugins.kernelModules', 'Kernel modules'), values: props.detail?.kernel_modules, empty: t('settings.plugins.noKernelModules', 'No kernel modules declared') },
])

function memorySize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KiB`
  const mib = bytes / (1024 * 1024)
  return `${Number.isInteger(mib) ? mib : mib.toFixed(1)} MiB`
}
</script>

<template>
  <n-modal :show="show" :mask-closable="!busy" :close-on-esc="!busy" @update:show="(show: boolean) => { if (!show) emit('close') }" @after-leave="emit('closed')">
    <n-card v-if="status" class="plugin-details-card host-window-frame host-dialog" :closable="!busy" role="dialog" aria-modal="true" aria-labelledby="plugin-details-title" @close="emit('close')">
      <template #header>
        <span id="plugin-details-title">{{ t('settings.plugins.details', 'Details') }} - {{ identity?.name }}</span>
      </template>
      <div class="plugin-details-body">
        <div class="plugin-details-identity">
          <span v-if="icon" class="plugin-details-icon">
            <img v-if="icon.url" :src="icon.url" alt="" />
            <component v-else :is="icon.component" :size="26" />
          </span>
          <div>
            <strong>{{ identity?.name }}</strong>
            <p v-if="identity?.description">{{ identity.description }}</p>
          </div>
        </div>
        <n-alert v-if="status.error" type="error" :show-icon="false">{{ status.error }}</n-alert>
        <dl class="plugin-details-metadata">
          <div><dt>{{ t('settings.plugins.version', 'Version') }}</dt><dd>{{ status.version || '—' }}</dd></div>
          <div><dt>{{ t('settings.plugins.type', 'Type') }}</dt><dd>{{ kind }}</dd></div>
          <div v-if="status.memory_budget_bytes"><dt>{{ t('settings.plugins.memoryBudget', 'Plugin memory budget') }}</dt><dd>{{ memorySize(status.memory_budget_bytes) }}</dd></div>
          <div v-if="status.author"><dt>{{ t('settings.plugins.author', 'Author') }}</dt><dd>{{ status.author }}</dd></div>
          <div v-if="status.homepage"><dt>{{ t('settings.plugins.homepage', 'Homepage') }}</dt><dd><a :href="status.homepage" target="_blank" rel="noopener noreferrer">{{ status.homepage }}</a></dd></div>
          <div v-if="fileRoutes.length">
            <dt>{{ t('settings.plugins.webRoutes', 'Web routes') }}</dt>
            <dd class="plugin-details-routes"><a v-for="route in fileRoutes" :key="route.path" :href="extensionRouteURL(status, route)" target="_blank" rel="noopener noreferrer">{{ extensionRouteURL(status, route) }}</a></dd>
          </div>
        </dl>
        <div v-if="loading" class="plugin-details-loading" role="status" :aria-label="t('common.loading', 'Loading…')"><n-spin size="small" /></div>
        <div v-else-if="error" class="plugin-details-error">
          <n-alert type="error" :show-icon="false">{{ error }}</n-alert>
          <n-button size="small" @click="emit('retry')">{{ t('common.reload', 'Reload') }}</n-button>
        </div>
        <template v-else-if="detail">
          <ExtensionFeatureList :detail="detail" />
          <ExtensionCapabilityList v-if="!detail.system && detail.capabilities?.length" :capabilities="detail.capabilities" />
          <ExtensionPermissionList :permissions="detail.permissions" />
          <section v-for="section in declarations" :key="section.key" class="plugin-declaration" :data-declaration="section.key">
            <PluginDetailsSectionTitle :icon="section.icon">{{ section.title }}</PluginDetailsSectionTitle>
            <ul v-if="section.values?.length" class="plugin-declaration-values">
              <li v-for="value in section.values" :key="value"><code>{{ value }}</code></li>
            </ul>
            <p v-else class="plugin-declaration-empty">{{ section.values == null ? t('settings.plugins.metadataUnavailable', 'Information unavailable') : section.empty }}</p>
          </section>
          <slot name="settings" />
        </template>
      </div>
      <template #footer>
        <div class="plugin-details-actions">
          <slot name="actions" />
          <n-button size="small" :disabled="busy" @click="emit('close')">{{ t('settings.plugins.close', 'Close') }}</n-button>
        </div>
      </template>
    </n-card>
  </n-modal>
</template>

<style scoped>
.plugin-details-card { width: min(640px, calc(100vw - 28px)); max-height: calc(100dvh - 40px); }
.plugin-details-card :deep(.n-card-content) { min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.plugin-details-body { display: grid; gap: 18px; }
.plugin-details-identity { display: flex; align-items: center; gap: 12px; }
.plugin-details-icon { display: grid; width: 44px; height: 44px; flex: 0 0 44px; place-items: center; border-radius: 10px; background: var(--onekvm-surface-inset); color: var(--muted-foreground); }
.plugin-details-icon img { width: 28px; height: 28px; object-fit: contain; }
.plugin-details-identity > div { min-width: 0; }
.plugin-details-identity strong { color: var(--foreground); font-size: 15px; overflow-wrap: anywhere; }
.plugin-details-identity p { margin: 4px 0 0; color: var(--muted-foreground); font-size: 12px; line-height: 1.5; }
.plugin-details-metadata { display: grid; margin: 0; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.plugin-details-metadata > div { display: grid; grid-template-columns: 130px minmax(0, 1fr); gap: 12px; padding: 9px 12px; }
.plugin-details-metadata > div + div { border-top: 1px solid var(--border); }
.plugin-details-metadata dt { color: var(--muted-foreground); font-size: 12px; }
.plugin-details-metadata dd { min-width: 0; margin: 0; color: var(--foreground); font-size: 12px; overflow-wrap: anywhere; }
.plugin-details-metadata a { color: var(--success); text-decoration: none; }
.plugin-details-metadata a:hover { text-decoration: underline; }
.plugin-details-routes { display: grid; gap: 4px; }
.plugin-details-loading { display: grid; min-height: 150px; place-items: center; }
.plugin-details-error { display: grid; gap: 10px; justify-items: start; }
.plugin-declaration { display: grid; gap: 8px; }
.plugin-declaration-values { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
.plugin-declaration-values li { min-width: 0; max-width: 100%; padding: 4px 8px; border: 1px solid var(--border); border-radius: 5px; background: var(--onekvm-surface-inset); color: var(--onekvm-text-secondary); font-size: 12px; }
.plugin-declaration-values code { font-family: var(--font-mono, monospace); overflow-wrap: anywhere; }
.plugin-declaration-empty { margin: 0; color: var(--muted-foreground); font-size: 12px; }
.plugin-details-actions { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 8px; }
@media (max-width: 600px) {
  .plugin-details-card { width: calc(100vw - 16px); max-height: calc(100dvh - 24px); }
  .plugin-details-card :deep(.n-card-header), .plugin-details-card :deep(.n-card-content), .plugin-details-card :deep(.n-card__footer) { padding-left: 16px; padding-right: 16px; }
  .plugin-details-metadata > div { grid-template-columns: 100px minmax(0, 1fr); gap: 8px; }
}
</style>
