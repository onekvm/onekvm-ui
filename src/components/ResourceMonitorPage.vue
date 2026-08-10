<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import {
  api,
  extensionTranslation,
  type ExtensionSummary,
  type ResourceHistory,
  type ServiceResourceUsage,
} from '@/api/client'
import { currentLanguage, t } from '@/i18n/runtime'

import ResourceChart, { type ResourceChartSeries } from './ResourceChart.vue'

const props = defineProps<{ extensions: ExtensionSummary[] }>()

const history = ref<ResourceHistory | null>(null)
const error = ref('')
let refreshTimer: number | null = null
let refreshing = false

const samples = computed(() => history.value?.samples || [])
const latest = computed(() => samples.value[samples.value.length - 1])
const timestamps = computed(() => samples.value.map((sample) => sample.timestamp))
const cpuSeries = computed<ResourceChartSeries[]>(() => [{
  name: t('settings.advancedSettings.resourcesPage.total', 'Total'),
  color: '#42d2a4',
  values: samples.value.map((sample) => sample.cpu_percent),
}])
const memorySeries = computed<ResourceChartSeries[]>(() => [{
  name: t('settings.advancedSettings.resourcesPage.used', 'Used'),
  color: '#61aef4',
  values: samples.value.map((sample) => sample.memory_total_bytes
    ? sample.memory_used_bytes * 100 / sample.memory_total_bytes
    : 0),
}])
const networkSeries = computed<ResourceChartSeries[]>(() => [
  {
    name: t('settings.advancedSettings.resourcesPage.receive', 'Receive'),
    color: '#42d2a4',
    values: samples.value.map((sample) => sample.network_receive_bytes_per_second),
  },
  {
    name: t('settings.advancedSettings.resourcesPage.transmit', 'Transmit'),
    color: '#f2b75d',
    values: samples.value.map((sample) => sample.network_transmit_bytes_per_second),
  },
])
const networkMaximum = computed(() => Math.max(1, ...networkSeries.value.flatMap((item) => item.values)) * 1.12)

type ServiceRow = ServiceResourceUsage & { name: string; status: string }
const serviceRows = computed<ServiceRow[]>(() => {
  const usage = new Map((history.value?.services || []).map((service) => [`${service.kind}:${service.id}`, service]))
  const rows: ServiceRow[] = []
  const core = usage.get('core:onekvm-server')
  const host = usage.get('system:plugin-host')
  if (host) {
    rows.push({
      ...host,
      name: t('settings.advancedSettings.resourcesPage.pluginHost', 'Plugin host'),
      status: t('settings.advancedSettings.resourcesPage.running', 'Running'),
    })
  }
  const included = new Set<string>()
  const includedSystems = new Set<string>(['plugin-host'])
  for (const extension of props.extensions.filter((item) => item.installed && item.system)) {
    const resource = usage.get(`system:${extension.id}`)
    if (!resource && !extension.running) continue
    includedSystems.add(extension.id)
    rows.push({
      id: extension.id,
      kind: 'system',
      name: extensionTranslation(extension, currentLanguage.value).name,
      cpu_percent: resource?.cpu_percent || 0,
      memory_bytes: resource?.memory_bytes || 0,
      status: extension.running
        ? t('settings.advancedSettings.resourcesPage.running', 'Running')
        : t('settings.advancedSettings.resourcesPage.stopped', 'Stopped'),
    })
  }
  for (const resource of history.value?.services || []) {
    if (resource.kind !== 'system' || includedSystems.has(resource.id)) continue
    rows.push({
      ...resource,
      name: resource.id,
      status: resource.memory_bytes > 0
        ? t('settings.advancedSettings.resourcesPage.running', 'Running')
        : t('settings.advancedSettings.resourcesPage.stopped', 'Stopped'),
    })
  }
  for (const extension of props.extensions.filter((item) => item.installed && !item.system)) {
    const resource = usage.get(`extension:${extension.id}`)
    included.add(extension.id)
    rows.push({
      id: extension.id,
      kind: 'extension',
      name: `${t('settings.advancedSettings.resourcesPage.pluginPrefix', 'Plugin')}: ${extensionTranslation(extension, currentLanguage.value).name}`,
      cpu_percent: resource?.cpu_percent || 0,
      memory_bytes: resource?.memory_bytes || 0,
      status: extension.running
        ? t('settings.advancedSettings.resourcesPage.running', 'Running')
        : t('settings.advancedSettings.resourcesPage.stopped', 'Stopped'),
    })
  }
  for (const resource of history.value?.services || []) {
    if (resource.kind !== 'extension' || included.has(resource.id)) continue
    rows.push({
      ...resource,
      name: `${t('settings.advancedSettings.resourcesPage.pluginPrefix', 'Plugin')}: ${resource.id}`,
      status: resource.memory_bytes > 0
        ? t('settings.advancedSettings.resourcesPage.running', 'Running')
        : t('settings.advancedSettings.resourcesPage.stopped', 'Stopped'),
    })
  }
  rows.push({
    id: 'onekvm-server', kind: 'core', name: 'onekvm-server',
    cpu_percent: core?.cpu_percent || 0, memory_bytes: core?.memory_bytes || 0,
    status: t('settings.advancedSettings.resourcesPage.running', 'Running'),
  })
  return rows
})

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** index
  return `${value.toFixed(index === 0 || value >= 10 ? 0 : 1)} ${units[index]}`
}

function formatRate(bytes: number) {
  return `${formatBytes(bytes)}/s`
}

function hasMemoryBreakdown(service: ServiceResourceUsage) {
  return service.kind === 'extension'
    && (service.helper_memory_bytes !== undefined || service.process_memory_bytes !== undefined)
}

async function refresh() {
  if (refreshing) return
  refreshing = true
  try {
    history.value = await api.getResources()
    error.value = ''
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    refreshing = false
  }
}

onMounted(() => {
  void refresh()
  refreshTimer = window.setInterval(refresh, 2000)
})
onBeforeUnmount(() => {
  if (refreshTimer !== null) window.clearInterval(refreshTimer)
})
</script>

<template>
<section class="resource-monitor-page">
  <n-alert v-if="error" type="error" :bordered="false">{{ error }}</n-alert>
  <div class="resource-chart-grid">
    <ResourceChart
      :title="t('settings.advancedSettings.resourcesPage.cpu', 'CPU')"
      :value="`${(latest?.cpu_percent || 0).toFixed(1)}%`"
      :series="cpuSeries"
      :timestamps="timestamps"
      :format-value="(value: number) => `${value.toFixed(1)}%`"
      :max="100"
      max-label="100%"
      :empty-label="t('settings.advancedSettings.resourcesPage.collecting', 'Collecting data')"
      :now-label="t('settings.advancedSettings.resourcesPage.now', 'Now')"
    />
    <ResourceChart
      :title="t('settings.advancedSettings.resourcesPage.memory', 'Memory')"
      :value="`${formatBytes(latest?.memory_used_bytes || 0)} / ${formatBytes(latest?.memory_total_bytes || 0)}`"
      :series="memorySeries"
      :timestamps="timestamps"
      :format-value="(value: number) => `${value.toFixed(1)}%`"
      :max="100"
      max-label="100%"
      :empty-label="t('settings.advancedSettings.resourcesPage.collecting', 'Collecting data')"
      :now-label="t('settings.advancedSettings.resourcesPage.now', 'Now')"
    />
    <ResourceChart
      class="resource-network-chart"
      :title="t('settings.advancedSettings.resourcesPage.network', 'Network')"
      :value="`↓ ${formatRate(latest?.network_receive_bytes_per_second || 0)}  ↑ ${formatRate(latest?.network_transmit_bytes_per_second || 0)}`"
      :series="networkSeries"
      :timestamps="timestamps"
      :format-value="formatRate"
      :max="networkMaximum"
      :max-label="formatRate(networkMaximum)"
      :empty-label="t('settings.advancedSettings.resourcesPage.collecting', 'Collecting data')"
      :now-label="t('settings.advancedSettings.resourcesPage.now', 'Now')"
    />
  </div>

  <section class="resource-services-section">
    <header>
      <h2>{{ t('settings.advancedSettings.resourcesPage.services', 'OneKVM and plugin usage') }}</h2>
      <span>{{ t('settings.advancedSettings.resourcesPage.lastFiveMinutes', 'Last 5 minutes') }}</span>
    </header>
    <div class="resource-table-scroll">
      <table>
        <thead>
          <tr>
            <th>{{ t('settings.advancedSettings.resourcesPage.component', 'Component') }}</th>
            <th>{{ t('settings.advancedSettings.resourcesPage.status', 'Status') }}</th>
            <th>CPU</th>
            <th>{{ t('settings.advancedSettings.resourcesPage.memory', 'Memory') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="service in serviceRows" :key="`${service.kind}:${service.id}`">
            <td><strong>{{ service.name }}</strong><small>{{ service.id }}</small></td>
            <td><span class="resource-service-state" :class="{ running: service.status === t('settings.advancedSettings.resourcesPage.running', 'Running') }"><i />{{ service.status }}</span></td>
            <td>{{ service.cpu_percent.toFixed(1) }}%</td>
            <td>
              <span class="resource-memory-total">{{ formatBytes(service.memory_bytes) }}</span>
              <small v-if="hasMemoryBreakdown(service)" class="resource-memory-breakdown">
                {{ t('settings.advancedSettings.resourcesPage.pluginProcesses', 'Processes') }}
                {{ formatBytes(service.process_memory_bytes || 0) }} ·
                {{ t('settings.advancedSettings.resourcesPage.helper', 'Helper') }}
                {{ formatBytes(service.helper_memory_bytes || 0) }}
              </small>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</section>
</template>
