<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Plus, RefreshCw, Trash2 } from '@/icons'
import { useMessage } from 'naive-ui'

import type { WireGuardConfig, WireGuardPeer } from '@/api/client'
import { t } from '@/i18n/runtime'
import { validCIDR, validEndpoint, validWireGuardKey } from '@/lib/network'
import { generateWireGuardKeyPair } from '@/lib/wireguard'
import {
  createWireGuardInterface,
  DEFAULT_WIREGUARD_ADDRESS,
  DEFAULT_WIREGUARD_PORT,
  parseWireGuardConfig,
  serializeWireGuardConfig,
  WireGuardConfigError,
} from '@/lib/wireguard-config'

const props = defineProps<{ modelValue: WireGuardConfig; disabled?: boolean }>()
const emit = defineEmits<{
  'update:modelValue': [value: WireGuardConfig]
  validity: [valid: boolean]
  remove: []
}>()
const message = useMessage()
const editorMode = ref<'form' | 'file'>('form')
const configurationFile = ref('')
const configurationError = ref('')
const pendingDefault = ref<WireGuardConfig | null>(null)
const configurationPlaceholder = `[Interface]
PrivateKey = ...
Address = ${DEFAULT_WIREGUARD_ADDRESS}
ListenPort = ${DEFAULT_WIREGUARD_PORT}`

function blankInterface(config: WireGuardConfig) {
  return !config.private_key && !config.public_key && config.addresses.length === 0 && config.peers.length === 0
}

function fill(template: string, params: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (token, key: string) => (
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : token
  ))
}

function configurationErrorText(reason: unknown) {
  if (!(reason instanceof WireGuardConfigError)) {
    return reason instanceof Error ? reason.message : String(reason)
  }
  const messageText = fill(t(`network.wireguard.errors.${reason.code}`, reason.message), reason.params)
  if (reason.params.line == null) return messageText
  return fill(t('network.wireguard.errors.line', 'Line {line}: {message}'), {
    line: reason.params.line,
    message: messageText,
  })
}

function ensureDefaultInterface() {
  const current = props.modelValue
  if (!blankInterface(current)) {
    pendingDefault.value = null
    return current
  }
  if (pendingDefault.value?.name === current.name) return pendingDefault.value
  try {
    const created = createWireGuardInterface(current.name)
    const next = { ...created, listen_port: current.listen_port || created.listen_port }
    pendingDefault.value = next
    emit('update:modelValue', next)
    return next
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : String(reason))
    return current
  }
}

function update<K extends keyof WireGuardConfig>(key: K, value: WireGuardConfig[K]) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}

function lines(value: string) {
  return value.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean)
}

function generateKeyPair() {
  try {
    const pair = generateWireGuardKeyPair()
    emit('update:modelValue', {
      ...props.modelValue,
      private_key: pair.privateKey,
      public_key: pair.publicKey,
    })
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : String(reason))
  }
}

function addPeer() {
  update('peers', [...props.modelValue.peers, {
    public_key: '',
    preshared_key: '',
    endpoint: '',
    allowed_ips: [],
    persistent_keepalive: 25,
  }])
}

function updatePeer(index: number, value: WireGuardPeer) {
  const peers = [...props.modelValue.peers]
  peers[index] = value
  update('peers', peers)
}

function removePeer(index: number) {
  update('peers', props.modelValue.peers.filter((_, peerIndex) => peerIndex !== index))
}

function parseConfigurationFile(value: string) {
  try {
    const parsed = parseWireGuardConfig(value, props.modelValue)
    configurationError.value = ''
    emit('update:modelValue', parsed)
    emit('validity', true)
    return true
  } catch (reason) {
    configurationError.value = configurationErrorText(reason)
    emit('validity', false)
    return false
  }
}

function updateConfigurationFile(value: string) {
  configurationFile.value = value
  parseConfigurationFile(value)
}

function selectEditorMode(value: 'form' | 'file') {
  if (value === 'file') {
    configurationFile.value = serializeWireGuardConfig(ensureDefaultInterface())
    configurationError.value = ''
    editorMode.value = 'file'
    return
  }
  if (parseConfigurationFile(configurationFile.value)) editorMode.value = 'form'
}

onMounted(() => {
  ensureDefaultInterface()
})
</script>

<template>
  <div class="wireguard-form">
    <div class="wireguard-editor-header">
	  <n-form-item :label="t('network.interfaces.interfaceName', 'Interface name')">
        <n-input
          :value="modelValue.name"
          :disabled="disabled"
          placeholder="wg0"
          :status="modelValue.name && !/^[A-Za-z0-9_.:@-]+$/.test(modelValue.name) ? 'error' : undefined"
          @update:value="update('name', $event)"
        />
      </n-form-item>
	  <n-form-item :label="t('network.wireguard.editorMode', 'Editor mode')">
        <n-radio-group :value="editorMode" :disabled="disabled" @update:value="selectEditorMode($event as 'form' | 'file')">
          <n-radio-button value="form">{{ t('network.wireguard.formEditor', 'Form') }}</n-radio-button>
          <n-radio-button value="file">{{ t('network.wireguard.fileEditor', 'Configuration file') }}</n-radio-button>
        </n-radio-group>
      </n-form-item>
    </div>

    <div v-if="editorMode === 'form'" class="wireguard-fields">
      <n-form-item :label="t('network.wireguard.listenPort', 'Listen port')">
        <n-input-number
          :value="modelValue.listen_port"
          :disabled="disabled"
          :min="0"
          :max="65535"
          :precision="0"
          placeholder="51820"
          @update:value="update('listen_port', $event || 0)"
        />
      </n-form-item>
      <n-form-item :label="t('network.wireguard.addresses', 'Addresses')">
        <n-input
          :value="modelValue.addresses.join(', ')"
          :disabled="disabled"
          :placeholder="DEFAULT_WIREGUARD_ADDRESS"
          :status="modelValue.addresses.some((value) => !validCIDR(value, value.includes(':') ? 6 : 4)) ? 'error' : undefined"
          @update:value="update('addresses', lines($event))"
        />
      </n-form-item>
      <n-form-item class="span-all" :label="t('network.wireguard.privateKey', 'Private key')">
        <div class="key-field">
          <n-input
            :value="modelValue.private_key"
            type="password"
            show-password-on="click"
            :disabled="disabled"
            placeholder=""
            :status="modelValue.private_key && !validWireGuardKey(modelValue.private_key) ? 'error' : undefined"
            @update:value="update('private_key', $event)"
          />
          <n-tooltip>
            <template #trigger>
              <n-button circle secondary :disabled="disabled" :aria-label="t('network.wireguard.generateKeyPair', 'Generate key pair')" @click="generateKeyPair">
                <template #icon><RefreshCw /></template>
              </n-button>
            </template>
            {{ t('network.wireguard.generateKeyPair', 'Generate key pair') }}
          </n-tooltip>
        </div>
      </n-form-item>
      <n-form-item class="span-all" :label="t('network.wireguard.publicKey', 'Public key')">
        <n-input
          :value="modelValue.public_key"
          readonly
          placeholder=""
          :status="modelValue.public_key && !validWireGuardKey(modelValue.public_key) ? 'error' : undefined"
        />
      </n-form-item>
    </div>

    <section v-if="editorMode === 'form'" class="peer-section">
      <header>
		<h3>{{ t('network.wireguard.peers', 'Peers') }}</h3>
        <n-button size="small" secondary :disabled="disabled" @click="addPeer">
          <template #icon><Plus /></template>
		  {{ t('network.wireguard.addPeer', 'Add peer') }}
        </n-button>
      </header>
	  <n-empty v-if="modelValue.peers.length === 0" :description="t('network.wireguard.noPeers', 'No peers')" size="small" />
      <div v-for="(peer, index) in modelValue.peers" :key="index" class="peer-fields">
        <header>
		  <strong>{{ t('network.wireguard.peer', 'Peer {number}').replace('{number}', String(index + 1)) }}</strong>
          <n-tooltip>
            <template #trigger>
			  <n-button quaternary circle size="small" :disabled="disabled" :aria-label="t('network.wireguard.removePeer', 'Remove peer')" @click="removePeer(index)">
                <template #icon><Trash2 /></template>
              </n-button>
            </template>
			{{ t('network.wireguard.removePeer', 'Remove peer') }}
          </n-tooltip>
        </header>
        <n-form-item class="span-all" :label="t('network.wireguard.publicKey', 'Public key')">
          <n-input
            :value="peer.public_key"
            :disabled="disabled"
            placeholder=""
            :status="peer.public_key && !validWireGuardKey(peer.public_key) ? 'error' : undefined"
            @update:value="updatePeer(index, { ...peer, public_key: $event })"
          />
        </n-form-item>
        <n-form-item class="span-all" :label="t('network.wireguard.presharedKey', 'Preshared key')">
          <n-input
            :value="peer.preshared_key"
            type="password"
            show-password-on="click"
            :disabled="disabled"
            placeholder=""
            :status="peer.preshared_key && !validWireGuardKey(peer.preshared_key) ? 'error' : undefined"
            @update:value="updatePeer(index, { ...peer, preshared_key: $event })"
          />
        </n-form-item>
		<n-form-item :label="t('network.wireguard.endpoint', 'Endpoint')">
          <n-input
            :value="peer.endpoint"
            :disabled="disabled"
            placeholder="vpn.example.com:51820"
            :status="peer.endpoint && !validEndpoint(peer.endpoint) ? 'error' : undefined"
            @update:value="updatePeer(index, { ...peer, endpoint: $event })"
          />
        </n-form-item>
		<n-form-item :label="t('network.wireguard.keepalive', 'Persistent keepalive')">
          <n-input-number
            :value="peer.persistent_keepalive"
            :disabled="disabled"
            :min="0"
            :max="65535"
            :precision="0"
            @update:value="updatePeer(index, { ...peer, persistent_keepalive: $event || 0 })"
          />
        </n-form-item>
        <n-form-item class="span-all" :label="t('network.wireguard.allowedIPs', 'Allowed IPs')">
          <n-input
            :value="peer.allowed_ips.join('\n')"
            type="textarea"
            :autosize="{ minRows: 2, maxRows: 4 }"
            :disabled="disabled"
            placeholder="0.0.0.0/0"
            :status="peer.allowed_ips.some((value) => !validCIDR(value, value.includes(':') ? 6 : 4)) ? 'error' : undefined"
            @update:value="updatePeer(index, { ...peer, allowed_ips: lines($event) })"
          />
        </n-form-item>
      </div>
    </section>

    <section v-else class="configuration-file-editor">
      <n-input
        :value="configurationFile"
        type="textarea"
        class="wireguard-config-input"
        :autosize="{ minRows: 8, maxRows: 24 }"
        :disabled="disabled"
        :status="configurationError ? 'error' : undefined"
        :placeholder="configurationPlaceholder"
        :input-props="{ spellcheck: false, autocomplete: 'off', autocapitalize: 'off' }"
        @update:value="updateConfigurationFile"
      />
      <n-alert v-if="configurationError" type="error" :show-icon="false">
        {{ t('network.wireguard.configurationError', 'Invalid WireGuard configuration') }}: {{ configurationError }}
      </n-alert>
      <p>{{ t('network.wireguard.configurationHint', 'The interface name is configured separately above and is not part of this file.') }}</p>
    </section>

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
.wireguard-form { display: grid; gap: 16px; }
.wireguard-form :deep(.n-form-item) { margin-bottom: 0 !important; }
.wireguard-editor-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: end;
}
.wireguard-fields {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  gap: 16px 12px;
}
.peer-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 180px;
  gap: 16px 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}
.span-all,
.peer-fields > header { grid-column: 1 / -1; }
.key-field { display: grid; width: 100%; grid-template-columns: minmax(0, 1fr) 34px; gap: 6px; align-items: center; }
.peer-section { display: grid; gap: 12px; padding-top: 14px; border-top: 1px solid var(--border); }
.peer-section > header,
.peer-fields > header { display: flex; align-items: center; justify-content: space-between; }
.peer-section h3 { margin: 0; font-size: 13px; }
.peer-fields > header strong { font-size: 12px; }
.configuration-file-editor { display: grid; gap: 8px; }
.configuration-file-editor p { margin: 0; color: var(--muted-foreground); font-size: 11px; }
.wireguard-config-input :deep(.n-input__textarea-el) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12.5px;
  line-height: 1.6;
}
.wireguard-form > footer { display: flex; justify-content: flex-end; }
@media (max-width: 760px) {
  .wireguard-editor-header,
  .wireguard-fields,
  .peer-fields { grid-template-columns: 1fr; gap: 16px 0; }
  .key-field { grid-template-columns: minmax(0, 1fr) 44px; }
  .wireguard-form > footer { justify-content: stretch; }
  .wireguard-form > footer .n-button { width: 100%; }
}
</style>
