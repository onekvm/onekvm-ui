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
    <div v-for="(route, index) in modelValue" :key="index" class="route-row">
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
      <n-tooltip>
        <template #trigger>
          <n-button quaternary circle type="error" :disabled="disabled" :aria-label="t('network.routes.remove', 'Remove route')" @click="removeRoute(index)">
            <template #icon><Trash2 /></template>
          </n-button>
        </template>
        {{ t('network.routes.remove', 'Remove route') }}
      </n-tooltip>
    </div>
  </section>
</template>

<style scoped>
.network-global-card { display: grid; gap: 14px; padding-top: 18px; border-top: 1px solid #30363d; }
.network-global-card > header { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.network-global-card header h2 { margin: 0; font-size: 14px; }
.network-global-card header p { margin: 4px 0 0; color: #8f99a3; font-size: 11px; }
.route-row { display: grid; grid-template-columns: minmax(145px, 1.25fr) minmax(130px, 1fr) minmax(120px, .8fr) 100px 34px; align-items: end; gap: 10px; }
@media (max-width: 760px) {
  .route-row { grid-template-columns: 1fr 1fr; }
  .route-row > :last-child { justify-self: end; }
}
@media (max-width: 520px) {
  .network-global-card > header { align-items: flex-start; }
  .route-row { grid-template-columns: 1fr; }
}
</style>
