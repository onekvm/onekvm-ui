<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useMessage } from 'naive-ui'

import type { OneKVMStatus } from '@/api/client'
import { t } from '@/i18n/runtime'
import {
  deviceLooksLikeGamepad,
  fromHIDInputReport,
  fromStandardGamepad,
  gamepadReportsEqual,
  hidGamepadFilters,
  idleGamepadReport,
  webHIDSupported,
} from '@/lib/gamepad'
import { onekvm, type GamepadReport } from '@/lib/onekvm'
import HidHostAlert from './HidHostAlert.vue'

const props = defineProps<{
  hid?: OneKVMStatus['hid'] | null
  placement?: 'top-end' | 'bottom-end' | 'right-start' | 'left-start'
}>()

const emit = defineEmits<{
  'update:show': [show: boolean]
}>()

const message = useMessage()
const popoverOpen = ref(false)
const requesting = ref(false)
const webhidDevices = ref<{ id: string; name: string }[]>([])
const browserPads = ref<{ id: string; name: string }[]>([])
const hidSupported = webHIDSupported()
const gadgetEnabled = computed(() => Boolean(props.hid?.gamepad))

const openedHID = new Map<string, HIDDevice>()
let lastReport = idleGamepadReport()
let lastHIDAt = 0
let pollFrame = 0
let hidConnectListener: ((event: Event) => void) | null = null
let hidDisconnectListener: ((event: Event) => void) | null = null

const captureActive = computed(() => webhidDevices.value.length > 0 || browserPads.value.length > 0)

function deviceKey(device: HIDDevice) {
  return `${device.vendorId}:${device.productId}:${device.productName}`
}

function updateShow(show: boolean) {
  popoverOpen.value = show
  emit('update:show', show)
}

function publish(report: GamepadReport) {
  if (!gadgetEnabled.value) return
  if (gamepadReportsEqual(report, lastReport)) return
  lastReport = report
  onekvm.sendGamepad(report)
}

function stopHIDDevice(device: HIDDevice) {
  device.oninputreport = null
  if (device.opened) void device.close().catch(() => undefined)
  openedHID.delete(deviceKey(device))
}

function handleHIDReport(event: HIDInputReportEvent) {
  const parsed = fromHIDInputReport(event.device, event.reportId, event.data)
  if (!parsed) return
  lastHIDAt = performance.now()
  publish(parsed)
}

async function openHIDDevice(device: HIDDevice) {
  if (!gadgetEnabled.value) return
  const key = deviceKey(device)
  if (openedHID.has(key)) return
  if (!device.opened) await device.open()
  device.oninputreport = handleHIDReport
  openedHID.set(key, device)
  syncDeviceLists()
}

function syncDeviceLists() {
  webhidDevices.value = [...openedHID.values()].map((device) => ({
    id: deviceKey(device),
    name: device.productName || `VID ${device.vendorId.toString(16)} PID ${device.productId.toString(16)}`,
  }))
  if (typeof navigator === 'undefined' || !navigator.getGamepads) {
    browserPads.value = []
    return
  }
  browserPads.value = [...navigator.getGamepads()]
    .filter((pad): pad is Gamepad => Boolean(pad))
    .map((pad) => ({
      id: `${pad.index}:${pad.id}`,
      name: pad.id,
    }))
}

async function restoreHIDDevices() {
  if (!hidSupported || !gadgetEnabled.value || !navigator.hid) return
  const devices = await navigator.hid.getDevices()
  for (const device of devices) {
    if (!deviceLooksLikeGamepad(device)) continue
    try {
      await openHIDDevice(device)
    } catch (error) {
      console.warn('WebHID gamepad restore failed', error)
    }
  }
}

async function requestHIDDevice() {
  if (!gadgetEnabled.value) {
    message.warning(t('gamepad.enableFirst', 'Enable the USB gamepad in Advanced settings → USB first.'))
    return
  }
  if (!hidSupported || !navigator.hid) {
    message.warning(t('gamepad.webhidUnsupported', 'This browser does not support WebHID. Chrome or Edge is required for USB controller passthrough.'))
    return
  }
  requesting.value = true
  try {
    const devices = await navigator.hid.requestDevice({ filters: hidGamepadFilters() })
    for (const device of devices) await openHIDDevice(device)
    if (!devices.length) return
    startPolling()
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return
    message.error(error instanceof Error ? error.message : t('gamepad.requestFailed', 'Failed to open the controller.'))
  } finally {
    requesting.value = false
  }
}

function pollBrowserGamepads() {
  if (!gadgetEnabled.value) return
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return
  const pads = [...navigator.getGamepads()].filter((pad): pad is Gamepad => Boolean(pad))
  syncDeviceLists()
  if (!pads.length) return
  if (openedHID.size > 0 && performance.now() - lastHIDAt < 250) return
  publish(fromStandardGamepad(pads[0]))
}

function startPolling() {
  if (pollFrame) return
  const tick = () => {
    pollBrowserGamepads()
    pollFrame = window.requestAnimationFrame(tick)
  }
  pollFrame = window.requestAnimationFrame(tick)
}

function stopPolling() {
  if (pollFrame) window.cancelAnimationFrame(pollFrame)
  pollFrame = 0
}

function releaseAll() {
  for (const device of openedHID.values()) stopHIDDevice(device)
  openedHID.clear()
  webhidDevices.value = []
  browserPads.value = []
  lastReport = idleGamepadReport()
  onekvm.sendIdleGamepad()
  stopPolling()
}

async function forgetDevice(id: string) {
  const device = openedHID.get(id)
  if (!device) return
  stopHIDDevice(device)
  if (device.forget) await device.forget().catch(() => undefined)
  syncDeviceLists()
  if (!openedHID.size && !browserPads.value.length) onekvm.sendIdleGamepad()
}

watch(gadgetEnabled, (enabled) => {
  if (enabled) {
    void restoreHIDDevices()
    startPolling()
    return
  }
  releaseAll()
})

onMounted(() => {
  if (hidSupported && navigator.hid) {
    hidConnectListener = (event: Event) => {
      const device = (event as Event & { device?: HIDDevice }).device
      if (!device || !deviceLooksLikeGamepad(device)) return
      void openHIDDevice(device)
    }
    hidDisconnectListener = (event: Event) => {
      const device = (event as Event & { device?: HIDDevice }).device
      if (!device) return
      stopHIDDevice(device)
      syncDeviceLists()
    }
    navigator.hid.addEventListener('connect', hidConnectListener)
    navigator.hid.addEventListener('disconnect', hidDisconnectListener)
  }
  if (gadgetEnabled.value) {
    void restoreHIDDevices()
    startPolling()
  }
})

onBeforeUnmount(() => {
  if (hidSupported && navigator.hid) {
    if (hidConnectListener) navigator.hid.removeEventListener('connect', hidConnectListener)
    if (hidDisconnectListener) navigator.hid.removeEventListener('disconnect', hidDisconnectListener)
  }
  releaseAll()
})
</script>

<template>
  <n-popover
    :show="popoverOpen"
    trigger="click"
    :placement="placement || 'bottom-end'"
    :show-arrow="false"
    class="control-popover gamepad-control-popover"
    to=".console-workspace"
    @update:show="updateShow"
  >
    <template #trigger><slot /></template>
    <div class="display-status-popover">
      <header class="control-popover-header">
        <strong>{{ t('gamepad.title', 'Gamepad') }}</strong>
      </header>
      <HidHostAlert :hid="hid" />
      <p class="gamepad-hint">
        {{ gadgetEnabled
          ? t('gamepad.enabledHint', 'USB gamepad is enabled. Connect a controller with WebHID, then press buttons on the remote host.')
          : t('gamepad.disabledHint', 'USB gamepad is off. Open Advanced settings → USB and enable WebHID gamepad support. The controlled host will re-enumerate USB.') }}
      </p>
      <p v-if="gadgetEnabled && !hidSupported" class="gamepad-hint">
        {{ t('gamepad.fallbackHint', 'WebHID is unavailable in this browser. Standard Gamepad API devices are forwarded while this page stays focused.') }}
      </p>
      <div class="gamepad-actions">
        <n-button
          size="tiny"
          type="primary"
          :disabled="!gadgetEnabled"
          :loading="requesting"
          @click="requestHIDDevice"
        >
          {{ t('gamepad.request', 'Connect WebHID controller') }}
        </n-button>
      </div>
      <ul v-if="captureActive" class="gamepad-list">
        <li v-for="device in webhidDevices" :key="device.id">
          <span>{{ device.name }}</span>
          <n-button text size="tiny" @click="forgetDevice(device.id)">{{ t('gamepad.disconnect', 'Disconnect') }}</n-button>
        </li>
        <li v-for="pad in browserPads" :key="pad.id">
          <span>{{ pad.name }}</span>
        </li>
      </ul>
      <p v-else-if="gadgetEnabled" class="gamepad-empty">
        {{ t('gamepad.empty', 'No controller is forwarding yet.') }}
      </p>
    </div>
  </n-popover>
</template>

<style scoped>
.gamepad-hint,
.gamepad-empty {
  margin: 8px 0 0;
  color: #8f99a3;
  font-size: 11px;
  line-height: 1.45;
}
.gamepad-actions { margin-top: 10px; }
.gamepad-list {
  display: grid;
  gap: 6px;
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
}
.gamepad-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
}
</style>
