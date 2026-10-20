<script setup lang="ts">
import { computed, type Component } from 'vue'
import { CircuitBoard, Globe, Keyboard, Monitor, Network, Package, ScanLine, Settings2, ShieldAlert, ShieldCheck, Video } from '@/icons'
import { t } from '@/i18n/runtime'
import IconDescriptionList from './IconDescriptionList.vue'
import PluginDetailsSectionTitle from './PluginDetailsSectionTitle.vue'

const props = defineProps<{ permissions?: string[] }>()

const permissionIcons: Readonly<Record<string, Component>> = {
  network: Globe,
  'network-info': Network,
  'network-admin': Settings2,
  'device-video': Video,
  'device-hid': Keyboard,
  'device-i2c': CircuitBoard,
  'device-fb': Monitor,
  gpio: ScanLine,
  'opkg-admin': Package,
}

const items = computed(() => (props.permissions || []).map(id => {
  const known = Object.prototype.hasOwnProperty.call(permissionIcons, id)
  return {
    id,
    icon: known ? permissionIcons[id] : ShieldCheck,
    label: known ? t(`settings.plugins.permissionDetails.${id}.label`) : id,
    description: known
      ? t(`settings.plugins.permissionDetails.${id}.description`)
      : t('settings.plugins.permissionDetails.unknownDescription', 'This permission is declared by the plugin. No description is available in this version.'),
  }
}))
</script>

<template>
  <section class="plugin-permissions" data-declaration="permissions" aria-labelledby="plugin-permissions-title">
    <PluginDetailsSectionTitle id="plugin-permissions-title" :icon="ShieldCheck">{{ t('settings.plugins.permissions', 'Permissions') }}</PluginDetailsSectionTitle>
    <IconDescriptionList v-if="items.length" :items="items" />
    <p v-else class="plugin-permission-empty">{{ permissions == null ? t('settings.plugins.metadataUnavailable', 'Information unavailable') : t('settings.plugins.noPermissions', 'No permissions declared') }}</p>
  </section>
</template>

<style scoped>
.plugin-permissions { display: grid; gap: 8px; }
.plugin-permission-empty { margin: 0; color: var(--muted-foreground); font-size: 12px; }
</style>
