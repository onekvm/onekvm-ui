<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { api, type NetworkConfig, type NetworkInterfaceStatus } from '@/api/client'
import { t } from '@/i18n/runtime'
import { validMACAddress } from '@/lib/network'

import IosChoice from './IosChoice.vue'
import NetworkAddressSettingsForm from './NetworkAddressSettingsForm.vue'

const props = withDefaults(defineProps<{
  modelValue: NetworkConfig
  disabled?: boolean
  showDevice?: boolean
  showMAC?: boolean
  allowIPv4Disabled?: boolean
  inset?: boolean
}>(), {
  disabled: false,
  showDevice: true,
  showMAC: true,
  allowIPv4Disabled: true,
  inset: false,
})
const emit = defineEmits<{ 'update:modelValue': [value: NetworkConfig] }>()

function update<K extends keyof NetworkConfig>(key: K, value: NetworkConfig[K]) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}

const interfaces = ref<NetworkInterfaceStatus[]>([])
onMounted(async () => {
  if (!props.inset) return
  try {
    interfaces.value = await api.getNetworkInterfaces()
  } catch {
    interfaces.value = []
  }
})

const interfaceOptions = computed(() => {
  const names = interfaces.value
    .filter((item) => item.port_type === 'physical' && !/^(wlan|wl|ap|lo)/.test(item.name))
    .map((item) => item.name)
  const current = props.modelValue.device
  if (current && !names.includes(current)) names.unshift(current)
  if (!names.length) names.push(current || 'eth0')
  return names.map((name) => ({ label: name, value: name }))
})

</script>

<template>
  <div class="network-settings-form" :class="{ 'is-inset': inset }">
    <IosChoice
      v-if="showDevice && inset"
      :label="t('network.interfaces.selectInterface', 'Interface')"
      :value="modelValue.device || 'eth0'"
      :options="interfaceOptions"
      :disabled="disabled"
      @select="update('device', $event)"
    />
    <n-form-item v-else-if="showDevice" :label="t('network.interfaces.selectInterface', 'Interface')">
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
      :hide-disabled-ipv4="!allowIPv4Disabled"
      :hide-route-metric="props.inset"
      :inset="props.inset"
      @update:model-value="emit('update:modelValue', {
        ...modelValue,
        ...$event,
        ipv6_enabled: $event.ipv6_mode !== 'disabled',
      })"
    />

  </div>
</template>

<style scoped>
.network-settings-form { display: grid; gap: 8px; }
.network-settings-form.is-inset { gap: 0; }
</style>
