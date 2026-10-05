<script setup lang="ts">
import { computed, onMounted, onUnmounted, shallowRef } from 'vue'
import { RefreshCw, Wifi } from '@lucide/vue'

import { api, type WifiNetwork, type WifiStatus } from '@/api/client'
import { t } from '@/i18n/runtime'
import WifiApSettings from './WifiApSettings.vue'

const status = shallowRef<WifiStatus | null>(null)
const props = defineProps<{ initialSetup?: boolean; interfaceName?: 'ap0' | 'wlan0' }>()
const emit = defineEmits<{ changed: [] }>()
const networks = shallowRef<WifiNetwork[]>([])
const selected = shallowRef<WifiNetwork | null>(null)
const showConnectModal = shallowRef(false)
const password = shallowRef('')
const apSsid = shallowRef('')
const apPassword = shallowRef('')
const apChannel = shallowRef(6)
const apBand = shallowRef<'2.4' | '5'>('2.4')
const apDirty = shallowRef(false)
const loading = shallowRef(false)
const initialLoading = shallowRef(true)
const scanning = shallowRef(false)
const scanned = shallowRef(false)
const error = shallowRef('')
const connectError = shallowRef('')
const attemptedSsid = shallowRef('')
let timer: ReturnType<typeof setInterval> | undefined
let refreshing = false
let scanTask: Promise<void> | null = null

const showAp = computed(() => !props.interfaceName || props.interfaceName === 'ap0')
const showStation = computed(() => !props.interfaceName || props.interfaceName === 'wlan0')
const stationEnabled = computed(() => status.value?.mode !== 'ap')
const canSaveAp = computed(() => apDirty.value && !loading.value
  && new TextEncoder().encode(apSsid.value).length >= 1
  && new TextEncoder().encode(apSsid.value).length <= 32
  && !/[\x00-\x1f\x7f]/.test(apSsid.value)
  && /^[\x20-\x7e]{8,63}$/.test(apPassword.value)
  && apPassword.value.trim() === apPassword.value
  && (apChannel.value === 0
    ? (status.value?.ap_channels || [1, 6, 11]).some((channel) => (channel > 14 ? '5' : '2.4') === apBand.value)
    : (status.value?.ap_channels || [1, 6, 11]).includes(apChannel.value)
      && (apChannel.value > 14 ? '5' : '2.4') === apBand.value))

const canConnect = computed(() =>
  !!selected.value && !loading.value && !status.value?.connecting
    && (!selected.value.secure || password.value.length >= 8),
)

const displayNetworks = computed(() => networks.value.map((network) => ({
  ...network,
  bandLabel: (network.bands || []).map((band) => band.band.replace(' GHz', 'G')).join('/'),
  generations: [...new Set((network.bands || []).map((band) => band.generation).filter((value): value is string => !!value))],
})))

const connectedHit = computed(() => {
  const ssid = status.value?.connected ? status.value.station_ssid : ''
  if (!ssid) return null
  return displayNetworks.value.find((network) => network.ssid === ssid) || null
})

const listedNetworks = computed(() => {
  const ssid = status.value?.connected ? status.value.station_ssid : ''
  return displayNetworks.value.filter((network) => network.ssid !== ssid)
})

function securityBadge(network: WifiNetwork): string {
  switch (network.security) {
    case 'wpa3': return 'WPA3'
    case 'wpa2-wpa3': return 'WPA2/WPA3'
    case 'wpa2': return 'WPA2'
    case 'wpa': return 'WPA'
    case 'wep': return 'WEP'
    case 'owe': return 'OWE'
    case 'open': return t('network.wifi.open', '开放')
    default: return network.secure ? 'WPA2' : t('network.wifi.open', '开放')
  }
}

function signalLevel(dbm: number): number {
  return dbm >= -55 ? 3 : dbm >= -70 ? 2 : dbm >= -85 ? 1 : 0
}

async function refresh() {
  if (refreshing) return
  refreshing = true
  try {
    const recovering = status.value === null
    status.value = await api.getWifiStatus()
    if (recovering) error.value = ''
    if (!apDirty.value) {
      apSsid.value = status.value.ap_ssid
      apPassword.value = status.value.ap_password
      apChannel.value = status.value.ap_channel
      apBand.value = status.value.ap_band || (apChannel.value > 14 ? '5' : '2.4')
    }
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    initialLoading.value = false
    refreshing = false
  }
}

function scan() {
  if (scanTask) return scanTask
  scanning.value = true
  error.value = ''
  let task: Promise<void> = Promise.resolve()
  task = (async () => {
    try {
      networks.value = await api.scanWifi()
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason)
    } finally {
      scanning.value = false
      scanned.value = true
      if (scanTask === task) scanTask = null
    }
  })()
  scanTask = task
  return task
}

async function retryLoad() {
  initialLoading.value = true
  await refresh()
  if (status.value?.available && showStation.value && stationEnabled.value) void scan()
}

async function connect() {
  if (!selected.value || !canConnect.value) return
  attemptedSsid.value = selected.value.ssid
  loading.value = true
  connectError.value = ''
  try {
    status.value = await api.connectWifi(selected.value.ssid, password.value)
    password.value = ''
  } catch (reason) {
    connectError.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    loading.value = false
  }
}

function selectNetwork(network: WifiNetwork) {
  selected.value = network
  password.value = ''
  connectError.value = ''
  attemptedSsid.value = ''
  showConnectModal.value = true
}

async function toggleAp(enabled: boolean) {
  if (!status.value) return
  if (enabled && status.value.mode !== 'station' && !status.value.ap_enabled) {
    loading.value = true
    error.value = ''
    try {
      status.value = await api.setWifiAp(true)
      emit('changed')
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason)
    } finally {
      loading.value = false
    }
    return
  }
  await selectMode(enabled ? 'ap_station' : 'station')
}

async function toggleStation(enabled: boolean) {
  await selectMode(enabled ? 'ap_station' : 'ap')
}

async function saveApConfig() {
  if (!canSaveAp.value) return
  loading.value = true
  error.value = ''
  try {
    status.value = await api.setWifiApConfig(apSsid.value, apPassword.value, apChannel.value, apBand.value)
    apDirty.value = false
    emit('changed')
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    loading.value = false
  }
}

async function selectMode(mode: WifiStatus['mode']) {
  if (!status.value || mode === status.value.mode) return
  loading.value = true
  error.value = ''
  try {
    status.value = await api.setWifiMode(mode)
    emit('changed')
    if (mode !== 'ap' && showStation.value) void scan()
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void refresh().then(() => {
    if (status.value?.available && showStation.value && stationEnabled.value) void scan()
  })
  timer = setInterval(() => { void refresh() }, 5000)
})
onUnmounted(() => { if (timer) clearInterval(timer) })
</script>

<template>
  <section class="wifi-onboarding" :class="{ 'wifi-onboarding--embedded': props.interfaceName, 'wifi-onboarding--setup': props.initialSetup }">
    <div v-if="initialLoading" class="wifi-loading" :aria-label="t('network.wifi.loading', '正在加载无线设置…')">
      <n-skeleton text :repeat="2" />
      <n-skeleton height="34px" :sharp="false" />
    </div>
    <div v-else-if="!status" class="wifi-load-error" role="alert">
      <span>{{ error || t('network.wifi.loadFailed', '无线设置加载失败。') }}</span>
      <n-button size="small" @click="retryLoad">{{ t('network.wifi.retry', '重试') }}</n-button>
    </div>
    <p v-else-if="!status.available" class="wifi-muted">{{ t('network.wifi.unavailable', '此设备没有可用的 Wi-Fi 接口。') }}</p>
    <template v-else>
    <header v-if="!props.interfaceName && !props.initialSetup" class="wifi-heading">
      <div>
        <h3>{{ props.initialSetup ? t('network.wifi.setupTitle', '连接 Wi-Fi') : t('network.wifi.manageTitle', 'Wi-Fi') }}</h3>
        <p>{{ props.initialSetup
          ? t('network.wifi.setupDescription', '可先连接 Wi-Fi，也可以稍后继续配网。')
          : t('network.wifi.manageDescription', '管理设备热点和无线接入。') }}</p>
      </div>
      <Wifi :size="20" />
    </header>

    <WifiApSettings
      v-if="showAp && !props.initialSetup"
      :status="status" :ssid="apSsid" :password="apPassword" :channel="apChannel" :band="apBand"
      :busy="loading" :can-save="canSaveAp"
      @update:ssid="apSsid = $event; apDirty = true"
      @update:password="apPassword = $event; apDirty = true"
      @update:channel="apChannel = $event; apDirty = true"
      @update:band="apBand = $event; apDirty = true"
      @toggle="toggleAp" @save="saveApConfig"
    />

    <div v-if="showStation && !props.initialSetup" class="wifi-control-row">
      <div>
        <strong>{{ t('network.wifi.stationEnabled', '启用 Wi-Fi') }}</strong>
        <p class="wifi-muted">{{ t('network.wifi.stationEnabledHint', '连接附近的无线网络，通过 wlan0 获取地址。') }}</p>
      </div>
      <n-switch :value="stationEnabled" :disabled="loading || status.connecting" @update:value="toggleStation" />
    </div>

    <div v-if="showStation && (stationEnabled || props.initialSetup)" class="wifi-station">
      <div class="wifi-setup-label">{{ t('network.wifi.connected', '已连接') }}</div>
      <section :class="props.initialSetup ? 'ios-group' : 'wifi-current-wrap'">
        <div v-if="status.connected" class="wifi-network wifi-network--current">
          <n-tooltip v-if="connectedHit" trigger="hover">
            <template #trigger>
              <span class="wifi-signal-trigger" :aria-label="`${connectedHit.signal_dbm} dBm`">
                <svg class="wifi-signal" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                  <path d="M2 8.8a16 16 0 0 1 20 0" :opacity="signalLevel(connectedHit.signal_dbm) >= 3 ? 1 : .22" />
                  <path d="M5.3 12.2a11 11 0 0 1 13.4 0" :opacity="signalLevel(connectedHit.signal_dbm) >= 2 ? 1 : .22" />
                  <path d="M8.8 15.6a6 6 0 0 1 6.4 0" :opacity="signalLevel(connectedHit.signal_dbm) >= 1 ? 1 : .22" />
                  <circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" />
                </svg>
              </span>
            </template>
            {{ connectedHit.signal_dbm }} dBm
          </n-tooltip>
          <Wifi v-else :size="18" />
          <span class="wifi-network-details">
            <strong>{{ status.station_ssid }}</strong>
            <span class="wifi-network-badges">
              <span v-if="status.station_address" class="wifi-network-badge">{{ status.station_address }}</span>
              <span class="wifi-network-badge">{{ t('network.wifi.connected', '已连接') }}</span>
            </span>
          </span>
        </div>
        <p v-else-if="status.connecting" class="wifi-muted wifi-setup-empty">{{ t('network.wifi.connecting', '正在关联并获取 IP 地址…') }}</p>
        <p v-else class="wifi-muted wifi-setup-empty">{{ t('network.wifi.notConnected', '未连接') }}</p>
      </section>

      <div class="wifi-scan-heading">
        <strong>{{ t('network.wifi.available', '可用网络') }}</strong>
        <n-button size="small" :loading="scanning" @click="scan">
          <template #icon><RefreshCw /></template>
          {{ t('network.wifi.scan', '扫描') }}
        </n-button>
      </div>
      <section :class="props.initialSetup ? 'ios-group' : undefined">
        <div v-if="listedNetworks.length" class="wifi-networks" role="listbox" :aria-label="t('network.wifi.available', '可用网络')">
          <button
            v-for="network in listedNetworks"
            :key="`${network.ssid}:${network.secure}`"
            type="button"
            class="wifi-network"
            :class="{ 'wifi-network--selected': selected?.ssid === network.ssid }"
            role="option"
            :aria-selected="selected?.ssid === network.ssid"
            @click="selectNetwork(network)"
          >
            <n-tooltip trigger="hover">
              <template #trigger>
                <span class="wifi-signal-trigger" :aria-label="`${network.signal_dbm} dBm`">
                  <svg class="wifi-signal" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                    <path d="M2 8.8a16 16 0 0 1 20 0" :opacity="signalLevel(network.signal_dbm) >= 3 ? 1 : .22" />
                    <path d="M5.3 12.2a11 11 0 0 1 13.4 0" :opacity="signalLevel(network.signal_dbm) >= 2 ? 1 : .22" />
                    <path d="M8.8 15.6a6 6 0 0 1 6.4 0" :opacity="signalLevel(network.signal_dbm) >= 1 ? 1 : .22" />
                    <circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" />
                  </svg>
                </span>
              </template>
              {{ network.signal_dbm }} dBm
            </n-tooltip>
            <span class="wifi-network-details">
              <strong>{{ network.ssid }}</strong>
              <span class="wifi-network-badges">
                <span v-if="network.bandLabel" class="wifi-network-badge">{{ network.bandLabel }}</span>
                <span v-for="generation in network.generations" :key="generation" class="wifi-network-badge">{{ generation }}</span>
                <span class="wifi-network-badge">{{ securityBadge(network) }}</span>
              </span>
            </span>
          </button>
        </div>
        <p v-else class="wifi-muted wifi-scan-state" role="status">
          {{ scanning
            ? t('network.wifi.scanning', '正在搜索附近的网络…')
            : scanned
              ? (status.connected
                ? t('network.wifi.noOtherNetworks', '附近没有其他网络。')
                : t('network.wifi.noNetworks', '未找到网络，请重试扫描。'))
              : t('network.wifi.scanHint', '扫描后选择网络。') }}
        </p>
      </section>
    </div>
    <p v-if="error || (showStation && status.error)" class="wifi-error" role="alert">{{ error || status.error }}</p>

    <n-modal v-model:show="showConnectModal" preset="card" class="wifi-connect-modal" :title="selected ? `连接 ${selected.ssid}` : t('network.wifi.connect', '连接')" :mask-closable="!loading">
      <template v-if="selected">
        <p class="wifi-muted">{{ selected.ssid }} · {{ securityBadge(selected) }}</p>
        <n-input
          v-if="selected.secure"
          :value="password"
          type="password"
          show-password-on="click"
          :placeholder="t('network.wifi.networkPassword', '接入点密码')"
          @update:value="password = $event"
          @keyup.enter="connect"
        />
        <p v-if="status.connecting" class="wifi-muted">{{ t('network.wifi.connecting', '正在关联并获取 IP 地址…') }}</p>
        <p v-if="status.connected && status.station_ssid === selected.ssid" class="wifi-success">{{ t('network.wifi.connected', '已连接') }} · {{ status.station_address }}</p>
        <p v-if="connectError || (attemptedSsid === selected.ssid && status.error)" class="wifi-error" role="alert">{{ connectError || status.error }}</p>
      </template>
      <template #footer>
        <div class="wifi-modal-actions">
          <n-button :disabled="loading" @click="showConnectModal = false">{{ t('common.close', '关闭') }}</n-button>
          <n-button v-if="selected && !(status.connected && status.station_ssid === selected.ssid)" type="primary" :loading="loading || status.connecting" :disabled="!canConnect" @click="connect">
            {{ t('network.wifi.connect', '连接') }}
          </n-button>
        </div>
      </template>
    </n-modal>
    </template>
  </section>
</template>

<style scoped>
.wifi-onboarding { display: grid; gap: 18px; padding: 18px; border: 1px solid var(--border); border-radius: 12px; color: var(--foreground); }
.wifi-onboarding--embedded,
.wifi-onboarding--setup { padding: 0; border: 0; border-radius: 0; background: transparent; }
.wifi-onboarding--setup { gap: 0; }
.wifi-station { display: grid; gap: 8px; }
.wifi-onboarding--setup .wifi-station { gap: 0; }
.wifi-setup-label { color: var(--muted-foreground); font-size: 13px; font-weight: 400; }
.wifi-onboarding--setup .wifi-setup-label { margin: 18px 4px 6px; }
.wifi-onboarding--setup .wifi-scan-heading {
  position: relative;
  min-height: 0;
  margin: 20px 0 6px;
  padding: 16px 4px 0;
}
.wifi-onboarding--setup .wifi-scan-heading::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--border-strong);
}
.wifi-onboarding--setup .wifi-setup-label,
.wifi-onboarding--setup .wifi-scan-heading strong {
  color: var(--muted-foreground);
  font-size: 13px;
  font-weight: 400;
}
.wifi-onboarding--setup .wifi-setup-empty { min-height: 44px; margin: 0; padding: 12px 16px; }
.wifi-onboarding--setup .wifi-network--current { cursor: default; }
.wifi-onboarding--setup .wifi-network--current:hover { border-color: transparent; background: transparent; }
.wifi-current-wrap .wifi-network { border-radius: 10px; background: var(--onekvm-surface-inset); }
.wifi-onboarding--setup .wifi-networks { gap: 0; max-height: none; overflow: visible; }
.wifi-onboarding--setup .wifi-network {
  border: 0;
  border-radius: 0;
  border-bottom: 1px solid var(--border);
  background: transparent;
}
.wifi-onboarding--setup .wifi-network:last-child { border-bottom: 0; }
.wifi-onboarding--setup .wifi-success,
.wifi-onboarding--setup .wifi-error,
.wifi-onboarding--setup .wifi-scan-state { margin: 0; padding: 8px 16px 12px; }
.wifi-loading { display: grid; gap: 12px; max-width: 420px; }
.wifi-load-error { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--destructive, #d95757); font-size: 13px; }
.wifi-heading, .wifi-ap, .wifi-scan-heading, .wifi-connect { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.wifi-heading h3, .wifi-heading p, .wifi-ap p { margin: 0; }
.wifi-heading p, .wifi-ap p, .wifi-muted { color: var(--muted-foreground); font-size: 12px; line-height: 1.5; }
.wifi-ap { padding: 13px; border-radius: 10px; background: var(--onekvm-surface-inset); }
.wifi-control-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.wifi-control-row p { margin: 4px 0 0; }
.wifi-ap code { font-size: 13px; user-select: all; }
.wifi-networks { display: grid; gap: 5px; max-height: 260px; overflow-y: auto; }
.wifi-network { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--onekvm-surface-inset); color: inherit; text-align: left; cursor: pointer; }
.wifi-network:hover, .wifi-network--selected { border-color: var(--primary); background: var(--accent); }
.wifi-network--current { cursor: default; }
.wifi-network--current:hover { border-color: var(--border); background: var(--onekvm-surface-inset); }
.wifi-network:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
.wifi-signal { width: 21px; height: 21px; flex: none; }
.wifi-signal-trigger { display: inline-flex; flex: none; }
.wifi-network-details { display: grid; gap: 2px; min-width: 0; }
.wifi-network-details strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wifi-network small { color: var(--muted-foreground); line-height: 1.4; }
.wifi-network-badges { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 2px; }
.wifi-network-badge { padding: 1px 6px; border: 1px solid var(--border); border-radius: 4px; color: var(--muted-foreground); font-size: 11px; line-height: 1.5; }
.wifi-scan-state { margin: 0; }
.wifi-success { color: #36a870; }
.wifi-error { color: #d95757; }
.wifi-modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
@media (max-width: 540px) { .wifi-ap, .wifi-control-row { align-items: stretch; flex-direction: column; } .wifi-load-error { align-items: flex-start; flex-direction: column; } }
</style>

<style>
.wifi-connect-modal { width: min(100%, 420px); }
</style>
