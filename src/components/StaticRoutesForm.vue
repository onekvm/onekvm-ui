<script setup lang="ts">
import { computed } from 'vue'
import { Plus, Trash2 } from '@lucide/vue'

import type { StaticRoute } from '@/api/client'
import { t } from '@/i18n/runtime'
import { isIPv4, isIPv6, validCIDR } from '@/lib/network'

const props = defineProps<{ modelValue: StaticRoute[]; interfaces: string[]; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: StaticRoute[]] }>()

const interfaceOptions = computed(() => [
  { label: t('network.routes.primaryInterface', 'Primary interface'), value: '' },
  ...props.interfaces.map((name) => ({ label: name, value: name })),
])

function addRoute() {
  emit('update:modelValue', [...props.modelValue, { destination: '', next_hop: '', interface: '', metric: 100 }])
}

function updateRoute(index: number, update: Partial<StaticRoute>) {
  const routes = props.modelValue.map((route, routeIndex) => routeIndex === index ? { ...route, ...update } : route)
  emit('update:modelValue', routes)
}

function removeRoute(index: number) {
  emit('update:modelValue', props.modelValue.filter((_, routeIndex) => routeIndex !== index))
}

function destinationValid(value: string) {
  return validCIDR(value, value.includes(':') ? 6 : 4)
}

function nextHopValid(route: StaticRoute) {
  return route.destination.includes(':') ? isIPv6(route.next_hop) : isIPv4(route.next_hop)
}
</script>

<template>
  <section class="network-global-card">
    <header>
      <div>
        <h2>{{ t('network.routes.title', 'Static routes') }}</h2>
        <p>{{ t('network.routes.description', 'Route selected prefixes through a fixed next hop.') }}</p>
      </div>
      <n-button size="small" secondary :disabled="disabled" @click="addRoute">
        <template #icon><Plus /></template>
        {{ t('network.routes.add', 'Add route') }}
      </n-button>
    </header>

    <n-empty v-if="modelValue.length === 0" :description="t('network.routes.empty', 'No static routes')" size="small" />
    <div v-for="(route, index) in modelValue" :key="index" class="route-panel">
      <div class="route-fields">
        <n-form-item :label="t('network.routes.destination', 'Destination prefix')">
          <n-input
            :value="route.destination"
            :disabled="disabled"
            placeholder="192.0.2.0/24"
            :status="route.destination && !destinationValid(route.destination) ? 'error' : undefined"
            @update:value="updateRoute(index, { destination: $event })"
          />
        </n-form-item>
        <n-form-item :label="t('network.routes.nextHop', 'Next hop')">
          <n-input
            :value="route.next_hop"
            :disabled="disabled"
            placeholder="192.0.2.1"
            :status="route.next_hop && !nextHopValid(route) ? 'error' : undefined"
            @update:value="updateRoute(index, { next_hop: $event })"
          />
        </n-form-item>
        <n-form-item :label="t('network.routes.interface', 'Interface')">
          <n-select
            :value="route.interface || ''"
            :options="interfaceOptions"
            :disabled="disabled"
            @update:value="updateRoute(index, { interface: $event })"
          />
        </n-form-item>
        <n-form-item :label="t('network.routes.metric', 'Metric')">
          <n-input-number
            :value="route.metric"
            :disabled="disabled"
            :min="0"
            :precision="0"
            @update:value="updateRoute(index, { metric: $event || 0 })"
          />
        </n-form-item>
      </div>
      <div class="route-actions">
        <n-button quaternary size="small" type="error" :disabled="disabled" @click="removeRoute(index)">
          <template #icon><Trash2 /></template>
          {{ t('network.routes.remove', 'Remove route') }}
        </n-button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.network-global-card { display: grid; gap: 14px; padding-top: 18px; border-top: 1px solid var(--border); }
.network-global-card > header { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.network-global-card header h2 { margin: 0; font-size: 14px; }
.network-global-card header p { margin: 4px 0 0; color: var(--muted-foreground); font-size: 11px; }
.route-panel {
  overflow: hidden;
  border: 1px solid var(--border, var(--border));
  border-radius: var(--radius-large, 7px);
  background: var(--card, var(--card));
}
.route-fields {
  display: grid;
  grid-template-columns: minmax(145px, 1.25fr) minmax(130px, 1fr) minmax(120px, .8fr) 100px;
  align-items: end;
  gap: 10px;
  padding: 14px;
}
.route-fields :deep(.n-form-item) { margin-bottom: 0; }
.route-actions {
  display: flex;
  justify-content: flex-end;
  padding: 6px 8px;
  border-top: 1px solid var(--border, var(--border));
}
@media (max-width: 760px) {
  .network-global-card > header { align-items: flex-start; flex-wrap: wrap; }
  .route-fields { grid-template-columns: 1fr; gap: 12px; padding: 14px 12px; }
}
</style>
