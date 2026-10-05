<script setup lang="ts">
import { computed } from 'vue'

import type { WifiStatus } from '@/api/client'
import { t } from '@/i18n/runtime'

const props = defineProps<{
  status: WifiStatus
  ssid: string
  password: string
  channel: number
  band: '2.4' | '5'
  busy: boolean
  canSave: boolean
}>()
const emit = defineEmits<{
  'update:ssid': [value: string]
  'update:password': [value: string]
  'update:channel': [value: number]
  'update:band': [value: '2.4' | '5']
  toggle: [enabled: boolean]
  save: []
}>()

const supportedChannels = computed(() => props.status.ap_channels?.length
  ? props.status.ap_channels
  : [1, 6, 11])
const bandOptions = computed(() => [
  { label: '2.4 GHz', value: '2.4' },
  ...(supportedChannels.value.some((channel) => channel > 14) ? [{ label: '5 GHz', value: '5' }] : []),
])
const channelOptions = computed(() => supportedChannels.value
  .filter((channel) => (channel > 14 ? '5' : '2.4') === props.band)
  .map((channel) => ({ label: String(channel), value: channel })))
const availableChannelOptions = computed(() => [
  { label: t('network.wifi.autoChannel', 'Auto'), value: 0 },
  ...channelOptions.value,
])

function changeBand(value: '2.4' | '5') {
  emit('update:band', value)
  emit('update:channel', 0)
}
</script>

<template>
  <div class="wifi-ap-settings">
    <div class="wifi-setting-row">
      <div class="wifi-setting-copy">
        <strong>{{ t('network.wifi.apEnabled', 'Enable access point') }}</strong>
        <span>{{ t('network.wifi.apEnabledHint', 'Devices connected through this access point will disconnect when it is turned off.') }}</span>
      </div>
      <n-switch :value="status.ap_enabled" :disabled="busy || status.connecting" @update:value="emit('toggle', $event)" />
    </div>

    <n-form label-placement="top" :show-feedback="false" class="wifi-ap-form">
      <n-form-item label="SSID">
        <n-input :value="ssid" :disabled="busy" @update:value="emit('update:ssid', $event)" />
      </n-form-item>
      <n-form-item :label="t('network.wifi.apPassword', 'Access point password')">
        <n-input :value="password" type="password" show-password-on="click" :disabled="busy" @update:value="emit('update:password', $event)" />
      </n-form-item>
      <n-form-item :label="t('network.wifi.band', 'Band')">
        <n-select :value="band" :options="bandOptions" :disabled="busy" @update:value="changeBand" />
      </n-form-item>
      <n-form-item :label="t('network.wifi.channel', 'Channel')">
        <div class="wifi-channel-field">
          <n-select :value="channel" :options="availableChannelOptions" :disabled="busy" @update:value="emit('update:channel', $event)" />
          <span v-if="channel === 0 && status.ap_channel === 0 && status.ap_band === band && status.ap_operating_channel" class="wifi-channel-hint">
            {{ t('network.wifi.currentChannel', 'Current channel: {channel}').replace('{channel}', String(status.ap_operating_channel)) }}
          </span>
        </div>
      </n-form-item>
    </n-form>

    <div class="wifi-ap-footer">
      <span class="wifi-muted">{{ status.ap_address }} · {{ status.ap_enabled ? t('network.wifi.running', 'Running') : t('network.wifi.apOff', 'Access point off') }}<template v-if="status.ap_expires_in != null"> · {{ t('network.wifi.expiresIn', 'Turns off in {seconds}s').replace('{seconds}', String(status.ap_expires_in)) }}</template></span>
      <n-button size="small" type="primary" :disabled="!canSave" :loading="busy" @click="emit('save')">{{ t('common.save', 'Save') }}</n-button>
    </div>
  </div>
</template>

<style scoped>
.wifi-ap-settings { display: grid; gap: 18px; }
.wifi-setting-row, .wifi-ap-footer { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.wifi-setting-copy { display: grid; gap: 4px; min-width: 0; }
.wifi-setting-copy strong { color: var(--foreground); font-size: 13px; font-weight: 600; }
.wifi-setting-copy span, .wifi-muted { color: var(--muted-foreground); font-size: 12px; line-height: 1.5; }
.wifi-ap-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 16px; }
.wifi-ap-form :deep(.n-form-item) { min-width: 0; }
.wifi-channel-field { width: 100%; min-width: 0; }
.wifi-channel-hint { display: block; margin-top: 5px; color: var(--muted-foreground); font-size: 12px; }
@media (max-width: 640px) {
  .wifi-ap-form { grid-template-columns: 1fr; }
  .wifi-ap-footer { align-items: stretch; flex-direction: column; }
  .wifi-ap-footer :deep(.n-button) { align-self: flex-end; }
}
</style>
