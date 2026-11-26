<script setup lang="ts">
import { computed, type Component } from 'vue'
import { Bell, Cpu, Fingerprint, HardDrive, Keyboard, LayoutDashboard, Monitor, PanelTop, PanelsTopLeft, Plug, Power, Puzzle, Server, Settings2, ShieldAlert, Toolbox, Video } from '@/icons'
import { extensionLocalizedText, extensionTranslation, type ExtensionStatus } from '@/api/client'
import { providesCapabilities } from '@/lib/extension-category'
import { currentLanguage, t } from '@/i18n/runtime'
import IconDescriptionList from './IconDescriptionList.vue'
import PluginDetailsSectionTitle from './PluginDetailsSectionTitle.vue'

const props = defineProps<{ detail: ExtensionStatus }>()
type Feature = { id: string; icon: Component; label: string; description: string }
const deviceCapabilityMetadata: Readonly<Record<string, { key: string; icon: Component }>> = {
  video: { key: 'video', icon: Video },
  hid: { key: 'hid', icon: Keyboard },
  power: { key: 'power', icon: Power },
  'power.pwr-led': { key: 'powerLed', icon: Power },
  'power.hdd-led': { key: 'diskLed', icon: HardDrive },
  msd: { key: 'virtualMedia', icon: HardDrive },
  npu: { key: 'npu', icon: Cpu },
  screen: { key: 'screen', icon: Monitor },
}

const items = computed(() => {
  const detail = props.detail
  const result: Feature[] = []
  const add = (id: string, key: string, icon: Component, name = '', description = '') => {
    const text = (field: 'label' | 'description') => t(`settings.plugins.featureDetails.${key}.${field}`).replace('{name}', name)
    result.push({ id, icon, label: text('label'), description: description || text('description') })
  }
  if (detail.page) add('page', 'page', PanelsTopLeft, extensionTranslation(detail, currentLanguage.value).name)
  const mcpTools = new Set(detail.contributions?.filter(item => ['extend.mcp', 'mcp.tool'].includes(item.point) && item.version === 1).map(item => item.id)).size
  if (mcpTools) add('mcp-tools', 'mcpTools', Plug, '', t('settings.plugins.featureDetails.mcpTools.description').replace('{count}', String(mcpTools)))
  const mqttEntities = detail.contributions?.filter(item => item.point === 'extend.mqtt' && item.version === 1).length || 0
  if (mqttEntities) add('mqtt-entities', 'mqttEntities', Plug, '', t('settings.plugins.featureDetails.mqttEntities.description').replace('{count}', String(mqttEntities)))
  if (detail.contributions?.some(item => item.point === 'extend.notification' && item.version === 1)) add('notification-channel', 'notificationChannel', Bell)
  for (const tool of detail.toolbox?.items || []) {
    const title = extensionLocalizedText(Object.fromEntries(Object.entries(tool.i18n || {}).map(([locale, value]) => [locale, value.title])), currentLanguage.value, tool.title)
    add(`toolbox:${tool.id}`, tool.presentation === 'drawer' ? 'toolDrawer' : 'toolWindow', Toolbox, title)
  }
  if (detail.toolbar) add('toolbar', 'toolbar', PanelTop)
  if (detail.shell) add('shell', 'shell', LayoutDashboard)
  if (detail.console) add('console', 'console', ShieldAlert)
  if (detail.auth_provider) add('auth-provider', 'authProvider', Fingerprint)
  if (!detail.page && Object.keys(detail.settings_schema.properties || {}).length) add('settings', 'settings', Settings2)
  for (const service of detail.services || []) {
    const name = extensionLocalizedText(Object.fromEntries(Object.entries(service.i18n || {}).map(([locale, value]) => [locale, value.name])), currentLanguage.value, service.name)
    const description = extensionLocalizedText(Object.fromEntries(Object.entries(service.i18n || {}).map(([locale, value]) => [locale, value.description])), currentLanguage.value, service.description || '')
    add(`service:${service.id}`, 'service', Server, name, description)
  }
  // Device backends provide capabilities; extension manifests request core access.
  for (const capability of providesCapabilities(detail) ? detail.capabilities || [] : []) {
    if (Object.prototype.hasOwnProperty.call(deviceCapabilityMetadata, capability)) {
      const metadata = deviceCapabilityMetadata[capability]
      add(`capability:${capability}`, metadata.key, metadata.icon)
    } else {
      result.push({ id: `capability:${capability}`, icon: Plug, label: capability, description: t('settings.plugins.featureDetails.unknownDescription', 'This system plugin declares this device capability. No description is available in this version.') })
    }
  }
  return result
})
</script>

<template>
  <section class="plugin-features" data-declaration="features" aria-labelledby="plugin-features-title">
    <PluginDetailsSectionTitle id="plugin-features-title" :icon="Puzzle">{{ t('settings.plugins.providedFeatures', 'Provided features') }}</PluginDetailsSectionTitle>
    <IconDescriptionList v-if="items.length" :items="items">
      <template #label-suffix="{ item }">
        <n-tag v-if="item.id === 'console'" type="warning" size="small" :bordered="false">{{ t('settings.plugins.risk', 'Risk') }}</n-tag>
      </template>
    </IconDescriptionList>
    <p v-else class="plugin-feature-empty">{{ t('settings.plugins.noProvidedFeatures', 'No features declared') }}</p>
  </section>
</template>

<style scoped>
.plugin-features { display: grid; gap: 8px; }
.plugin-feature-empty { margin: 0; color: var(--muted-foreground); font-size: 12px; }
</style>
