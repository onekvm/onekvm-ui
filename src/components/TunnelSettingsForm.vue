<script setup lang="ts">
import { computed } from 'vue'
import { Trash2 } from '@lucide/vue'

import type { ManagedNetworkInterface } from '@/api/client'
import { t } from '@/i18n/runtime'
import { networkKindLabel } from '@/lib/network'

import NetworkAddressSettingsForm from './NetworkAddressSettingsForm.vue'

const props = defineProps<{ modelValue: ManagedNetworkInterface; disabled?: boolean }>()
const emit = defineEmits<{
  'update:modelValue': [value: ManagedNetworkInterface]
  remove: []
}>()

const isEndpointTunnel = computed(() => ['gre', 'ipip', 'sit', 'gretap'].includes(props.modelValue.kind))
const isOverlay = computed(() => ['vxlan', 'geneve'].includes(props.modelValue.kind))
const isFOU = computed(() => props.modelValue.kind === 'fou')
const isBareUDP = computed(() => props.modelValue.kind === 'bareudp')
const kindLabel = computed(() => networkKindLabel(props.modelValue.kind))
const portRequired = computed(() => isFOU.value || isBareUDP.value)
const portLabel = computed(() =>
  portRequired.value
    ? t('network.tunnels.portRequired', 'UDP port')
    : t('network.tunnels.port', 'UDP port (optional)'),
)
const portPlaceholder = computed(() => {
  if (isFOU.value) return '5555'
  if (isBareUDP.value) return '6635'
  return props.modelValue.kind === 'vxlan' ? '4789' : '6081'
})
const fouProtocolOptions = [
  { label: 'IPIP', value: 'ipip' },
  { label: 'GRE', value: 'gre' },
  { label: 'SIT', value: 'sit' },
]
const bareEtherTypeOptions = [
  { label: 'IPv4', value: 'ipv4' },
  { label: 'IPv6', value: 'ipv6' },
  { label: 'MPLS-UC', value: 'mpls-uc' },
  { label: 'MPLS-MC', value: 'mpls-mc' },
]

function update<K extends keyof ManagedNetworkInterface>(key: K, value: ManagedNetworkInterface[K]) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}
</script>

<template>
  <div class="tunnel-form">
    <div class="tunnel-identity-fields">
      <n-form-item :label="t('network.interfaces.interfaceName', 'Interface name')">
        <n-input
          :value="modelValue.name"
          :disabled="disabled"
          :placeholder="`${modelValue.kind}0`"
          :status="modelValue.name && !/^[A-Za-z0-9_.:@-]+$/.test(modelValue.name) ? 'error' : undefined"
          @update:value="update('name', $event)"
        />
      </n-form-item>
      <n-form-item :label="t('network.tunnels.kind', 'Tunnel type')">
        <n-input :value="kindLabel" readonly />
      </n-form-item>
    </div>

    <div v-if="isEndpointTunnel" class="tunnel-endpoint-fields">
      <n-form-item :label="t('network.tunnels.local', 'Local address')">
        <n-input
          :value="modelValue.local || ''"
          :disabled="disabled"
          placeholder="203.0.113.10"
          @update:value="update('local', $event)"
        />
      </n-form-item>
      <n-form-item :label="t('network.tunnels.remote', 'Remote address')">
        <n-input
          :value="modelValue.remote || ''"
          :disabled="disabled"
          placeholder="198.51.100.20"
          @update:value="update('remote', $event)"
        />
      </n-form-item>
      <n-form-item
        v-if="modelValue.kind === 'gre' || modelValue.kind === 'gretap'"
        :label="t('network.tunnels.key', 'Key (optional)')"
      >
        <n-input
          :value="modelValue.key || ''"
          :disabled="disabled"
          placeholder="0"
          @update:value="update('key', $event)"
        />
      </n-form-item>
    </div>

    <div v-if="isOverlay" class="tunnel-overlay-fields">
      <n-form-item :label="t('network.tunnels.vni', 'VNI')">
        <n-input-number
          :value="modelValue.vni || 1"
          :disabled="disabled"
          :min="1"
          :max="16777215"
          :precision="0"
          @update:value="update('vni', $event || 1)"
        />
      </n-form-item>
      <n-form-item :label="t('network.tunnels.remote', 'Remote address')">
        <n-input
          :value="modelValue.remote || ''"
          :disabled="disabled"
          placeholder="198.51.100.20"
          @update:value="update('remote', $event)"
        />
      </n-form-item>
      <n-form-item
        v-if="modelValue.kind === 'vxlan'"
        :label="t('network.tunnels.group', 'Multicast group (optional)')"
      >
        <n-input
          :value="modelValue.group || ''"
          :disabled="disabled || Boolean(modelValue.remote)"
          placeholder="239.1.1.1"
          @update:value="update('group', $event)"
        />
      </n-form-item>
      <n-form-item :label="portLabel">
        <n-input-number
          :value="modelValue.port || null"
          :disabled="disabled"
          :min="1"
          :max="65535"
          :precision="0"
          :placeholder="portPlaceholder"
          clearable
          @update:value="update('port', $event || 0)"
        />
      </n-form-item>
    </div>

    <div v-if="isFOU" class="tunnel-fou-fields">
      <n-form-item :label="portLabel">
        <n-input-number
          :value="modelValue.port || null"
          :disabled="disabled"
          :min="1"
          :max="65535"
          :precision="0"
          :placeholder="portPlaceholder"
          @update:value="update('port', $event || 0)"
        />
      </n-form-item>
      <n-form-item :label="t('network.tunnels.protocol', 'Inner protocol')">
        <n-select
          :value="modelValue.protocol || 'ipip'"
          :disabled="disabled"
          :options="fouProtocolOptions"
          @update:value="update('protocol', $event)"
        />
      </n-form-item>
      <n-form-item :label="t('network.tunnels.localOptional', 'Local address (optional)')">
        <n-input
          :value="modelValue.local || ''"
          :disabled="disabled"
          placeholder="203.0.113.10"
          @update:value="update('local', $event)"
        />
      </n-form-item>
      <n-form-item :label="t('network.tunnels.peerOptional', 'Peer address (optional)')">
        <n-input
          :value="modelValue.remote || ''"
          :disabled="disabled"
          placeholder="198.51.100.20"
          @update:value="update('remote', $event)"
        />
      </n-form-item>
    </div>

    <div v-if="isBareUDP" class="tunnel-bareudp-fields">
      <n-form-item :label="portLabel">
        <n-input-number
          :value="modelValue.port || null"
          :disabled="disabled"
          :min="1"
          :max="65535"
          :precision="0"
          :placeholder="portPlaceholder"
          @update:value="update('port', $event || 0)"
        />
      </n-form-item>
      <n-form-item :label="t('network.tunnels.etherType', 'Ether type')">
        <n-select
          :value="modelValue.ether_type || 'ipv4'"
          :disabled="disabled"
          :options="bareEtherTypeOptions"
          @update:value="update('ether_type', $event)"
        />
      </n-form-item>
    </div>

    <NetworkAddressSettingsForm
      :model-value="modelValue"
      :disabled="disabled"
      @update:model-value="emit('update:modelValue', { ...modelValue, ...$event })"
    />
    <footer>
      <n-popconfirm
        :positive-text="t('network.interfaces.removeInterface', 'Remove interface')"
        :negative-text="t('common.cancel', 'Cancel')"
        @positive-click="emit('remove')"
      >
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
.tunnel-form { display: grid; gap: 18px; }
.tunnel-identity-fields,
.tunnel-endpoint-fields,
.tunnel-overlay-fields,
.tunnel-fou-fields,
.tunnel-bareudp-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 12px; }
.tunnel-form > footer { display: flex; justify-content: flex-end; }
@media (max-width: 760px) {
  .tunnel-identity-fields,
  .tunnel-endpoint-fields,
  .tunnel-overlay-fields,
  .tunnel-fou-fields,
  .tunnel-bareudp-fields { grid-template-columns: 1fr; }
  .tunnel-form > footer { justify-content: stretch; }
  .tunnel-form > footer .n-button { width: 100%; }
}
</style>
