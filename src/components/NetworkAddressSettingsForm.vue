<script setup lang="ts">
import { computed } from 'vue'

import type { IPv4Mode, IPv6Mode } from '@/api/client'
import { t } from '@/i18n/runtime'
import { DEFAULT_FALLBACK_IPV4, ipv4ModeUsesStaticAddress, isIPv4, isIPv6, validCIDR } from '@/lib/network'

import IosChoice from './IosChoice.vue'

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
  hideDisabledIpv4?: boolean
  hideRouteMetric?: boolean
  inset?: boolean
}>(), {
  disabled: false,
  hideDisabledIpv4: false,
  hideRouteMetric: false,
  inset: false,
})

const emit = defineEmits<{ 'update:modelValue': [value: NetworkAddressConfig] }>()

const ipv4Options = computed(() => [
  ...(props.hideDisabledIpv4
    ? []
    : [{ label: t('network.interfaces.ipv4Disabled', 'Disabled'), value: 'disabled' }]),
  { label: t('network.interfaces.automatic', 'Automatic (DHCP)'), value: 'dhcp' },
  { label: t('network.interfaces.dhcpStatic', 'DHCP + fallback IP'), value: 'dhcp-static' },
  { label: t('network.interfaces.staticIP', 'Static IP'), value: 'static' },
])

const ipv6Options = computed(() => [
  { label: t('network.interfaces.ipv6Disabled', 'Disabled'), value: 'disabled' },
  { label: t('network.interfaces.ipv6SLAAC', 'SLAAC'), value: 'slaac' },
  { label: t('network.interfaces.ipv6DHCP', 'DHCPv6'), value: 'dhcp' },
  { label: t('network.interfaces.ipv6Static', 'Static'), value: 'static' },
])

function update<K extends keyof NetworkAddressConfig>(key: K, value: NetworkAddressConfig[K]) {
  const next = { ...props.modelValue, [key]: value }
  if (key === 'ipv4_mode' && value === 'dhcp-static' && !next.ipv4_address) {
    next.ipv4_address = DEFAULT_FALLBACK_IPV4
  }
  emit('update:modelValue', next)
}
</script>

<template>
  <div class="network-address-settings" :class="{ 'is-inset': inset }">
    <section class="network-config-section">
      <h3>{{ t('network.interfaces.ipv4Config', 'IPv4 Configuration') }}</h3>
      <div class="network-fields">
        <IosChoice
          v-if="inset"
          :label="t('network.interfaces.ipv4Mode', 'IPv4 mode')"
          :value="modelValue.ipv4_mode"
          :options="ipv4Options"
          :disabled="disabled"
          @select="update('ipv4_mode', $event as IPv4Mode)"
        />
        <n-form-item v-else :label="t('network.interfaces.ipv4Mode', 'IPv4 mode')">
          <n-select
            :value="modelValue.ipv4_mode"
            :disabled="disabled"
            :options="ipv4Options"
            @update:value="update('ipv4_mode', $event as IPv4Mode)"
          />
        </n-form-item>
        <template v-if="ipv4ModeUsesStaticAddress(modelValue.ipv4_mode)">
          <n-form-item :label="modelValue.ipv4_mode === 'dhcp-static'
            ? t('network.interfaces.fallbackIP', 'Fallback IPv4 address')
            : t('network.interfaces.ipv4Address', 'IPv4 Address')">
            <n-input
              :value="modelValue.ipv4_address"
              :disabled="disabled"
              :placeholder="modelValue.ipv4_mode === 'dhcp-static' ? DEFAULT_FALLBACK_IPV4 : '192.168.1.20/24'"
              :status="modelValue.ipv4_address && !validCIDR(modelValue.ipv4_address, 4) ? 'error' : undefined"
              @update:value="update('ipv4_address', $event)"
            />
            <template v-if="modelValue.ipv4_mode === 'dhcp-static'" #feedback>
              {{ t('network.interfaces.fallbackIPHint', 'Always assigned so the device stays reachable if DHCP is unavailable.') }}
            </template>
          </n-form-item>
          <n-form-item :label="t('network.interfaces.gateway', 'Gateway')">
            <n-input
              :value="modelValue.ipv4_gateway"
              :disabled="disabled"
              placeholder="192.168.1.1"
              :status="modelValue.ipv4_gateway && !isIPv4(modelValue.ipv4_gateway) ? 'error' : undefined"
              @update:value="update('ipv4_gateway', $event)"
            />
            <template v-if="modelValue.ipv4_mode === 'dhcp-static'" #feedback>
              {{ t('network.interfaces.gatewayOptionalHint', 'Leave empty to use the DHCP gateway.') }}
            </template>
          </n-form-item>
        </template>
      </div>
    </section>

    <section class="network-config-section">
      <h3>{{ t('network.interfaces.ipv6Config', 'IPv6 Configuration') }}</h3>
      <div class="network-fields">
        <IosChoice
          v-if="inset"
          :label="t('network.interfaces.ipv6Mode', 'IPv6 Mode')"
          :value="modelValue.ipv6_mode"
          :options="ipv6Options"
          :disabled="disabled"
          @select="update('ipv6_mode', $event as IPv6Mode)"
        />
        <n-form-item v-else :label="t('network.interfaces.ipv6Mode', 'IPv6 Mode')">
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

    <n-form-item v-if="!hideRouteMetric" class="network-route-metric" :label="t('network.interfaces.routeMetric', 'Route metric')">
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
.network-address-settings { display: grid; gap: 8px; }
.network-address-settings.is-inset { gap: 0; }
.network-address-settings.is-inset .network-config-section,
.network-address-settings.is-inset > .network-route-metric {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--border-strong);
}
.network-address-settings.is-inset .network-config-section {
  display: grid;
  gap: 14px;
}
.network-address-settings.is-inset .network-fields { display: grid; gap: 14px; }
.network-address-settings.is-inset .network-route-metric { width: 100%; }
.network-address-settings.is-inset h3 { margin: 0 4px; font-size: 13px; font-weight: 400; color: var(--muted-foreground); }
.network-config-section {
  padding-top: 12px;
  border-top: 1px solid var(--border);
}
.network-config-section h3 {
  margin: 0 0 12px;
  color: var(--onekvm-text-secondary);
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
@media (max-width: 760px) {
  .network-fields { grid-template-columns: 1fr; }
  .network-fields > * { grid-column: 1 !important; }
  .network-route-metric { width: 100%; }
}
</style>
