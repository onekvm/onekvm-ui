<script setup lang="ts">
import { ref, useId } from 'vue'
import { ChevronRight } from '@/icons'
import { t } from '@/i18n/runtime'
import { validMACAddress } from '@/lib/network'

import ExpandablePanel from './ExpandablePanel.vue'
import NetworkMtuField from './NetworkMtuField.vue'

withDefaults(defineProps<{
  mtu?: number
  macAddress?: string
  routeMetric?: number
  ipv6?: boolean
  disabled?: boolean
  showMtu?: boolean
  showMac?: boolean
  showRouteMetric?: boolean
  inset?: boolean
}>(), {
  showMtu: true,
  showMac: false,
  showRouteMetric: true,
})

const emit = defineEmits<{
  'update:mtu': [value: number]
  'update:macAddress': [value: string]
  'update:routeMetric': [value: number]
}>()
const expanded = ref(false)
const panelId = useId()
</script>

<template>
  <div class="network-advanced" :class="{ 'is-inset': inset }">
    <button
      type="button"
      class="network-advanced-toggle"
      :aria-expanded="expanded"
      :aria-controls="panelId"
      @click="expanded = !expanded"
    >
      <ChevronRight :size="16" class="network-advanced-arrow" :class="{ 'is-expanded': expanded }" aria-hidden="true" />
      {{ t('network.interfaces.advanced', 'Advanced settings') }}
    </button>
    <ExpandablePanel :id="panelId" :show="expanded">
      <div class="network-advanced-fields">
        <n-form-item v-if="showMac" class="network-advanced-mac" :label="t('network.interfaces.macAddress', 'MAC address')">
          <n-input
            :value="macAddress || ''"
            :input-props="{ 'aria-label': t('network.interfaces.macAddress', 'MAC address') }"
            :disabled="disabled"
            placeholder="02:00:00:00:00:01"
            clearable
            :status="!validMACAddress(macAddress) ? 'error' : undefined"
            @update:value="emit('update:macAddress', $event.trim())"
          />
          <template #feedback>
            {{ t('network.interfaces.macAddressHint', 'Leave empty to use the hardware MAC address.') }}
          </template>
        </n-form-item>

        <NetworkMtuField
          v-if="showMtu"
          :model-value="mtu"
          :ipv6="ipv6"
          :disabled="disabled"
          @update:model-value="emit('update:mtu', $event)"
        />

        <n-form-item v-if="showRouteMetric" :label="t('network.interfaces.routeMetric', 'Route metric')">
          <n-input-number
            :value="routeMetric"
            :input-props="{ 'aria-label': t('network.interfaces.routeMetric', 'Route metric') }"
            :disabled="disabled"
            :min="0"
            :precision="0"
            @update:value="emit('update:routeMetric', $event ?? 0)"
          />
        </n-form-item>
      </div>
    </ExpandablePanel>
  </div>
</template>

<style scoped>
.network-advanced { padding-top: 12px; border-top: 1px solid var(--border); }
.network-advanced.is-inset { margin-top: 20px; padding-top: 16px; border-color: var(--border-strong); }
.network-advanced-toggle { display: flex; align-items: center; gap: 8px; width: 100%; padding: 4px 0; border: 0; background: transparent; color: var(--muted-foreground); font: inherit; font-size: 13px; font-weight: 500; text-align: left; cursor: pointer; }
.network-advanced-toggle:focus-visible { outline: 2px solid var(--primary); outline-offset: 4px; border-radius: 4px; }
.network-advanced-arrow { flex-shrink: 0; transition: transform 220ms cubic-bezier(0.23, 1, 0.32, 1); }
.network-advanced-arrow.is-expanded { transform: rotate(90deg); }
.network-advanced-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; gap: 8px 12px; padding-top: 16px; }
.network-advanced-mac { grid-column: 1 / -1; }
.network-advanced-fields :deep(.n-input-number) { width: 100%; }
@media (max-width: 760px) {
  .network-advanced-fields { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) {
  .network-advanced-arrow { transition: none; }
}
</style>
