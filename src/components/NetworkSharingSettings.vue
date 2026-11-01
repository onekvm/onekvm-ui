<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'
import { api, type OneKVMConfig, type OneKVMStatus, type USBConfig, type WifiStatus } from '@/api/client'
import { t } from '@/i18n/runtime'
import { usbEndpointCosts, usbFunctionsFit } from '@/lib/usb-capacity'
import USBCapacityBadge from './USBCapacityBadge.vue'

const props = defineProps<{ config: OneKVMConfig; status: OneKVMStatus | null; videoSessionId: string; disabled?: boolean }>()
const emit = defineEmits<{ 'update:usb': [value: USBConfig] }>()
const wifi = shallowRef<WifiStatus | null>(null)
const loading = shallowRef(false)
const savingAp = shallowRef(false)
const savingUsb = shallowRef(false)
const loadError = shallowRef('')
const actionError = shallowRef('')
const hasWifi = computed(() => props.status?.network?.wifi_available === true)
const gadget = computed(() => props.status?.hid?.gadget)
const busy = computed(() => Boolean(props.disabled || loading.value || savingAp.value || savingUsb.value))
const usbBlocked = computed(() => !props.config.usb.network_sharing
  && !usbFunctionsFit(props.config.usb, props.config.audio, gadget.value, { network: true }))

async function refresh() {
  if (!hasWifi.value || busy.value) return
  loading.value = true
  try {
    wifi.value = await api.getWifiStatus()
    loadError.value = ''
  } catch (reason) {
    loadError.value = reason instanceof Error ? reason.message : String(reason)
  } finally { loading.value = false }
}

async function shareAp(enabled: boolean) {
  if (busy.value || !wifi.value) return
  savingAp.value = true
  actionError.value = ''
  try {
    const current = await api.getWifiStatus()
    if (!current.ap_network) throw new Error(t('network.wifi.loadFailed', 'Could not load Wi-Fi settings.'))
    wifi.value = await api.setWifiApConfig(current.ap_ssid, current.ap_password, current.ap_channel,
      current.ap_band, { ...current.ap_network, network_sharing: enabled }, current.ap_radio)
  } catch (reason) {
    actionError.value = reason instanceof Error ? reason.message : String(reason)
  } finally { savingAp.value = false }
}

async function shareUsb(enabled: boolean) {
  if (busy.value || (enabled && usbBlocked.value)) return
  savingUsb.value = true
  actionError.value = ''
  try {
    const current = await api.getConfig()
    const usb = { ...current.usb, network_sharing: enabled }
    await api.saveConfig({ ...current, usb }, props.videoSessionId)
    emit('update:usb', usb)
  } catch (reason) {
    actionError.value = reason instanceof Error ? reason.message : String(reason)
  } finally { savingUsb.value = false }
}

watch(hasWifi, () => { void refresh() }, { immediate: true })
const timer = window.setInterval(() => { void refresh() }, 5000)
onBeforeUnmount(() => window.clearInterval(timer))
</script>

<template>
  <section v-if="hasWifi || gadget?.network_sharing != null" class="network-sharing-settings">
    <h2>{{ t('network.sharing.title', 'Network sharing') }}</h2>
    <n-alert v-if="loadError || actionError" type="error" :bordered="false">{{ actionError || loadError }}</n-alert>
    <div v-if="hasWifi" class="network-sharing-row">
      <div class="network-sharing-copy">
        <strong>{{ t('network.wifi.apNetworkSharing', 'AP internet sharing') }}</strong>
        <span>{{ t('network.wifi.apNetworkSharingHint', 'Share OneKVM’s internet connection with devices on this access point. The access point must be on and OneKVM must have a working uplink.') }}</span>
        <span v-if="wifi?.ap_enabled">{{ t('network.wifi.apReconnectHint', 'Saving restarts the access point and disconnects its clients.') }}</span>
        <span v-if="wifi?.ap_network?.network_sharing && wifi.ap_network.dhcp_enabled === false">{{ t('network.sharing.staticClientHint', 'With DHCP off, set the AP address as the gateway and DNS server on connected devices.') }}</span>
      </div>
      <n-switch :value="wifi?.ap_network?.network_sharing === true" :disabled="busy || !wifi" :loading="savingAp" :aria-label="t('network.wifi.apNetworkSharing', 'AP internet sharing')" @update:value="shareAp" />
    </div>
    <div v-if="gadget?.network_sharing != null" class="network-sharing-row">
      <div class="network-sharing-copy">
        <strong>{{ t('settings.advancedSettings.usbPage.networkSharing', 'USB network sharing') }}</strong>
        <span>{{ t('settings.advancedSettings.usbPage.networkSharingHint', 'Share OneKVM’s internet connection with the controlled device over USB. Supports Linux and macOS with automatic IP configuration.') }}</span>
        <span>{{ t('network.sharing.usbReconnectHint', 'Changing USB sharing briefly reconnects the keyboard and mouse.') }}</span>
        <span v-if="usbBlocked">{{ t('settings.advancedSettings.usbPage.networkSharingBlocked', 'Not enough USB capacity. Turn off unused USB functions first.') }}</span>
      </div>
      <div class="network-sharing-controls">
        <USBCapacityBadge :endpoints="usbEndpointCosts.network" />
        <n-switch :value="Boolean(config.usb.network_sharing)" :disabled="busy || usbBlocked" :loading="savingUsb" :aria-label="t('settings.advancedSettings.usbPage.networkSharing', 'USB network sharing')" @update:value="shareUsb" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.network-sharing-settings { display: grid; gap: 16px; }
.network-sharing-settings h2 { margin: 0; font-size: 15px; }
.network-sharing-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.network-sharing-copy { display: grid; gap: 4px; min-width: 0; }
.network-sharing-copy strong { color: var(--foreground); font-size: 13px; font-weight: 600; }
.network-sharing-copy span { color: var(--muted-foreground); font-size: 12px; line-height: 1.5; }
.network-sharing-controls { display: flex; flex: 0 0 auto; align-items: center; gap: 12px; }
</style>
