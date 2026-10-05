<script setup lang="ts">
import { computed } from 'vue'
import { Trash2 } from '@lucide/vue'

import type { VpnClientConfig } from '@/api/client'
import { t } from '@/i18n/runtime'
import { networkKindLabel } from '@/lib/network'

const props = defineProps<{ modelValue: VpnClientConfig; disabled?: boolean; parentDevice?: string }>()
const emit = defineEmits<{
  'update:modelValue': [value: VpnClientConfig]
  remove: []
}>()

const kindLabel = computed(() => networkKindLabel(props.modelValue.kind))
const isOpenVPN = computed(() => props.modelValue.kind === 'openvpn')
const isPPPoE = computed(() => props.modelValue.kind === 'pppoe')
const needsRemote = computed(() => ['openvpn', 'pptp', 'l2tp'].includes(props.modelValue.kind))
const needsAuth = computed(() => ['pppoe', 'pptp', 'l2tp', 'openvpn'].includes(props.modelValue.kind))
const protocolOptions = [
  { label: 'UDP', value: 'udp' },
  { label: 'TCP', value: 'tcp' },
]

function update<K extends keyof VpnClientConfig>(key: K, value: VpnClientConfig[K]) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}
</script>

<template>
  <div class="vpn-form">
    <div class="vpn-identity-fields">
      <n-form-item :label="t('network.interfaces.interfaceName', 'Interface name')">
        <n-input
          :value="modelValue.name"
          :disabled="disabled"
          :placeholder="`${modelValue.kind}0`"
          :status="modelValue.name && !/^[A-Za-z0-9_.:@-]+$/.test(modelValue.name) ? 'error' : undefined"
          @update:value="update('name', $event)"
        />
      </n-form-item>
      <n-form-item :label="t('network.vpn.kind', 'VPN type')">
        <n-input :value="kindLabel" readonly />
      </n-form-item>
    </div>

    <n-form-item :label="t('network.vpn.enabled', 'Enabled')">
      <n-switch :value="modelValue.enabled" :disabled="disabled" @update:value="update('enabled', $event)" />
    </n-form-item>

    <div v-if="isOpenVPN" class="vpn-openvpn-fields">
      <n-form-item :label="t('network.vpn.config', 'OpenVPN configuration')">
        <n-input
          type="textarea"
          :rows="8"
          :value="modelValue.config || ''"
          :disabled="disabled"
          :placeholder="t('network.vpn.configHint', 'Paste a full .ovpn client config, or leave empty and fill remote below.')"
          @update:value="update('config', $event)"
        />
      </n-form-item>
    </div>

    <div v-if="needsRemote && !modelValue.config" class="vpn-endpoint-fields">
      <n-form-item :label="t('network.vpn.remote', 'Server')">
        <n-input
          :value="modelValue.remote || ''"
          :disabled="disabled"
          placeholder="vpn.example.com"
          @update:value="update('remote', $event)"
        />
      </n-form-item>
      <n-form-item v-if="isOpenVPN" :label="t('network.vpn.port', 'Port')">
        <n-input-number
          :value="modelValue.port || 1194"
          :disabled="disabled"
          :min="1"
          :max="65535"
          :precision="0"
          @update:value="update('port', $event || 1194)"
        />
      </n-form-item>
      <n-form-item v-if="isOpenVPN" :label="t('network.vpn.protocol', 'Protocol')">
        <n-select
          :value="modelValue.protocol || 'udp'"
          :disabled="disabled"
          :options="protocolOptions"
          @update:value="update('protocol', $event)"
        />
      </n-form-item>
    </div>

    <div v-if="isPPPoE" class="vpn-pppoe-fields">
      <n-form-item :label="t('network.vpn.parent', 'Parent interface')">
        <n-input
          :value="modelValue.parent || parentDevice || ''"
          :disabled="disabled"
          :placeholder="parentDevice || 'eth0'"
          @update:value="update('parent', $event)"
        />
      </n-form-item>
      <n-form-item :label="t('network.vpn.service', 'Service name (optional)')">
        <n-input
          :value="modelValue.service || ''"
          :disabled="disabled"
          @update:value="update('service', $event)"
        />
      </n-form-item>
    </div>

    <div v-if="needsAuth" class="vpn-auth-fields">
      <n-form-item :label="t('network.vpn.username', 'Username')">
        <n-input
          :value="modelValue.username || ''"
          :disabled="disabled"
          @update:value="update('username', $event)"
        />
      </n-form-item>
      <n-form-item :label="t('network.vpn.password', 'Password')">
        <n-input
          type="password"
          show-password-on="click"
          :value="modelValue.password || ''"
          :disabled="disabled"
          @update:value="update('password', $event)"
        />
      </n-form-item>
    </div>

    <n-form-item :label="t('network.vpn.defaultRoute', 'Use as default route')">
      <n-switch
        :value="Boolean(modelValue.default_route)"
        :disabled="disabled"
        @update:value="update('default_route', $event)"
      />
    </n-form-item>

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
.vpn-form { display: grid; gap: 18px; }
.vpn-identity-fields,
.vpn-endpoint-fields,
.vpn-pppoe-fields,
.vpn-auth-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 12px; }
.vpn-form > footer { display: flex; justify-content: flex-end; }
@media (max-width: 760px) {
  .vpn-identity-fields,
  .vpn-endpoint-fields,
  .vpn-pppoe-fields,
  .vpn-auth-fields { grid-template-columns: 1fr; }
  .vpn-form > footer { justify-content: stretch; }
  .vpn-form > footer .n-button { width: 100%; }
}
</style>
