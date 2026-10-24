<script setup lang="ts">
import type { WifiIpConfig } from '@/api/client'
import NetworkAddressSettingsForm from './NetworkAddressSettingsForm.vue'

defineProps<{
  modelValue: WifiIpConfig
  disabled?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: WifiIpConfig] }>()
</script>

<template>
  <div class="wifi-ip-settings">
    <NetworkAddressSettingsForm
      :model-value="modelValue"
      :disabled="disabled"
      @update:model-value="emit('update:modelValue', $event)"
    />
  </div>
</template>

<style scoped>
.wifi-ip-settings { display: grid; gap: 12px; width: 100%; }
</style>
