<script setup lang="ts">
import { Trash2 } from '@lucide/vue'

import type { ManagedNetworkInterface } from '@/api/client'
import { t } from '@/i18n/runtime'

import NetworkAddressSettingsForm from './NetworkAddressSettingsForm.vue'

const props = defineProps<{ modelValue: ManagedNetworkInterface; disabled?: boolean }>()
const emit = defineEmits<{
  'update:modelValue': [value: ManagedNetworkInterface]
  remove: []
}>()

function update<K extends keyof ManagedNetworkInterface>(key: K, value: ManagedNetworkInterface[K]) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}

</script>

<template>
  <div class="vlan-form">
    <div class="vlan-identity-fields">
	  <n-form-item :label="t('network.interfaces.interfaceName', 'Interface name')">
        <n-input
          :value="modelValue.name"
          :disabled="disabled"
          placeholder="vlan20"
          :status="modelValue.name && !/^[A-Za-z0-9_.:@-]+$/.test(modelValue.name) ? 'error' : undefined"
          @update:value="update('name', $event)"
        />
      </n-form-item>
	  <n-form-item :label="t('network.interfaces.vlanID', 'VLAN ID')">
        <n-input-number
          :value="modelValue.vlan_id"
          :disabled="disabled"
          :min="1"
          :max="4094"
          :precision="0"
          @update:value="update('vlan_id', $event || 1)"
        />
      </n-form-item>
	  <n-form-item :label="t('network.interfaces.parentInterface', 'Parent interface')">
        <n-input :value="modelValue.parent" readonly />
      </n-form-item>
    </div>
    <NetworkAddressSettingsForm
      :model-value="modelValue"
      :disabled="disabled"
      @update:model-value="emit('update:modelValue', { ...modelValue, ...$event })"
    />
    <footer>
	  <n-popconfirm :positive-text="t('network.interfaces.removeInterface', 'Remove interface')" :negative-text="t('common.cancel', 'Cancel')" @positive-click="emit('remove')">
        <template #trigger>
          <n-button type="error" secondary :disabled="disabled">
            <template #icon><Trash2 /></template>
			{{ t('network.interfaces.removeInterface', 'Remove interface') }}
          </n-button>
        </template>
		{{ t('network.interfaces.removeInterfaceConfirm', 'Remove {name}?').replace('{name}', modelValue.name) }}
      </n-popconfirm>
    </footer>
  </div>
</template>

<style scoped>
.vlan-form { display: grid; gap: 18px; }
.vlan-identity-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 12px; }
.vlan-form > footer { display: flex; justify-content: flex-end; }
@media (max-width: 560px) {
  .vlan-identity-fields { grid-template-columns: 1fr; }
}
</style>
