<script setup lang="ts">
import { computed } from 'vue'

import type { IPv4Mode, IPv6Mode } from '@/api/client'
import { t } from '@/i18n/runtime'
import { isIPv4, isIPv6, validCIDR } from '@/lib/network'

interface NetworkAddressConfig {
  ipv4_mode: IPv4Mode
  ipv4_address: string
  ipv4_gateway: string
  ipv6_mode: IPv6Mode
  ipv6_address: string
  ipv6_gateway: string
  route_metric: number
}

const props = withDefaults(defineProps<{
  modelValue: NetworkAddressConfig
  disabled?: boolean
  allowIPv4Disabled?: boolean
}>(), {
  disabled: false,
  allowIPv4Disabled: true,
})

const emit = defineEmits<{ 'update:modelValue': [value: NetworkAddressConfig] }>()

const ipv4Options = computed(() => [
  ...(props.allowIPv4Disabled
    ? [{ label: t('network.interfaces.ipv4Disabled', 'Disabled'), value: 'disabled' }]
    : []),
  { label: t('network.interfaces.automatic', 'Automatic (DHCP)'), value: 'dhcp' },
  { label: t('network.interfaces.staticIP', 'Static IP'), value: 'static' },
])

const ipv6Options = computed(() => [
  { label: t('network.interfaces.ipv6Disabled', 'Disabled'), value: 'disabled' },
  { label: t('network.interfaces.ipv6SLAAC', 'SLAAC'), value: 'slaac' },
  { label: t('network.interfaces.ipv6DHCP', 'DHCPv6'), value: 'dhcp' },
  { label: t('network.interfaces.ipv6Static', 'Static'), value: 'static' },
])

function update<K extends keyof NetworkAddressConfig>(key: K, value: NetworkAddressConfig[K]) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}
</script>

<template>
  <div class="network-address-settings">
    <section class="network-config-section">
      <h3>{{ t('network.interfaces.ipv4Config', 'IPv4 Configuration') }}</h3>
      <div class="network-fields">
        <n-form-item :label="t('network.interfaces.mode', 'Mode')">
          <n-select
            :value="modelValue.ipv4_mode"
            :disabled="disabled"
            :options="ipv4Options"
            @update:value="update('ipv4_mode', $event as IPv4Mode)"
          />
        </n-form-item>
        <template v-if="modelValue.ipv4_mode === 'static'">
          <n-form-item :label="t('network.interfaces.ipv4Address', 'IPv4 Address')">
            <n-input
              :value="modelValue.ipv4_address"
              :disabled="disabled"
              placeholder="192.168.1.20/24"
              :status="modelValue.ipv4_address && !validCIDR(modelValue.ipv4_address, 4) ? 'error' : undefined"
              @update:value="update('ipv4_address', $event)"
            />
          </n-form-item>
          <n-form-item :label="t('network.interfaces.gateway', 'Gateway')">
            <n-input
              :value="modelValue.ipv4_gateway"
              :disabled="disabled"
              placeholder="192.168.1.1"
              :status="modelValue.ipv4_gateway && !isIPv4(modelValue.ipv4_gateway) ? 'error' : undefined"
              @update:value="update('ipv4_gateway', $event)"
            />
          </n-form-item>
        </template>
      </div>
    </section>

    <section class="network-config-section">
      <h3>{{ t('network.interfaces.ipv6Config', 'IPv6 Configuration') }}</h3>
      <div class="network-fields">
        <n-form-item :label="t('network.interfaces.ipv6Mode', 'IPv6 Mode')">
          <n-select
            :value="modelValue.ipv6_mode"
            :disabled="disabled"
            :options="ipv6Options"
            @update:value="update('ipv6_mode', $event as IPv6Mode)"
          />
        </n-form-item>
        <template v-if="modelValue.ipv6_mode === 'static'">
          <n-form-item :label="t('network.interfaces.ipv6Address', 'IPv6 Address')">
            <n-input
              :value="modelValue.ipv6_address"
              :disabled="disabled"
              placeholder="2001:db8::20/64"
              :status="modelValue.ipv6_address && !validCIDR(modelValue.ipv6_address, 6) ? 'error' : undefined"
              @update:value="update('ipv6_address', $event)"
            />
          </n-form-item>
          <n-form-item :label="t('network.interfaces.ipv6Gateway', 'IPv6 Gateway')">
            <n-input
              :value="modelValue.ipv6_gateway"
              :disabled="disabled"
              placeholder="2001:db8::1"
              :status="modelValue.ipv6_gateway && !isIPv6(modelValue.ipv6_gateway) ? 'error' : undefined"
              @update:value="update('ipv6_gateway', $event)"
            />
          </n-form-item>
        </template>
      </div>
    </section>

    <n-form-item class="network-route-metric" :label="t('network.interfaces.routeMetric', 'Route metric')">
      <n-input-number
        :value="modelValue.route_metric"
        :disabled="disabled"
        :min="0"
        :precision="0"
        @update:value="update('route_metric', $event ?? 0)"
      />
    </n-form-item>
  </div>
</template>

<style scoped>
.network-address-settings { display: grid; gap: 4px; }
.network-config-section {
  padding-top: 12px;
  border-top: 1px solid #30363d;
}
.network-config-section h3 {
  margin: 0 0 12px;
  color: #c9d1d9;
  font-size: 13px;
  font-weight: 600;
}
.network-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 12px;
}
.network-fields > :first-child { grid-column: 1 / -1; }
.network-route-metric { width: calc(50% - 6px); }
.network-route-metric :deep(.n-input-number) { width: 100%; }
@media (max-width: 520px) {
  .network-fields { grid-template-columns: 1fr; }
  .network-fields > * { grid-column: 1 !important; }
  .network-route-metric { width: 100%; }
}
</style>
