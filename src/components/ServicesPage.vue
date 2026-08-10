<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, type Component } from 'vue'
import { Box, Clock3, Play, RotateCw, Server, ServerCog, Settings2, Square, SquareTerminal, icons } from '@lucide/vue'
import { useMessage } from 'naive-ui'

import { api, extensionAssetURL, type ExtensionSummary, type ManagedService } from '@/api/client'
import { currentLanguage, t } from '@/i18n/runtime'

import ServiceSettingsDrawer from './ServiceSettingsDrawer.vue'

const props = defineProps<{ extensions: ExtensionSummary[] }>()
const emit = defineEmits<{ navigate: [route: string] }>()
const services = ref<ManagedService[]>([])
const loading = ref(false)
const refreshing = ref(false)
const busy = ref('')
const error = ref('')
const settingsKind = ref<'onekvm' | 'ssh' | null>(null)
const message = useMessage()
let refreshTimer: number | null = null

const extensionsByID = computed(() => new Map(props.extensions.map((extension) => [extension.id, extension])))
const systemServiceIcons: Record<string, Component> = {
  'system.onekvm': ServerCog,
  'system.ssh': SquareTerminal,
  'system.time-sync': Clock3,
}

function serviceIconURL(service: ManagedService) {
  if (service.kind !== 'extension' || !service.provider_id) return ''
  const extension = extensionsByID.value.get(service.provider_id)
  const icon = extension?.icon
  return extension && icon?.source === 'custom' ? extensionAssetURL(extension, icon.path) : ''
}

function serviceIconComponent(service: ManagedService): Component {
  if (service.kind === 'system') return systemServiceIcons[service.id] || Server
  if (!service.provider_id) return Box
  const icon = extensionsByID.value.get(service.provider_id)?.icon
  if (icon?.source !== 'lucide') return Box
  const name = icon.name.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('')
  return (icons as Record<string, Component>)[name] || Box
}

function translation(service: ManagedService) {
  const localized = service.i18n || {}
  const language = currentLanguage.value
  const normalized = language.replace('_', '-')
  const base = normalized.split('-')[0]
  return localized[language] || localized[normalized] || localized[base] || localized.default || {
    name: service.name,
    description: service.description || '',
  }
}

function extensionServiceVisible(service: ManagedService) {
  if (service.kind !== 'extension' || !service.provider_id) return true
  const extension = extensionsByID.value.get(service.provider_id)
	return extension?.installed === true && (extension.system === true || extension.enabled === true)
}

const groups = computed(() => [
  {
    kind: 'system',
    title: t('settings.advancedSettings.servicesPage.system', 'System services'),
    services: services.value.filter((service) => service.kind === 'system'),
  },
  {
    kind: 'extension',
    title: t('settings.advancedSettings.servicesPage.extensions', 'Plugin services'),
    services: services.value.filter((service) => service.kind === 'extension' && extensionServiceVisible(service)),
  },
].filter((group) => group.services.length > 0))

async function refresh(showSpinner = false) {
	if (refreshing.value || busy.value !== '') return
  refreshing.value = true
  if (showSpinner) loading.value = true
  try {
    services.value = await api.getServices()
    error.value = ''
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    refreshing.value = false
    loading.value = false
  }
}

type ServiceAction = 'start' | 'stop' | 'restart' | 'enable' | 'disable'

async function perform(service: ManagedService, action: ServiceAction) {
  busy.value = `${service.id}:${action}`
  const previous = { running: service.running, enabled: service.enabled }
  if (action === 'enable') service.enabled = true
  if (action === 'disable') service.enabled = false
  if (action === 'start') service.running = true
  if (action === 'stop') service.running = false
  try {
    await api.serviceAction(service.id, action)
    const success = {
      start: ['started', 'Service started'],
      stop: ['stoppedMessage', 'Service stopped'],
      restart: ['restarted', 'Service restarted'],
      enable: ['autostartEnabled', 'Start at boot enabled'],
      disable: ['autostartDisabled', 'Start at boot disabled'],
    }[action]
    message.success(t(`settings.advancedSettings.servicesPage.${success[0]}`, success[1]))
  } catch (reason) {
	service.running = previous.running
	service.enabled = previous.enabled
    message.error(reason instanceof Error ? reason.message : String(reason))
  } finally {
    busy.value = ''
  }
}

function supports(service: ManagedService, action: ServiceAction) {
  return service.actions.includes(action)
}

function setAutostart(service: ManagedService, enabled: boolean) {
  void perform(service, enabled ? 'enable' : 'disable')
}

function supportsSettings(service: ManagedService) {
  return service.id === 'system.onekvm' || service.id === 'system.ssh' || service.id === 'system.time-sync'
}

function openSettings(service: ManagedService) {
  if (service.id === 'system.onekvm') settingsKind.value = 'onekvm'
  else if (service.id === 'system.ssh') settingsKind.value = 'ssh'
  else if (service.id === 'system.time-sync') emit('navigate', 'time')
}

function closeSettings(show: boolean) {
  if (!show) settingsKind.value = null
}

onMounted(() => {
  void refresh(true)
	// Service actions update the local row immediately. A slower safety refresh
	// reconciles external changes without querying systemd again immediately
	// after PID 1 has completed a restart job on small devices.
  refreshTimer = window.setInterval(refresh, 10000)
})

onBeforeUnmount(() => {
  if (refreshTimer !== null) window.clearInterval(refreshTimer)
})
</script>

<template>
  <section class="services-page">
    <n-alert v-if="error" type="error" :bordered="false">{{ error }}</n-alert>
    <n-spin :show="loading">
      <n-empty v-if="!loading && services.length === 0" :description="t('settings.advancedSettings.servicesPage.empty', 'No services registered')" />
      <section v-for="group in groups" :key="group.kind" class="services-group">
        <header>
          <h2>{{ group.title }}</h2>
          <span>{{ group.services.length }}</span>
        </header>
        <ul>
          <li v-for="service in group.services" :key="service.id">
            <span class="service-icon">
              <img v-if="serviceIconURL(service)" :src="serviceIconURL(service)" alt="" />
              <component v-else :is="serviceIconComponent(service)" :size="19" />
            </span>
            <div class="service-identity">
              <div class="service-title">
                <strong>{{ translation(service).name }}</strong>
                <code v-if="service.unit">{{ service.unit }}</code>
              </div>
              <p>{{ translation(service).description }}</p>
            </div>
            <span class="service-state" :class="{ running: service.running }"><i />{{ service.running ? t('settings.advancedSettings.servicesPage.running', 'Running') : t('settings.advancedSettings.servicesPage.stopped', 'Stopped') }}</span>
            <label class="service-autostart" :class="{ unsupported: !supports(service, 'enable') || !supports(service, 'disable') }">
              <span>{{ t('settings.advancedSettings.servicesPage.autostart', 'Start at boot') }}</span>
              <n-switch
                size="small"
                :value="service.enabled"
                :loading="busy === `${service.id}:enable` || busy === `${service.id}:disable`"
                :disabled="!supports(service, 'enable') || !supports(service, 'disable') || busy !== ''"
                @update:value="setAutostart(service, $event)"
              />
            </label>
            <div class="service-actions">
              <n-tooltip>
                <template #trigger>
                  <span class="service-action-trigger">
                    <n-button quaternary circle size="small" :disabled="!supportsSettings(service) || busy !== ''" :aria-label="`${t('settings.advancedSettings.servicesPage.settings', 'Settings')} ${translation(service).name}`" @click="openSettings(service)">
                      <template #icon><Settings2 /></template>
                    </n-button>
                  </span>
                </template>
                {{ t('settings.advancedSettings.servicesPage.settings', 'Settings') }}<template v-if="!supportsSettings(service)"> · {{ t('settings.advancedSettings.servicesPage.notSupported', 'Not supported') }}</template>
              </n-tooltip>
              <n-tooltip v-if="service.running">
                <template #trigger>
                  <span class="service-action-trigger">
                    <n-button quaternary circle size="small" :loading="busy === `${service.id}:stop`" :disabled="!supports(service, 'stop') || busy !== ''" :aria-label="`${t('settings.advancedSettings.servicesPage.stop', 'Stop')} ${translation(service).name}`" @click="perform(service, 'stop')">
                      <template #icon><Square /></template>
                    </n-button>
                  </span>
                </template>
                {{ t('settings.advancedSettings.servicesPage.stop', 'Stop') }}<template v-if="!supports(service, 'stop')"> · {{ t('settings.advancedSettings.servicesPage.notSupported', 'Not supported') }}</template>
              </n-tooltip>
              <n-tooltip v-else>
                <template #trigger>
                  <span class="service-action-trigger">
                    <n-button quaternary circle size="small" :loading="busy === `${service.id}:start`" :disabled="!supports(service, 'start') || busy !== ''" :aria-label="`${t('settings.advancedSettings.servicesPage.start', 'Start')} ${translation(service).name}`" @click="perform(service, 'start')">
                      <template #icon><Play /></template>
                    </n-button>
                  </span>
                </template>
                {{ t('settings.advancedSettings.servicesPage.start', 'Start') }}<template v-if="!supports(service, 'start')"> · {{ t('settings.advancedSettings.servicesPage.notSupported', 'Not supported') }}</template>
              </n-tooltip>
              <n-tooltip>
                <template #trigger>
                  <span class="service-action-trigger">
                    <n-button quaternary circle size="small" :loading="busy === `${service.id}:restart`" :disabled="!service.running || !supports(service, 'restart') || busy !== ''" :aria-label="`${t('settings.advancedSettings.servicesPage.restart', 'Restart')} ${translation(service).name}`" @click="perform(service, 'restart')">
                      <template #icon><RotateCw /></template>
                    </n-button>
                  </span>
                </template>
                {{ t('settings.advancedSettings.servicesPage.restart', 'Restart') }}<template v-if="!supports(service, 'restart')"> · {{ t('settings.advancedSettings.servicesPage.notSupported', 'Not supported') }}</template>
              </n-tooltip>
            </div>
          </li>
        </ul>
      </section>
    </n-spin>
    <ServiceSettingsDrawer
      :show="settingsKind !== null"
      :kind="settingsKind || 'onekvm'"
      @update:show="closeSettings"
    />
  </section>
</template>
