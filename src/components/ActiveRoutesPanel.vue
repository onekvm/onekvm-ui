<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RefreshCw } from '@lucide/vue'

import { api, type ActiveNetworkRoute } from '@/api/client'
import { t } from '@/i18n/runtime'

const routes = ref<ActiveNetworkRoute[]>([])
const loading = ref(false)
const error = ref('')

const rows = computed(() => routes.value.map((route) => ({
  ...route,
  next_hop: route.next_hop || '-',
  interface: route.interface || '-',
  metric: route.metric || 0,
  protocol: route.protocol || '-',
})))

async function load() {
  loading.value = true
  error.value = ''
  try {
    routes.value = await api.getNetworkActiveRoutes()
  } catch (value) {
    error.value = value instanceof Error ? value.message : String(value)
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <section class="network-global-card active-routes-card">
    <header>
      <div>
        <h2>{{ t('network.activeRoutes.title', 'Active routes') }}</h2>
        <p>{{ t('network.activeRoutes.description', 'Routes currently installed in the kernel routing table.') }}</p>
      </div>
      <n-tooltip>
        <template #trigger>
          <n-button quaternary circle size="small" :loading="loading" :aria-label="t('network.activeRoutes.refresh', 'Refresh active routes')" @click="load">
            <template #icon><RefreshCw /></template>
          </n-button>
        </template>
        {{ t('network.activeRoutes.refresh', 'Refresh active routes') }}
      </n-tooltip>
    </header>

    <n-alert v-if="error" type="error" :show-icon="false">{{ error }}</n-alert>
    <n-spin :show="loading">
      <n-empty v-if="!loading && rows.length === 0" :description="t('network.activeRoutes.empty', 'No active routes')" size="small" />
      <div v-else class="active-routes-table-wrap">
        <table class="active-routes-table">
          <thead>
            <tr>
              <th>{{ t('network.activeRoutes.destination', 'Destination') }}</th>
              <th>{{ t('network.activeRoutes.nextHop', 'Next hop') }}</th>
              <th>{{ t('network.activeRoutes.interface', 'Interface') }}</th>
              <th>{{ t('network.activeRoutes.metric', 'Metric') }}</th>
              <th>{{ t('network.activeRoutes.protocol', 'Protocol') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="route in rows" :key="`${route.address_family}:${route.destination}:${route.interface}:${route.next_hop}:${route.metric}`">
              <td><span class="route-family">{{ route.address_family.toUpperCase() }}</span>{{ route.destination }}</td>
              <td>{{ route.next_hop }}</td>
              <td>{{ route.interface }}</td>
              <td>{{ route.metric }}</td>
              <td>{{ route.protocol }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </n-spin>
  </section>
</template>

<style scoped>
.network-global-card { display: grid; gap: 14px; padding-top: 18px; border-top: 1px solid #30363d; }
.network-global-card > header { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.network-global-card header h2 { margin: 0; font-size: 14px; }
.network-global-card header p { margin: 4px 0 0; color: #8f99a3; font-size: 11px; }
.active-routes-table-wrap { overflow-x: auto; border: 1px solid #30363d; border-radius: 6px; }
.active-routes-table { width: 100%; border-collapse: collapse; font-size: 12px; text-align: left; }
.active-routes-table th { color: #8f99a3; font-weight: 500; background: #15191e; }
.active-routes-table th, .active-routes-table td { padding: 9px 12px; white-space: nowrap; }
.active-routes-table tbody tr + tr { border-top: 1px solid #282e35; }
.route-family { display: inline-block; min-width: 34px; margin-right: 8px; color: #58a6ff; font-size: 10px; }
</style>
