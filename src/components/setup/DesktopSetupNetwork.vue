<script setup lang="ts">
import { computed, onMounted, onUnmounted, shallowRef, useId } from 'vue'
import { api, type NetworkConfig, type NetworkInterfaceStatus, type WifiStatus } from '@/api/client'
import { Cable, ChevronRight, Wifi } from '@/icons'
import { physicalInterfaceConfig } from '@/lib/network'
import { t } from '@/i18n/runtime'
import SetupEthernetForm from './SetupEthernetForm.vue'
import WifiOnboarding from '../WifiOnboarding.vue'

const props = defineProps<{ disabled: boolean; valid: boolean }>()
const network = defineModel<NetworkConfig>({ required: true })
const advancedOpen = defineModel<boolean>('advancedOpen', { required: true })
const vlanEnabled = defineModel<boolean>('vlanEnabled', { required: true })
const vlanID = defineModel<number>('vlanId', { required: true })
const interfaces = shallowRef<NetworkInterfaceStatus[]>([])
const wifiStatus = shallowRef<WifiStatus | null>(null)
const loading = shallowRef(true)
const loadFailed = shallowRef(false)
const showDialog = shallowRef(false)
const selectedNetwork = shallowRef<'wifi' | 'ethernet'>('wifi')
const ethernetFormID = useId()
let disposed = false

const wifiInterface = computed(() => interfaces.value.find(item => item.wifi_role === 'station'))
const hasWifi = computed(() => !!wifiInterface.value && wifiStatus.value?.available !== false)
const hasEthernet = computed(() => interfaces.value.some(item => item.port_type === 'physical' && !item.wifi_role))
const separateNetworks = computed(() => hasWifi.value && hasEthernet.value)
const wiredTitle = computed(() => t('auth.wiredNetwork', 'Wired network'))
const wifiSummary = computed(() => {
  if (wifiStatus.value?.connected) return [wifiStatus.value.station_ssid, wifiStatus.value.station_address].filter(Boolean).join(' · ')
  if (wifiStatus.value?.connecting) return t('network.wifi.connecting', 'Connecting to Wi-Fi…')
  return wifiStatus.value ? t('network.wifi.notConnected', 'Not connected') : wifiInterface.value?.name
})
const ethernetSummary = computed(() => {
  if (!props.valid) return t('auth.networkNeedsConfiguration', 'Configuration required')
  const primary = physicalInterfaceConfig(network.value, network.value.primary_interface)
  const mode = primary.ipv4_mode === 'static'
    ? primary.ipv4_address
    : primary.ipv4_mode === 'dhcp-static'
      ? t('network.interfaces.dhcpStatic', 'Automatic + fallback address')
      : t('network.interfaces.automatic', 'Automatic')
  return [network.value.primary_interface, mode].filter(Boolean).join(' · ')
})

async function loadNetworks() {
  loading.value = true
  loadFailed.value = false
  try {
    const links = await api.getNetworkInterfaces()
    if (disposed) return
    interfaces.value = links
    if (wifiInterface.value) {
      try {
        const status = await api.getWifiStatus(wifiInterface.value.name)
        if (!disposed) wifiStatus.value = status
      } catch {
        // The wireless editor provides its own retry if status is unavailable.
      }
    }
  } catch {
    if (!disposed) loadFailed.value = true
  } finally {
    if (!disposed) loading.value = false
  }
}

function openNetwork(kind: 'wifi' | 'ethernet') {
  if (props.disabled) return
  selectedNetwork.value = kind
  showDialog.value = true
}

function finishNetwork() {
  if (!props.disabled && props.valid) showDialog.value = false
}

onMounted(loadNetworks)
onUnmounted(() => { disposed = true })
</script>

<template>
  <div v-if="loading" class="setup-network-loading" aria-busy="true">
    <n-skeleton height="72px" :sharp="false" />
    <n-skeleton height="72px" :sharp="false" />
  </div>
  <n-alert v-else-if="loadFailed" type="error" :bordered="false">
    {{ t('auth.networkLoadFailed', 'Unable to load network interfaces.') }}
    <template #action>
      <n-button size="small" :disabled="disabled" @click="loadNetworks">{{ t('network.wifi.retry', 'Retry') }}</n-button>
    </template>
  </n-alert>
  <template v-else-if="separateNetworks">
    <ul class="setup-network-list">
      <li>
        <button type="button" class="setup-network-entry" :disabled="disabled" aria-haspopup="dialog" :aria-expanded="showDialog && selectedNetwork === 'wifi'" @click="openNetwork('wifi')">
          <Wifi class="setup-network-icon" aria-hidden="true" />
          <span class="setup-network-label"><strong>Wi-Fi</strong><span>{{ wifiSummary }}</span></span>
          <ChevronRight class="setup-network-chevron" aria-hidden="true" />
        </button>
      </li>
      <li>
        <button type="button" class="setup-network-entry" :disabled="disabled" aria-haspopup="dialog" :aria-expanded="showDialog && selectedNetwork === 'ethernet'" @click="openNetwork('ethernet')">
          <Cable class="setup-network-icon" aria-hidden="true" />
          <span class="setup-network-label"><strong>{{ wiredTitle }}</strong><span :class="{ 'setup-network-invalid': !valid }">{{ ethernetSummary }}</span></span>
          <ChevronRight class="setup-network-chevron" aria-hidden="true" />
        </button>
      </li>
    </ul>
    <n-modal
      v-model:show="showDialog"
      preset="card"
      :style="{ width: '560px', maxWidth: 'calc(100vw - 32px)' }"
      :title="selectedNetwork === 'wifi' ? 'Wi-Fi' : wiredTitle"
      :mask-closable="!disabled"
      :closable="!disabled"
      :close-on-esc="!disabled"
      :content-style="{ maxHeight: 'calc(100dvh - 196px)', overflowY: 'auto' }"
    >
      <WifiOnboarding
        v-if="selectedNetwork === 'wifi'"
        initial-setup
        :interface-name="wifiInterface?.name"
        :disabled="disabled"
        :active="showDialog"
        @status="wifiStatus = $event"
        @connected="showDialog = false"
      />
      <n-form v-else :id="ethernetFormID" label-placement="top" :show-feedback="false" @submit.prevent.stop="finishNetwork">
        <SetupEthernetForm v-model="network" v-model:advanced-open="advancedOpen" v-model:vlan-enabled="vlanEnabled" v-model:vlan-id="vlanID" :disabled="disabled" />
      </n-form>
      <template #footer>
        <div class="setup-network-actions">
          <n-button
            type="primary"
            :attr-type="selectedNetwork === 'ethernet' ? 'submit' : 'button'"
            :form="selectedNetwork === 'ethernet' ? ethernetFormID : undefined"
            :disabled="disabled || !valid"
            @click="selectedNetwork === 'wifi' && finishNetwork()"
          >{{ t('auth.done', 'Done') }}</n-button>
        </div>
      </template>
    </n-modal>
  </template>
  <div v-else class="setup-network-inline">
    <template v-if="hasWifi">
      <h2 class="setup-network-heading">Wi-Fi</h2>
      <WifiOnboarding initial-setup :interface-name="wifiInterface?.name" :disabled="disabled" @status="wifiStatus = $event" />
    </template>
    <template v-if="hasEthernet || !hasWifi">
      <h2 class="setup-network-heading">{{ wiredTitle }}</h2>
      <SetupEthernetForm v-model="network" v-model:advanced-open="advancedOpen" v-model:vlan-enabled="vlanEnabled" v-model:vlan-id="vlanID" :disabled="disabled" />
    </template>
  </div>
</template>

<style scoped>
.setup-network-loading { display: grid; gap: 12px; }
.setup-network-list { margin: 0; padding: 0; overflow: hidden; list-style: none; border: 1px solid var(--border); border-radius: var(--radius); }
.setup-network-list > li + li { border-top: 1px solid var(--border); }
.setup-network-entry { display: flex; width: 100%; min-height: 76px; align-items: center; gap: 16px; padding: 16px; border: 0; background: transparent; color: var(--foreground); font: inherit; text-align: left; cursor: pointer; transition: background-color 140ms ease; }
.setup-network-entry:hover:not(:disabled), .setup-network-entry:active:not(:disabled) { background: var(--accent); }
.setup-network-entry:focus-visible { outline: 2px solid var(--primary); outline-offset: -2px; }
.setup-network-entry:disabled { cursor: default; opacity: .5; }
.setup-network-icon { width: 20px; height: 20px; flex: none; color: var(--muted-foreground); }
.setup-network-label { display: grid; min-width: 0; flex: 1; gap: 4px; }
.setup-network-label strong { font-size: 14px; font-weight: 600; }
.setup-network-label > span { overflow: hidden; color: var(--muted-foreground); font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.setup-network-label > .setup-network-invalid { color: var(--error-color, var(--destructive)); }
.setup-network-chevron { width: 16px; height: 16px; flex: none; color: var(--muted-foreground); }
.setup-network-actions { display: flex; justify-content: flex-end; }
.setup-network-heading { margin: 0 0 16px; font-size: 15px; font-weight: 600; }
.setup-network-inline { display: grid; gap: 0; }
</style>
