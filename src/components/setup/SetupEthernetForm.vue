<script setup lang="ts">
import type { NetworkConfig } from '@/api/client'
import { ChevronDown, Settings2 } from '@/icons'
import { t } from '@/i18n/runtime'
import NetworkSettingsForm from '../NetworkSettingsForm.vue'

defineProps<{ disabled: boolean }>()
const network = defineModel<NetworkConfig>({ required: true })
const advancedOpen = defineModel<boolean>('advancedOpen', { required: true })
const vlanEnabled = defineModel<boolean>('vlanEnabled', { required: true })
const vlanID = defineModel<number>('vlanId', { required: true })
</script>

<template>
  <div class="setup-ethernet-form">
    <NetworkSettingsForm v-model="network" hide-route-metric :disabled="disabled" :showMAC="false" :allowIPv4Disabled="false" />
    <n-button
      text
      class="setup-advanced-toggle"
      :disabled="disabled"
      :aria-expanded="advancedOpen"
      @click="advancedOpen = !advancedOpen"
    >
      <template #icon><Settings2 /></template>
      {{ t('auth.advancedSettings', 'Advanced settings') }}
      <ChevronDown class="setup-advanced-icon" :class="{ expanded: advancedOpen }" />
    </n-button>
    <n-collapse-transition :show="advancedOpen">
      <section class="setup-network-advanced">
        <n-form-item :label="t('network.interfaces.routeMetric', 'Route metric')">
          <n-input-number :value="network.route_metric" :disabled="disabled" :min="0" :precision="0" @update:value="network.route_metric = $event ?? 0" />
        </n-form-item>
        <n-form-item :label="t('auth.useVLAN', 'Use a management VLAN')">
          <n-switch v-model:value="vlanEnabled" :disabled="disabled" />
        </n-form-item>
        <n-form-item v-if="vlanEnabled" :label="t('auth.vlanID', 'VLAN ID')">
          <n-input-number v-model:value="vlanID" :disabled="disabled" :min="1" :max="4094" :precision="0" />
          <template #feedback>{{ t('auth.vlanHint', 'The management address above will be moved to this tagged VLAN.') }}</template>
        </n-form-item>
      </section>
    </n-collapse-transition>
  </div>
</template>

<style scoped>
.setup-ethernet-form :deep(.n-form-item) { margin-bottom: 16px; }
</style>
