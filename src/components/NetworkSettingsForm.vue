<script setup lang="ts">
import type { NetworkConfig } from '@/api/client'
import { t } from '@/i18n/runtime'
import { validMACAddress } from '@/lib/network'

import NetworkAddressSettingsForm from './NetworkAddressSettingsForm.vue'

const props = withDefaults(defineProps<{
  modelValue: NetworkConfig
  disabled?: boolean
  showDevice?: boolean
  showMAC?: boolean
  allowIPv4Disabled?: boolean
}>(), {
  disabled: false,
  showDevice: true,
  showMAC: true,
  allowIPv4Disabled: true,
})
const emit = defineEmits<{ 'update:modelValue': [value: NetworkConfig] }>()

function update<K extends keyof NetworkConfig>(key: K, value: NetworkConfig[K]) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}

</script>

<template>
  <div class="network-settings-form">
    <n-form-item v-if="showDevice" :label="t('network.interfaces.selectInterface', 'Interface')">
      <n-input
        :value="modelValue.device"
        :disabled="disabled"
        placeholder="eth0"
        :status="modelValue.device && !/^[A-Za-z0-9_.:@-]+$/.test(modelValue.device) ? 'error' : undefined"
        @update:value="update('device', $event)"
      />
    </n-form-item>

    <n-form-item v-if="showMAC" :label="t('network.interfaces.macAddress', 'MAC address')">
      <n-input
        :value="modelValue.mac_address || ''"
        :disabled="disabled"
        placeholder="02:00:00:00:00:01"
        clearable
        :status="!validMACAddress(modelValue.mac_address) ? 'error' : undefined"
        @update:value="update('mac_address', $event.trim())"
      />
      <template #feedback>
        {{ t('network.interfaces.macAddressHint', 'Leave empty to use the hardware MAC address.') }}
      </template>
    </n-form-item>

    <NetworkAddressSettingsForm
      :model-value="modelValue"
      :disabled="disabled"
      :allow-ipv4-disabled="allowIPv4Disabled"
      @update:model-value="emit('update:modelValue', {
        ...modelValue,
        ...$event,
        ipv6_enabled: $event.ipv6_mode !== 'disabled',
      })"
    />

  </div>
</template>

<style scoped>
.network-settings-form { display: grid; gap: 4px; }
</style>
