<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { Plus, Trash2 } from '@lucide/vue'

import type { WebRtcIceConfig, WebRtcTurnServerConfig } from '@/api/client'
import { t } from '@/i18n/runtime'
import { validIceURL } from '@/lib/network'

const props = defineProps<{ modelValue?: WebRtcIceConfig; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: WebRtcIceConfig] }>()

const emptyIce = (): WebRtcIceConfig => ({})

function legacyTurnServers(value?: WebRtcIceConfig): WebRtcTurnServerConfig[] {
  const username = value?.turn_username || ''
  const credential = value?.turn_credential || ''
  return (value?.turn || '')
    .split(/\r?\n/)
    .map((url) => url.trim())
    .filter(Boolean)
    .map((url) => ({ url, username, credential }))
}

function turnServers(value?: WebRtcIceConfig): WebRtcTurnServerConfig[] {
  const servers = value?.turn_servers?.length ? value.turn_servers : legacyTurnServers(value)
  return servers.map((server) => ({
    url: server.url || '',
    username: server.username || '',
    credential: server.credential || '',
  }))
}

function cloneIce(value?: WebRtcIceConfig): WebRtcIceConfig {
  if (!value) return emptyIce()
  return {
    ...value,
    turn_servers: value.turn_servers?.map((server) => ({ ...server })),
  }
}

function hasIceConfig(value?: WebRtcIceConfig) {
  return Boolean(
    value?.stun?.trim()
    || turnServers(value).some((server) => server.url.trim() || server.username.trim() || server.credential.trim()),
  )
}

const enabled = shallowRef(hasIceConfig(props.modelValue))
const disabledDraft = shallowRef<WebRtcIceConfig | null>(null)
let nextTurnRowKey = 0
const newTurnRowKey = () => `turn-${nextTurnRowKey++}`
const turnRowKeys = shallowRef(currentTurnRowKeys(turnServers(props.modelValue).length))
let lastEmittedSnapshot: string | null = null

function currentTurnRowKeys(length: number) {
  return Array.from({ length }, newTurnRowKey)
}

const iceSnapshot = (value?: WebRtcIceConfig) => JSON.stringify({
  stun: value?.stun || '',
  turn_servers: turnServers(value),
})

const currentStun = computed(() => props.modelValue?.stun || '')
const currentTurnServers = computed(() => turnServers(props.modelValue))

watch(() => props.modelValue, (value) => {
  if (iceSnapshot(value) === lastEmittedSnapshot) {
    lastEmittedSnapshot = null
    return
  }
  enabled.value = hasIceConfig(value)
  turnRowKeys.value = currentTurnRowKeys(turnServers(value).length)
  if (hasIceConfig(value)) disabledDraft.value = null
})

function updateModel(value: WebRtcIceConfig) {
  lastEmittedSnapshot = iceSnapshot(value)
  emit('update:modelValue', value)
}

function canonicalConfig(stun: string, servers: WebRtcTurnServerConfig[]): WebRtcIceConfig {
  return {
    ...(stun ? { stun } : {}),
    ...(servers.length ? { turn_servers: servers } : {}),
  }
}

function setEnabled(value: boolean) {
  enabled.value = value
  if (!value) {
    disabledDraft.value = cloneIce(props.modelValue)
    updateModel(emptyIce())
    return
  }
  if (disabledDraft.value && hasIceConfig(disabledDraft.value)) {
    updateModel(cloneIce(disabledDraft.value))
  }
}

function updateStun(value: string) {
  updateModel(canonicalConfig(value.replace(/\r/g, ''), currentTurnServers.value))
}

function addTurnServer() {
  turnRowKeys.value = [...turnRowKeys.value, newTurnRowKey()]
  updateModel(canonicalConfig(currentStun.value, [
    ...currentTurnServers.value,
    { url: '', username: '', credential: '' },
  ]))
}

function updateTurnServer(index: number, update: Partial<WebRtcTurnServerConfig>) {
  const servers = currentTurnServers.value.map((server, serverIndex) => (
    serverIndex === index ? { ...server, ...update } : server
  ))
  updateModel(canonicalConfig(currentStun.value, servers))
}

function removeTurnServer(index: number) {
  turnRowKeys.value = turnRowKeys.value.filter((_, serverIndex) => serverIndex !== index)
  updateModel(canonicalConfig(
    currentStun.value,
    currentTurnServers.value.filter((_, serverIndex) => serverIndex !== index),
  ))
}
</script>

<template>
  <section class="network-hostname-card">
    <header>
      <div class="webrtc-heading-row">
        <h2>{{ t('network.webrtc.title', 'WebRTC ICE') }}</h2>
        <div class="webrtc-custom-control">
          <span>{{ t('network.webrtc.custom', 'Custom') }}</span>
          <n-switch
            :value="enabled"
            :disabled="disabled"
            :aria-label="t('network.webrtc.enableCustom', 'Enable custom ICE servers')"
            @update:value="setEnabled"
          />
        </div>
      </div>
      <p>{{ t('network.webrtc.description', 'LAN viewing can use host candidates. Configure STUN or TURN only when remote access requires it.') }}</p>
    </header>

    <n-collapse-transition :show="enabled">
      <div class="webrtc-settings-fields">
        <n-form label-placement="top" :show-feedback="true">
          <n-form-item :label="t('network.webrtc.stun', 'STUN servers')">
            <n-input
              :value="currentStun"
              :disabled="disabled"
              type="textarea"
              :autosize="{ minRows: 2, maxRows: 6 }"
              placeholder="stun:stun.l.google.com:19302"
              clearable
              :status="validIceURL(currentStun, 'stun') ? undefined : 'error'"
              @update:value="updateStun"
            />
            <template #feedback>{{ t('network.webrtc.onePerLine', 'Enter one server per line.') }}</template>
          </n-form-item>
        </n-form>

        <div class="turn-list">
          <div class="turn-list-header">
            <div>
              <strong>{{ t('network.webrtc.turn', 'TURN servers') }}</strong>
              <p>{{ t('network.webrtc.turnDescription', 'Each TURN server uses its own username and credential.') }}</p>
            </div>
            <n-button size="small" secondary :disabled="disabled" @click="addTurnServer">
              <template #icon><Plus /></template>
              {{ t('network.webrtc.addTurn', 'Add TURN server') }}
            </n-button>
          </div>

          <n-empty
            v-if="currentTurnServers.length === 0"
            :description="t('network.webrtc.noTurn', 'No TURN servers')"
            size="small"
          />

          <div
            v-for="(server, index) in currentTurnServers"
            :key="turnRowKeys[index]"
            class="turn-server-panel"
          >
            <div class="turn-server-fields">
              <n-form-item :label="t('network.webrtc.turnUrl', 'Server URL')">
                <n-input
                  :value="server.url"
                  :disabled="disabled"
                  placeholder="turn:turn.example.com:3478"
                  :status="server.url.trim() && validIceURL(server.url, 'turn') ? undefined : 'error'"
                  @update:value="updateTurnServer(index, { url: $event.trim() })"
                />
              </n-form-item>
              <n-form-item :label="t('network.webrtc.username', 'Username')">
                <n-input
                  :value="server.username"
                  :disabled="disabled"
                  :status="server.username.trim() ? undefined : 'error'"
                  @update:value="updateTurnServer(index, { username: $event })"
                />
              </n-form-item>
              <n-form-item :label="t('network.webrtc.credential', 'Credential')">
                <n-input
                  type="password"
                  show-password-on="click"
                  :value="server.credential"
                  :disabled="disabled"
                  :status="server.credential.trim() ? undefined : 'error'"
                  @update:value="updateTurnServer(index, { credential: $event })"
                />
              </n-form-item>
            </div>
            <div class="turn-server-actions">
              <n-button quaternary size="small" type="error" :disabled="disabled" @click="removeTurnServer(index)">
                <template #icon><Trash2 /></template>
                {{ t('network.webrtc.removeTurn', 'Remove TURN server') }}
              </n-button>
            </div>
          </div>
        </div>
      </div>
    </n-collapse-transition>
  </section>
</template>

<style scoped>
.network-hostname-card {
  display: grid;
  gap: 16px;
  padding-top: 20px;
  border-top: 1px solid var(--border, var(--border));
}
.network-hostname-card header h2 { margin: 0; font-size: 14px; }
.network-hostname-card header p { margin: 4px 0 0; color: var(--muted-foreground); font-size: 11px; line-height: 1.5; }
.webrtc-heading-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.webrtc-custom-control {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  font-weight: 500;
}
.webrtc-settings-fields,
.turn-list {
  display: grid;
  gap: 14px;
}
.webrtc-settings-fields > :deep(.n-form) > .n-form-item:last-child { margin-bottom: 0; }
.turn-list-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.turn-list-header strong { font-size: 13px; font-weight: 600; }
.turn-list-header p { margin: 4px 0 0; color: var(--muted-foreground); font-size: 11px; line-height: 1.5; }
.turn-server-panel {
  overflow: hidden;
  border: 1px solid var(--border, var(--border));
  border-radius: var(--radius-large, 7px);
  background: var(--card, var(--card));
}
.turn-server-fields {
  display: grid;
  grid-template-columns: minmax(180px, 1.35fr) minmax(130px, 1fr) minmax(130px, 1fr);
  align-items: end;
  gap: 10px;
  padding: 14px;
}
.turn-server-fields :deep(.n-form-item) { margin-bottom: 0; }
.turn-server-actions {
  display: flex;
  justify-content: flex-end;
  padding: 6px 8px;
  border-top: 1px solid var(--border, var(--border));
}
@media (max-width: 760px) {
  .turn-list-header { flex-wrap: wrap; }
  .turn-server-fields { grid-template-columns: 1fr; gap: 12px; padding: 14px 12px; }
}
</style>
