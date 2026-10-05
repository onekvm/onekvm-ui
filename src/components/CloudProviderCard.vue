<script setup lang="ts">
import { computed, type Component } from 'vue'
import { Cloud } from '@lucide/vue'

import { extensionTranslation } from '@/api/client'
import { currentLanguage, t } from '@/i18n/runtime'
import type { CloudServiceEntry } from '@/lib/cloud-services'
import type { CloudInstallProgress } from '@/composables/useCloudServices'
import { pluginIcon } from '@/lib/plugin-icons'

const props = withDefaults(defineProps<{
  service: CloudServiceEntry
  featured?: boolean
  marketplaceUsable: boolean
  operation?: '' | 'install' | 'start' | 'stop'
  progress?: CloudInstallProgress | null
}>(), {
  featured: false,
  operation: '',
  progress: null,
})

const emit = defineEmits<{
  install: [service: CloudServiceEntry]
  start: [service: CloudServiceEntry]
  stop: [service: CloudServiceEntry]
  open: [service: CloudServiceEntry]
  manage: [service: CloudServiceEntry]
}>()

const translation = computed(() => extensionTranslation(props.service, currentLanguage.value))
const name = computed(() => props.service.id === 'cloud' ? 'OneKVM Cloud' : translation.value.name)
const description = computed(() => translation.value.description || (
  props.service.id === 'cloud'
    ? t('settings.cloudProviders.oneKVMDescription', 'Connect this device to OneKVM Cloud or a compatible custom endpoint.')
    : t('settings.cloudProviders.fallbackDescription', 'Cloud service provider for OneKVM')
))
const installAvailable = computed(() => props.marketplaceUsable && props.service.marketplaceAvailable)
const busy = computed(() => props.operation !== '')

const icon = computed<{ component: Component; url: string }>(() => pluginIcon(props.service, Cloud))

const status = computed(() => {
  if (props.operation === 'install') return t('settings.cloudProviders.statusInstalling', 'Installing')
  if (!props.service.installed) {
    return installAvailable.value
      ? t('settings.cloudProviders.statusAvailable', 'Available')
      : t('settings.cloudProviders.statusUnavailable', 'Unavailable')
  }
  if (props.service.error) return t('settings.cloudProviders.statusError', 'Error')
  if (props.service.enabled && props.service.running) return t('settings.cloudProviders.statusRunning', 'Running')
  if (props.service.enabled) return t('settings.cloudProviders.statusStarting', 'Starting')
  return t('settings.cloudProviders.statusInactive', 'Not active')
})

const statusType = computed<'default' | 'error' | 'info' | 'success' | 'warning'>(() => {
  if (props.service.error) return 'error'
  if (props.operation === 'install' || (props.service.enabled && !props.service.running)) return 'warning'
  if (props.service.running) return 'success'
  if (!props.service.installed && installAvailable.value) return 'info'
  return 'default'
})
</script>

<template>
  <article class="cloud-service-card" :class="{ featured, active: service.enabled }">
    <header class="cloud-service-header">
      <span class="cloud-service-icon" aria-hidden="true">
        <img v-if="icon.url" :src="icon.url" alt="" />
        <component v-else :is="icon.component" :size="featured ? 32 : 25" />
      </span>
      <span class="cloud-service-identity">
        <span v-if="featured" class="cloud-service-kicker">
          {{ t('settings.cloudProviders.officialService', 'Featured service') }}
        </span>
        <span class="cloud-service-title">
          <strong>{{ name }}</strong>
          <n-tag v-if="service.version" size="tiny" :bordered="false">{{ service.version }}</n-tag>
        </span>
      </span>
      <n-tag size="small" :bordered="false" :type="statusType">{{ status }}</n-tag>
    </header>

    <p class="cloud-service-description">{{ description }}</p>
    <n-alert v-if="service.error" type="error" :show-icon="false">{{ service.error }}</n-alert>

    <div v-if="operation === 'install'" class="cloud-service-progress">
      <n-progress
        type="line"
        :percentage="progress?.percentage ?? 0"
        :show-indicator="false"
        :processing="progress?.percentage === null"
        :height="5"
        :border-radius="3"
      />
      <span>{{ progress?.message || t('settings.cloudProviders.preparingInstall', 'Preparing installation…') }}</span>
    </div>

    <footer class="cloud-service-actions">
      <template v-if="!service.installed">
        <n-button
          type="primary"
          :loading="operation === 'install'"
          :disabled="busy || !installAvailable"
          @click="emit('install', service)"
        >
          {{ installAvailable
            ? t('settings.cloudProviders.install', 'Install')
            : t('settings.cloudProviders.installUnavailable', 'Online install unavailable') }}
        </n-button>
      </template>
      <template v-else-if="service.enabled">
        <n-button v-if="service.has_page" type="primary" :disabled="busy" @click="emit('open', service)">
          {{ t('settings.cloudProviders.open', 'Open') }}
        </n-button>
        <n-button :loading="operation === 'stop'" :disabled="busy" @click="emit('stop', service)">
          {{ t('settings.cloudProviders.stop', 'Stop') }}
        </n-button>
      </template>
      <template v-else>
        <n-button type="primary" :loading="operation === 'start'" :disabled="busy" @click="emit('start', service)">
          {{ t('settings.cloudProviders.start', 'Start this service') }}
        </n-button>
        <n-button :disabled="busy" @click="emit('manage', service)">
          {{ t('settings.cloudProviders.manage', 'Manage plugin') }}
        </n-button>
      </template>
    </footer>
  </article>
</template>

<style scoped>
.cloud-service-card {
  display: grid;
  min-width: 0;
  min-height: 168px;
  align-content: start;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-large);
  background: var(--onekvm-surface-raised);
  box-shadow: 0 0 0 1px rgb(255 255 255 / 2%);
  transition: border-color 160ms cubic-bezier(.23, 1, .32, 1), transform 160ms cubic-bezier(.23, 1, .32, 1);
}

.cloud-service-card:hover { border-color: var(--border-strong); transform: translateY(-1px); }
.cloud-service-card.active { border-color: color-mix(in srgb, var(--success) 45%, var(--border)); }

.cloud-service-card.featured {
  min-height: 212px;
  padding: 20px;
  border-color: color-mix(in srgb, var(--primary) 44%, var(--border));
  background: color-mix(in srgb, var(--onekvm-surface-raised) 91%, var(--primary));
}

.cloud-service-header { display: flex; min-width: 0; align-items: center; gap: 12px; }

.cloud-service-icon {
  display: grid;
  width: 48px;
  height: 48px;
  flex: 0 0 48px;
  place-items: center;
  border-radius: var(--radius-large);
  background: color-mix(in srgb, var(--primary) 16%, transparent);
  color: var(--primary);
}

.featured .cloud-service-icon { width: 58px; height: 58px; flex-basis: 58px; }
.cloud-service-icon:has(img) { background: transparent; overflow: hidden; }
.cloud-service-icon img { width: 100%; height: 100%; object-fit: contain; }
.cloud-service-identity { display: grid; min-width: 0; flex: 1; gap: 3px; }
.cloud-service-kicker { color: var(--primary); font-size: 11px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; }
.cloud-service-title { display: flex; min-width: 0; align-items: center; gap: 8px; }
.cloud-service-title strong { overflow: hidden; color: var(--foreground); font-size: 16px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.featured .cloud-service-title strong { font-size: 22px; letter-spacing: -.02em; }
.cloud-service-description { max-width: 720px; margin: 0; color: var(--muted-foreground); font-size: 12px; line-height: 1.6; text-wrap: pretty; }
.cloud-service-progress { display: grid; gap: 6px; color: var(--muted-foreground); font-size: 11px; font-variant-numeric: tabular-nums; }
.cloud-service-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: auto; padding-top: 4px; }
.cloud-service-actions :deep(.n-button) { min-height: 34px; }

@media (max-width: 620px) {
  .cloud-service-card,
  .cloud-service-card.featured { min-height: 0; padding: 14px; }
  .cloud-service-header {
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr);
    align-items: start;
  }
  .featured .cloud-service-header { grid-template-columns: 58px minmax(0, 1fr); }
  .cloud-service-icon { grid-row: 1 / span 2; }
  .cloud-service-header > .n-tag { grid-column: 2; justify-self: start; }
  .cloud-service-actions :deep(.n-button) { flex: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .cloud-service-card { transition: none; }
}
</style>
