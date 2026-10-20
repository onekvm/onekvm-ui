<script setup lang="ts">
import { ref } from 'vue'
import { Trash2 } from '@/icons'

import type { VpnClientConfig } from '@/api/client'
import { t } from '@/i18n/runtime'
import { networkKindLabel } from '@/lib/network'
import { parseVpnConfig, serializeVpnConfig, VpnConfigError } from '@/lib/vpn-config'

const props = defineProps<{ modelValue: VpnClientConfig; disabled?: boolean; parentDevice?: string }>()
const emit = defineEmits<{
  'update:modelValue': [value: VpnClientConfig]
  validity: [valid: boolean]
  remove: []
}>()

const editorMode = ref<'form' | 'file'>(props.modelValue.config?.trim() ? 'file' : 'form')
const configurationFile = ref(props.modelValue.kind === 'openvpn' ? (props.modelValue.config || '') : '')
const configurationError = ref('')
const configurationErrorWarning = ref(false)
const protocolOptions = [
  { label: 'UDP', value: 'udp' },
  { label: 'TCP', value: 'tcp' },
]
const configurationPlaceholder = props.modelValue.kind === 'openvpn'
  ? `client
dev tun
proto udp
remote vpn.example.com 1194`
  : props.modelValue.kind === 'pptp'
    ? `pty "pptp vpn.example.com --nolaunchpppd"
user "username"`
    : props.modelValue.kind === 'l2tp'
      ? `lns = vpn.example.com
user "username"`
      : `plugin rp-pppoe.so
eth0
user "username"`

function fill(template: string, params: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (token, key: string) => (
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : token
  ))
}

function configurationErrorText(reason: unknown) {
  if (!(reason instanceof VpnConfigError)) {
    return reason instanceof Error ? reason.message : String(reason)
  }
  const messageText = fill(t(`network.vpn.errors.${reason.code}`, reason.message), reason.params)
  if (reason.params.line == null) return messageText
  return fill(t('network.vpn.errors.line', 'Line {line}: {message}'), {
    line: reason.params.line,
    message: messageText,
  })
}

function normalized(client: VpnClientConfig): VpnClientConfig {
  return {
    ...client,
    remote: client.remote || '',
    port: client.kind === 'openvpn' ? (client.port || 1194) : (client.port || 0),
    protocol: client.kind === 'openvpn' ? ((client.protocol || 'udp').toLowerCase() === 'tcp' ? 'tcp' : 'udp') : (client.protocol || ''),
    parent: client.parent || '',
    username: client.username || '',
    password: client.password || '',
    service: client.service || '',
    config: client.config || '',
    default_route: Boolean(client.default_route),
  }
}

function update<K extends keyof VpnClientConfig>(key: K, value: VpnClientConfig[K]) {
  emit('update:modelValue', { ...normalized(props.modelValue), [key]: value, config: '' })
  emit('validity', true)
}

function showConfiguration(value: string, warning: boolean, message: string, valid: boolean) {
  configurationFile.value = value
  configurationErrorWarning.value = warning
  configurationError.value = message
  emit('validity', valid)
}

function applyConfigurationFile(value: string, switching: boolean) {
  configurationFile.value = value
  try {
    const parsed = parseVpnConfig(value, normalized(props.modelValue))
    if (parsed.kind === 'opaque') {
      showConfiguration(
        value,
        switching,
        switching ? t('network.vpn.opaqueForm', 'This file contains options the form cannot edit. Keep using the configuration file.') : '',
        true,
      )
      emit('update:modelValue', { ...props.modelValue, config: value })
      return false
    }
    showConfiguration(value, false, '', true)
    emit('update:modelValue', parsed.client)
    return true
  } catch (reason) {
    showConfiguration(value, false, configurationErrorText(reason), false)
    return false
  }
}

function selectEditorMode(value: 'form' | 'file') {
  if (value === 'file') {
    const current = normalized(props.modelValue)
    const saved = current.config || ''
    showConfiguration(saved.trim() ? saved : serializeVpnConfig(current), false, '', true)
    editorMode.value = 'file'
    return
  }
  if (applyConfigurationFile(configurationFile.value, true)) editorMode.value = 'form'
}
</script>

<template>
  <div class="vpn-form">
    <div class="vpn-editor-header">
      <n-form-item :label="t('network.interfaces.interfaceName', 'Interface name')">
        <n-input
          :value="modelValue.name"
          :disabled="disabled"
          :placeholder="`${modelValue.kind}0`"
          :status="modelValue.name && !/^[A-Za-z0-9_.:@-]+$/.test(modelValue.name) ? 'error' : undefined"
          @update:value="update('name', $event)"
        />
      </n-form-item>
      <n-form-item :label="t('network.vpn.editorMode', 'Editor mode')">
        <n-radio-group :value="editorMode" :disabled="disabled" @update:value="selectEditorMode($event as 'form' | 'file')">
          <n-radio-button value="form">{{ t('network.vpn.formEditor', 'Form') }}</n-radio-button>
          <n-radio-button value="file">{{ t('network.vpn.fileEditor', 'Configuration file') }}</n-radio-button>
        </n-radio-group>
      </n-form-item>
    </div>

    <div v-if="editorMode === 'form'" class="vpn-fields">
      <n-form-item class="span-all" :label="t('network.vpn.kind', 'VPN type')">
        <n-input :value="networkKindLabel(modelValue.kind)" readonly />
      </n-form-item>

      <n-form-item v-if="modelValue.kind !== 'pppoe'" class="span-all" :label="t('network.vpn.remote', 'Server')">
        <n-input
          :value="modelValue.remote || ''"
          :disabled="disabled"
          placeholder="vpn.example.com"
          @update:value="update('remote', $event)"
        />
      </n-form-item>
      <n-form-item v-if="modelValue.kind === 'openvpn'" :label="t('network.vpn.port', 'Port')">
        <n-input-number
          :value="modelValue.port || 1194"
          :disabled="disabled"
          :min="1"
          :max="65535"
          :precision="0"
          placeholder="1194"
          @update:value="update('port', $event || 1194)"
        />
      </n-form-item>
      <n-form-item v-if="modelValue.kind === 'openvpn'" :label="t('network.vpn.protocol', 'Protocol')">
        <n-select
          :value="modelValue.protocol || 'udp'"
          :disabled="disabled"
          :options="protocolOptions"
          @update:value="update('protocol', $event)"
        />
      </n-form-item>

      <template v-if="modelValue.kind === 'pppoe'">
        <n-form-item :label="t('network.vpn.parent', 'Parent interface')">
          <n-input
            :value="modelValue.parent || ''"
            :disabled="disabled"
            :placeholder="parentDevice || 'eth0'"
            @update:value="update('parent', $event)"
          />
        </n-form-item>
        <n-form-item :label="t('network.vpn.service', 'Service name (optional)')">
          <n-input
            :value="modelValue.service || ''"
            :disabled="disabled"
            placeholder=""
            @update:value="update('service', $event)"
          />
        </n-form-item>
      </template>

      <n-form-item :label="t('network.vpn.username', 'Username')">
        <n-input
          :value="modelValue.username || ''"
          :disabled="disabled"
          placeholder=""
          @update:value="update('username', $event)"
        />
      </n-form-item>
      <n-form-item :label="t('network.vpn.password', 'Password')">
        <n-input
          type="password"
          show-password-on="click"
          :value="modelValue.password || ''"
          :disabled="disabled"
          placeholder=""
          @update:value="update('password', $event)"
        />
      </n-form-item>
      <n-form-item :label="t('network.vpn.enabled', 'Enabled')">
        <n-switch :value="modelValue.enabled" :disabled="disabled" @update:value="update('enabled', $event)" />
      </n-form-item>
      <n-form-item :label="t('network.vpn.defaultRoute', 'Use as default route')">
        <n-switch :value="Boolean(modelValue.default_route)" :disabled="disabled" @update:value="update('default_route', $event)" />
      </n-form-item>
    </div>

    <section v-else class="configuration-file-editor">
      <n-input
        :value="configurationFile"
        type="textarea"
        class="vpn-config-input"
        :autosize="{ minRows: 8, maxRows: 24 }"
        :disabled="disabled"
        :status="configurationError && !configurationErrorWarning ? 'error' : undefined"
        :placeholder="configurationPlaceholder"
        :input-props="{ spellcheck: false, autocomplete: 'off', autocapitalize: 'off' }"
        @update:value="applyConfigurationFile($event, false)"
      />
      <n-alert v-if="configurationError" :type="configurationErrorWarning ? 'warning' : 'error'" :show-icon="false">
        <template v-if="configurationErrorWarning">{{ configurationError }}</template>
        <template v-else>{{ t('network.vpn.configurationError', 'Invalid VPN configuration') }}: {{ configurationError }}</template>
      </n-alert>
      <p>{{ t('network.vpn.configurationHint', 'The interface name is configured separately above and is not part of this file.') }}</p>
    </section>

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
.vpn-form { display: grid; gap: 16px; }
.vpn-form :deep(.n-form-item) { margin-bottom: 0 !important; }
.vpn-editor-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: end;
}
.vpn-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 12px;
}
.span-all { grid-column: 1 / -1; }
.configuration-file-editor { display: grid; gap: 8px; }
.configuration-file-editor p { margin: 0; color: var(--muted-foreground); font-size: 11px; }
.vpn-config-input :deep(.n-input__textarea-el) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12.5px;
  line-height: 1.6;
}
.vpn-form > footer { display: flex; justify-content: flex-end; }
@media (max-width: 760px) {
  .vpn-editor-header,
  .vpn-fields { grid-template-columns: 1fr; }
  .vpn-form > footer { justify-content: stretch; }
  .vpn-form > footer .n-button { width: 100%; }
}
</style>
