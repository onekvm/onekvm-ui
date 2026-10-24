<script setup lang="ts">
import { computed } from 'vue'
import type { WifiApRadioConfig, WifiStatus } from '@/api/client'
import { t } from '@/i18n/runtime'
import { apPowerLimit, wifiApRadioError, wifiApStandardLabels } from '@/lib/wifi-ap-radio'

const props = defineProps<{ modelValue: WifiApRadioConfig; status: WifiStatus; band: '2.4' | '5'; channel: number; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: WifiApRadioConfig] }>()
const capabilities = computed(() => props.status.ap_radio_capabilities?.find(c => c.band === props.band))
const standards = computed(() => [{ label: t('network.wifi.autoChannel', 'Auto'), value: 'auto' },
  ...(capabilities.value?.standards || []).map(value => ({ label: wifiApStandardLabels[value], value }))])
const widths = computed(() => [{ label: t('network.wifi.autoChannel', 'Auto'), value: 0 },
  ...(capabilities.value?.channel_widths || []).map(value => ({ label: `${value} MHz`, value }))])
const maxPower = computed(() => apPowerLimit(props.status, props.band, props.channel))
const error = computed(() => wifiApRadioError(props.status, props.band, props.channel, props.modelValue))
function update<K extends keyof WifiApRadioConfig>(key: K, value: WifiApRadioConfig[K]) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}
</script>

<template>
  <section class="wifi-ap-radio">
    <div class="wifi-ap-radio-fields">
      <n-form-item :label="t('network.wifi.apStandard', 'Wireless standard')">
        <n-select :value="modelValue.standard" :options="standards" :disabled="disabled" @update:value="update('standard', $event)" />
      </n-form-item>
      <n-form-item :label="t('network.wifi.apChannelWidth', 'Channel width')">
        <n-select :value="modelValue.channel_width" :options="widths" :disabled="disabled" @update:value="update('channel_width', $event)" />
      </n-form-item>
      <n-form-item class="wifi-ap-power" :label="t('network.wifi.apTxPower', 'Transmit power')">
        <div class="wifi-ap-power-control">
          <n-checkbox :checked="modelValue.tx_power_dbm === null" :disabled="disabled || (modelValue.tx_power_dbm === null && maxPower === null)" @update:checked="update('tx_power_dbm', $event ? null : maxPower)">{{ t('network.wifi.autoChannel', 'Auto') }}</n-checkbox>
          <n-input-number :value="modelValue.tx_power_dbm" :disabled="disabled || modelValue.tx_power_dbm === null || maxPower === null" :min="0" :max="maxPower ?? 0" :precision="0" placeholder="dBm" @update:value="update('tx_power_dbm', $event)">
            <template #suffix>dBm</template>
          </n-input-number>
        </div>
      </n-form-item>
    </div>
    <p class="wifi-ap-radio-hint">{{ t('network.wifi.apRadioAutoHint', 'Auto uses the newest supported AP standard, 20 MHz bandwidth, and automatic transmit power. Wider channels require a fixed channel.') }}</p>
    <p v-if="maxPower !== null" class="wifi-ap-radio-hint">{{ t('network.wifi.apPowerLimit', 'Reported limit for this channel: {power} dBm. Interfaces on the same radio may share the power limit.').replace('{power}', String(maxPower)) }}</p>
    <p v-if="status.ap_operating_radio" class="wifi-ap-radio-hint">{{ t('network.wifi.apOperatingRadio', 'Operating') }}: <template v-if="status.ap_operating_radio.standard">{{ wifiApStandardLabels[status.ap_operating_radio.standard] }} · </template>{{ status.ap_operating_radio.channel_width }} MHz<template v-if="status.ap_operating_radio.tx_power_dbm !== null"> · {{ t('network.wifi.apReportedPower', 'Driver-reported power') }} {{ status.ap_operating_radio.tx_power_dbm }} dBm</template></p>
    <p v-if="error" class="wifi-ap-radio-error" role="alert">{{ t(`network.wifi.${error}`) }}</p>
  </section>
</template>

<style scoped>
.wifi-ap-radio { display: grid; gap: 8px; }
.wifi-ap-radio-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 16px; }
.wifi-ap-power { grid-column: 1 / -1; }
.wifi-ap-power-control { display: flex; align-items: center; gap: 12px; width: 100%; }
.wifi-ap-power-control :deep(.n-input-number) { flex: 1; min-width: 0; }
.wifi-ap-radio-hint, .wifi-ap-radio-error { margin: 0; color: var(--muted-foreground); font-size: 12px; line-height: 1.5; }
.wifi-ap-radio-error { color: var(--destructive); }
@media (max-width: 640px) { .wifi-ap-radio-fields { grid-template-columns: 1fr; } }
</style>
