<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { WifiOff } from '@lucide/vue'

import { api, type KeyboardLayout, type KeyboardShortcut, type MSDStatus, type OneKVMStatus } from '@/api/client'
import { useAuth } from '@/composables/useAuth'
import { hasPermission } from '@/build'
import { type MouseMode } from '@/composables/useMouse'
import { parseVideoFit, VIDEO_FIT_KEY, type VideoFit } from '@/lib/video-fit'
import { useTransport } from '@/composables/useTransport'
import { onekvm, type BrowserVideoLatencyUs } from '@/lib/onekvm'
import { loadLocalShortcuts, saveLocalShortcuts } from '@/lib/keyboard-shortcuts'
import { statusEvents } from '@/lib/status-events'
import { t } from '@/i18n/runtime'
import { uiProduct } from '@/product'

import ControlToolbar from './ControlToolbar.vue'
import RemoteConsole from './RemoteConsole.vue'
import VideoPerformanceOverlay from './VideoPerformanceOverlay.vue'

const AccountDrawer = defineAsyncComponent(() => import('./AccountDrawer.vue'))
const AdvancedSettingsPage = defineAsyncComponent(() => import('./AdvancedSettingsPage.vue'))
const KeyboardShortcutDrawer = defineAsyncComponent(() => import('./KeyboardShortcutDrawer.vue'))
const SettingsDrawer = defineAsyncComponent(() => import('./SettingsDrawer.vue'))
const VirtualKeyboard = defineAsyncComponent(() => import('./VirtualKeyboard.vue'))

const MOUSE_MODE_KEY = 'nano-kvm-mouse-mode'
const SCROLL_INTERVAL_KEY = 'nanokvm-kvm-mouse-scroll-interval'
const MOUSE_REPORT_RATE_KEY = 'onekvm-mouse-report-rate'
const RIGHT_CONTROL_AS_META_KEY = 'onekvm-right-control-as-meta'
const PERFORMANCE_OVERLAY_KEY = 'onekvm-performance-overlay'
const ADVANCED_SETTINGS_ROUTE = '#/settings/advanced'

function isAdvancedSettingsRoute(hash: string) {
  return hash === ADVANCED_SETTINGS_ROUTE || hash.startsWith(`${ADVANCED_SETTINGS_ROUTE}/`)
}

function advancedRouteFromHash(hash: string) {
  return isAdvancedSettingsRoute(hash)
    ? hash.slice(ADVANCED_SETTINGS_ROUTE.length).replace(/^\//, '') || 'system'
    : 'system'
}

const { state } = useTransport()
const { auth, logout } = useAuth()
const canSettings = computed(() => hasPermission(auth, 'settings.view'))
const canPower = computed(() => hasPermission(auth, 'power.control'))
const brandBadge = computed(() => uiProduct.badge(auth))
const settingsOpen = ref(false)
const accountOpen = ref(false)
const virtualKeyboardOpen = ref(false)
const shortcutDialogOpen = ref(false)
const toolbarOverlayOpen = ref(false)
const advancedSettingsOpen = ref(isAdvancedSettingsRoute(window.location.hash))
const advancedSettingsRoute = ref(advancedRouteFromHash(window.location.hash))
const consoleWorkspace = ref<HTMLElement | null>(null)
const remoteConsole = ref<InstanceType<typeof RemoteConsole> | null>(null)
const fullscreen = ref(false)
const performanceOpen = ref(localStorage.getItem(PERFORMANCE_OVERLAY_KEY) !== 'false')
const rightControlAsMeta = ref(localStorage.getItem(RIGHT_CONTROL_AS_META_KEY) === 'true')
const userShortcuts = ref<KeyboardShortcut[]>(loadLocalShortcuts())
const deviceShortcuts = ref<KeyboardShortcut[]>([])
const keyboardLayout = ref<KeyboardLayout>('us')
const mouseMode = ref<MouseMode>(
  localStorage.getItem(MOUSE_MODE_KEY) === 'relative' ? 'relative' : 'absolute',
)
const videoFit = ref<VideoFit>(parseVideoFit(localStorage.getItem(VIDEO_FIT_KEY)))
const scrollInterval = ref(Number(localStorage.getItem(SCROLL_INTERVAL_KEY)) || 0)
const storedMouseReportRate = Number(localStorage.getItem(MOUSE_REPORT_RATE_KEY))
const mouseReportRate = ref(
  Number.isFinite(storedMouseReportRate) && storedMouseReportRate >= 1 && storedMouseReportRate <= 1000
    ? Math.round(storedMouseReportRate)
    : 60,
)
const status = ref<OneKVMStatus | null>(null)
const msdStatus = ref<MSDStatus | null>(null)
const serverUnavailable = ref(false)
const videoWidth = ref(0)
const videoHeight = ref(0)
const canvasWidth = ref(0)
const canvasHeight = ref(0)
const videoFps = ref(0)
const videoBitrate = ref(0)
const iceRttUs = ref(0)
const jitterBufferUs = ref(0)
const decodeUs = ref(0)
const presentUs = ref(0)
const switchingTransport = ref<'websocket' | 'webrtc' | ''>('')
let unsubscribeKeyboardLED: (() => void) | undefined
let unsubscribeStatus: (() => void) | undefined

const consoleHostname = computed(() => status.value?.network.hostname || auth.hostname)
const keyboardBlocked = computed(
  () => advancedSettingsOpen.value || accountOpen.value || settingsOpen.value || virtualKeyboardOpen.value || shortcutDialogOpen.value || toolbarOverlayOpen.value || state.value.websocketFallbackOffered,
)
watch(mouseMode, (value) => localStorage.setItem(MOUSE_MODE_KEY, value))
watch(videoFit, (value) => localStorage.setItem(VIDEO_FIT_KEY, value))
watch(scrollInterval, (value) => localStorage.setItem(SCROLL_INTERVAL_KEY, String(value)))
watch(mouseReportRate, (value) => localStorage.setItem(MOUSE_REPORT_RATE_KEY, String(value)))
watch(rightControlAsMeta, (value) => localStorage.setItem(RIGHT_CONTROL_AS_META_KEY, String(value)))
watch(performanceOpen, (value) => localStorage.setItem(PERFORMANCE_OVERLAY_KEY, String(value)))
watch(
  consoleHostname,
  (hostname) => {
    document.title = hostname ? `${hostname} - OneKVM` : 'OneKVM'
  },
  { immediate: true },
)

async function refreshMSDStatus() {
  try {
    msdStatus.value = await api.getMSDStatus()
  } catch {
    msdStatus.value = null
  }
}

async function refreshDeviceShortcuts() {
  const keyboard = await api.getKeyboardConfig().catch(() => null)
	if (keyboard) {
		deviceShortcuts.value = keyboard.shortcuts || []
		keyboardLayout.value = keyboard.layout || 'us'
	}
}

function updateUserShortcuts(shortcuts: KeyboardShortcut[]) {
  userShortcuts.value = shortcuts
  saveLocalShortcuts(shortcuts)
}

function closeSession() {
  void onekvm.close()
}

function setMetadata(width: number, height: number) {
  videoWidth.value = width
  videoHeight.value = height
}

function setCanvasSize(width: number, height: number) {
  canvasWidth.value = width
  canvasHeight.value = height
}

function setBrowserLatency(latency: BrowserVideoLatencyUs & { presentUs: number }) {
  iceRttUs.value = latency.iceRttUs
  jitterBufferUs.value = latency.jitterBufferUs
  decodeUs.value = latency.decodeUs
  presentUs.value = latency.presentUs
}

async function useWebSocketFallback() {
  if (switchingTransport.value) return
  switchingTransport.value = 'websocket'
  try {
    await onekvm.connectWebSocketFallback()
  } catch {
    // The transport state opens the ordinary connection error modal.
  } finally {
    switchingTransport.value = ''
  }
}

async function retryWebRTC() {
  if (switchingTransport.value) return
  switchingTransport.value = 'webrtc'
  try {
    await onekvm.retryWebRTC()
  } catch {
    // A failed retry offers the fallback again when it remains available.
  } finally {
    switchingTransport.value = ''
  }
}

type KeyboardLock = {
  lock: (keyCodes?: string[]) => Promise<void>
  unlock: () => void
}

function browserKeyboard() {
  return (navigator as Navigator & { keyboard?: KeyboardLock }).keyboard
}

async function toggleFullscreen() {
  if (document.fullscreenElement) {
    browserKeyboard()?.unlock()
    await document.exitFullscreen().catch(() => undefined)
    return
  }

  if (!consoleWorkspace.value || !document.fullscreenEnabled) return
  const fullscreenRequest = consoleWorkspace.value.requestFullscreen({ navigationUI: 'hide' })
  const keyboardLockRequest = browserKeyboard()?.lock().catch(() => undefined)
  try {
    await fullscreenRequest
  } catch {
    return
  }
  await keyboardLockRequest
  await nextTick()
  remoteConsole.value?.focusVideo()
}

function syncFullscreen() {
  fullscreen.value = document.fullscreenElement === consoleWorkspace.value
  if (!fullscreen.value) browserKeyboard()?.unlock()
}

function syncRoute() {
  const advanced = isAdvancedSettingsRoute(window.location.hash)
  if (advanced && !canSettings.value) {
    window.location.hash = ''
    advancedSettingsOpen.value = false
    return
  }
  if (advanced && !advancedSettingsOpen.value) closeSession()
  advancedSettingsOpen.value = advanced
  if (advanced) {
    advancedSettingsRoute.value = advancedRouteFromHash(window.location.hash)
    settingsOpen.value = false
  }
}

function openAdvancedSettings() {
  if (advancedSettingsOpen.value || !canSettings.value) return
  window.location.hash = '/settings/advanced/system'
}

function closeAdvancedSettings() {
  settingsOpen.value = false
  accountOpen.value = false
  virtualKeyboardOpen.value = false
  shortcutDialogOpen.value = false
  toolbarOverlayOpen.value = false
  advancedSettingsOpen.value = false
  advancedSettingsRoute.value = 'system'
  const url = new URL(window.location.href)
  url.hash = ''
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`)
  void refreshDeviceShortcuts()
  void nextTick(() => remoteConsole.value?.focusVideo())
}

function navigateAdvancedSettings(route: string) {
  window.location.hash = `/settings/advanced/${route}`
}

onMounted(() => {
	unsubscribeStatus = statusEvents.subscribe(
		(next) => {
			status.value = next
			serverUnavailable.value = false
		},
		() => { serverUnavailable.value = true },
	)
	unsubscribeKeyboardLED = onekvm.subscribeKeyboardLED((led) => {
		if (!status.value?.hid || !led.known) return
		status.value = {
			...status.value,
			hid: {
				...status.value.hid,
				num_lock: led.numLock,
				caps_lock: led.capsLock,
				scroll_lock: led.scrollLock,
			},
		}
	})
	void refreshMSDStatus()
  void refreshDeviceShortcuts()
  window.addEventListener('pagehide', closeSession)
  window.addEventListener('hashchange', syncRoute)
  document.addEventListener('fullscreenchange', syncFullscreen)
  syncRoute()
})

onBeforeUnmount(() => {
	document.title = 'OneKVM'
	unsubscribeStatus?.()
	unsubscribeKeyboardLED?.()
  window.removeEventListener('pagehide', closeSession)
  window.removeEventListener('hashchange', syncRoute)
  document.removeEventListener('fullscreenchange', syncFullscreen)
  browserKeyboard()?.unlock()
  closeSession()
})
</script>

<template>
  <div class="app-shell">
    <AdvancedSettingsPage
      v-if="advancedSettingsOpen"
      :status="status"
      :route="advancedSettingsRoute"
      @close="closeAdvancedSettings"
      @navigate="navigateAdvancedSettings"
    />

    <div v-else ref="consoleWorkspace" class="console-workspace">
        <ControlToolbar
          :state="state"
          :can-settings="canSettings"
          :can-power="canPower"
          :brand-badge="brandBadge"
          :username="auth.username"
          :mouse-mode="mouseMode"
          :scroll-interval="scrollInterval"
          :mouse-report-rate="mouseReportRate"
          :video-fit="videoFit"
          :status="status"
          :msd-status="msdStatus"
          :canvas-width="canvasWidth"
          :canvas-height="canvasHeight"
          :video-fps="videoFps"
          :video-bitrate="videoBitrate"
          :fullscreen="fullscreen"
          :performance-open="performanceOpen"
          :right-control-as-meta="rightControlAsMeta"
          :keyboard-layout="keyboardLayout"
          :user-shortcuts="userShortcuts"
          :device-shortcuts="deviceShortcuts"
          @settings="settingsOpen = true"
          @account="accountOpen = true"
          @logout="logout"
          @keyboard="virtualKeyboardOpen = true"
          @media-status="msdStatus = $event"
          @edit-user-shortcuts="shortcutDialogOpen = true"
          @fullscreen="toggleFullscreen"
          @update:performance-open="performanceOpen = $event"
          @update:right-control-as-meta="rightControlAsMeta = $event"
          @overlay="toolbarOverlayOpen = $event"
          @update:video-fit="videoFit = $event"
        />

        <RemoteConsole
          ref="remoteConsole"
          :state="state"
          :signal-connected="status?.video.hdmi_connected ?? null"
          :hdmi-error="status?.video.hdmi_error ?? ''"
          :input-width="status?.video.input_width ?? 0"
          :input-height="status?.video.input_height ?? 0"
          :server-unavailable="serverUnavailable"
          :mouse-mode="mouseMode"
          :scroll-interval="scrollInterval"
          :mouse-report-rate="mouseReportRate"
          :video-fit="videoFit"
          :keyboard-blocked="keyboardBlocked"
          :right-control-as-meta="rightControlAsMeta"
          @metadata="setMetadata"
          @canvas-size="setCanvasSize"
          @fps="videoFps = $event"
          @bitrate="videoBitrate = $event"
          @browser-latency="setBrowserLatency"
        />

        <VideoPerformanceOverlay
          v-show="performanceOpen"
          :visible="performanceOpen"
          :canvas-width="canvasWidth"
          :canvas-height="canvasHeight"
          :video-fps="videoFps"
          :video-bitrate="videoBitrate"
          :target-fps="status?.video.fps || 60"
          :codec="status?.video.codec?.toUpperCase() || ''"
          :transport="state.videoMode"
          :input-width="status?.video.input_width ?? 0"
          :input-height="status?.video.input_height ?? 0"
          :capture-latency-us="status?.video.capture_latency_us ?? 0"
          :encode-latency-us="status?.video.encode_latency_us ?? 0"
          :ice-rtt-us="iceRttUs"
          :jitter-buffer-us="jitterBufferUs"
          :decode-us="decodeUs"
          :present-us="presentUs"
          @close="performanceOpen = false"
        />

        <n-modal
          :show="state.websocketFallbackOffered"
          to=".console-workspace"
          preset="card"
          class="connection-problem-modal"
          :title="t('screen.webrtcUnavailableTitle', 'WebRTC connection unavailable')"
          :closable="false"
          :mask-closable="false"
          :close-on-esc="false"
          :auto-focus="false"
        >
          <div class="connection-problem-content" aria-live="assertive">
            <WifiOff :size="42" />
            <p>{{ t('screen.webrtcUnavailableDetail', 'You can try a WebSocket connection instead. Video and control latency may be higher.') }}</p>
            <code v-if="state.error">{{ state.error }}</code>
          </div>
          <template #footer>
            <div class="connection-problem-actions">
              <n-button
                :disabled="Boolean(switchingTransport)"
                :loading="switchingTransport === 'webrtc'"
                @click="retryWebRTC"
              >
                {{ t('screen.retryWebRTC', 'Retry WebRTC') }}
              </n-button>
              <n-button
                type="primary"
                :disabled="Boolean(switchingTransport)"
                :loading="switchingTransport === 'websocket'"
                @click="useWebSocketFallback"
              >
                {{ t('screen.tryWebSocket', 'Try WebSocket') }}
              </n-button>
            </div>
          </template>
        </n-modal>

        <SettingsDrawer
          v-if="canSettings"
          v-model:show="settingsOpen"
          v-model:mouse-mode="mouseMode"
          v-model:scroll-interval="scrollInterval"
          v-model:mouse-report-rate="mouseReportRate"
          @advanced="openAdvancedSettings"
        />
        <AccountDrawer v-if="accountOpen" v-model:show="accountOpen" />
        <VirtualKeyboard v-if="virtualKeyboardOpen" v-model:show="virtualKeyboardOpen" :layout="keyboardLayout" />
        <KeyboardShortcutDrawer
          v-if="shortcutDialogOpen"
          v-model:show="shortcutDialogOpen"
          :shortcuts="userShortcuts"
          @save="updateUserShortcuts"
        />
    </div>
  </div>
</template>
