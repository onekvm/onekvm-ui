<script setup lang="ts">
import { useAsyncDialog } from '@/composables/useAsyncDialog'
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { useMessage } from 'naive-ui'

import { api, type KeyboardLayout, type KeyboardShortcut, type MSDStatus, type OneKVMStatus } from '@/api/client'
import { isCloudHosted } from '@/api/service-url'
import ToolboxWorkspace from './toolbox/ToolboxWorkspace.vue'
import MacroRunBanner from './toolbox/MacroRunBanner.vue'
import { useToolbox } from '@/composables/useToolbox'
import { useAuth } from '@/composables/useAuth'
import { useDeviceInputSettings } from '@/composables/useDeviceInputSettings'
import { useKeyboardLockOverlay } from '@/composables/useKeyboardLockOverlay'
import { hasPermission } from '@/build'
import { type MouseMode } from '@/composables/useMouse'
import { parseVideoFit, parseVideoRotation, VIDEO_FIT_KEY, VIDEO_ROTATION_KEY, type VideoFit, type VideoRotation } from '@/lib/video-fit'
import {
  parseToolbarDock,
  toolbarLauncherActive,
  toolbarStageDuration,
  toolbarStageEase,
  toolbarWorkspaceClass,
  TOOLBAR_DOCK_KEY,
  type ToolbarDock,
} from '@/lib/toolbar-dock'
import {
  advancedSettingsHash,
  advancedSettingsRouteFromHash,
  isAdvancedSettingsHash,
  settingsAppActive,
} from '@/lib/settings-nav'
import { storedHideLocalCursor } from '@/lib/console-pointer'
import { consumeConsoleBack, lockConsoleHistory } from '@/lib/history-lock'
import { fullscreenTopInsetPx, isIpadLikeUserAgent, readSafeAreaTop } from '@/lib/fullscreen-inset'
import { useTransport } from '@/composables/useTransport'
import { usePictureInPicture } from '@/composables/usePictureInPicture'
import { onekvm, type BrowserAudioStats, type BrowserVideoLatencyUs } from '@/lib/onekvm'
import { effectiveVideoCodec } from '@/lib/video-transport'
import { loadLocalShortcuts, saveLocalShortcuts } from '@/lib/keyboard-shortcuts'
import { statusEvents } from '@/lib/status-events'
import { t } from '@/i18n/runtime'
import { loadExtensionShells, loadExtensionToolbars } from '@/extensions/pluginUi'
import { uiProduct } from '@/product'

import ControlToolbar from './ControlToolbar.vue'
import VirtualMediaPopover from './VirtualMediaPopover.vue'
import { emptyMediaTransfer } from '@/lib/media-transfer'
import RemoteConsole from './RemoteConsole.vue'
import VideoPerformanceOverlay from './VideoPerformanceOverlay.vue'
import AdvancedSettingsLoading from './AdvancedSettingsLoading.vue'
import VideoFallbackModal from './VideoFallbackModal.vue'
import KeyboardLockOverlay from './KeyboardLockOverlay.vue'

const AccountDrawer = defineAsyncComponent(() => import('./AccountDrawer.vue'))
const AdvancedSettingsPage = defineAsyncComponent({
  loader: () => import('./AdvancedSettingsPage.vue'),
  loadingComponent: AdvancedSettingsLoading,
  delay: 0,
})
const KeyboardShortcutDrawer = defineAsyncComponent(() => import('./KeyboardShortcutDrawer.vue'))
const VirtualKeyboard = defineAsyncComponent(() => import('./VirtualKeyboard.vue'))

const MOUSE_MODE_KEY = 'nano-kvm-mouse-mode'
const HIDE_LOCAL_CURSOR_KEY = 'onekvm-hide-local-cursor'
const RIGHT_CONTROL_AS_META_KEY = 'onekvm-right-control-as-meta'
const PERFORMANCE_OVERLAY_KEY = 'onekvm-performance-overlay'

function isAdvancedSettingsRoute(hash: string) {
  return isAdvancedSettingsHash(hash)
}

function phoneSettingsActive() {
  return settingsAppActive(window.innerWidth, window.innerHeight)
}

function advancedRouteFromHash(hash: string) {
  return advancedSettingsRouteFromHash(hash, phoneSettingsActive())
}

const { state } = useTransport()
const pictureInPicture = usePictureInPicture(() => state.value.videoMode)
const { active: pipActive, busy: pipBusy, supported: pipSupported } = pictureInPicture
const { auth, logout, refresh } = useAuth()
const toolbox = useToolbox()
const dialog = useAsyncDialog()
const message = useMessage()
const keyboardLockOverlay = useKeyboardLockOverlay()
const keyboardLockChanges = keyboardLockOverlay.changes
const canSettings = computed(() => hasPermission(auth, 'settings.view'))
const canChangeVideo = computed(() =>
  canSettings.value && (state.value.videoMode !== 'webrtc' || state.value.videoPrimary),
)
const canPower = computed(() => hasPermission(auth, 'power.control'))
const brandBadge = computed(() => uiProduct.badge(auth))
const accountOpen = ref(false)
const virtualKeyboardOpen = ref(false)
const virtualKeyboardMounted = shallowRef(false)
watch(virtualKeyboardOpen, (open) => {
  if (open) virtualKeyboardMounted.value = true
  focusConsole()
})
const shortcutDialogOpen = ref(false)
const toolbarOverlayOpen = ref(false)
const mediaPopoverOpen = shallowRef(false)
const mediaSheet = shallowRef(false)
const mediaTransfer = shallowRef(emptyMediaTransfer())
const virtualMediaPopover = useTemplateRef<InstanceType<typeof VirtualMediaPopover>>('virtualMediaPopover')
const toolbarDock = ref<ToolbarDock>(
  toolbarLauncherActive(window.innerWidth, window.innerHeight)
    ? 'float'
    : parseToolbarDock(localStorage.getItem(TOOLBAR_DOCK_KEY)).dock,
)
const toolbarStageStyle = computed(() => ({
  '--toolbar-stage-ms': `${toolbarStageDuration(toolbarDock.value)}ms`,
  '--toolbar-stage-ease': toolbarStageEase(toolbarDock.value),
}))
const advancedSettingsOpen = ref(isAdvancedSettingsRoute(window.location.hash))
const advancedSettingsRoute = ref(advancedRouteFromHash(window.location.hash))
const consoleWorkspace = ref<HTMLElement | null>(null)
const controlToolbar = ref<{ dismissOverlays: () => void } | null>(null)
const remoteConsole = ref<InstanceType<typeof RemoteConsole> | null>(null)
watch(() => toolbox.recording, activity => {
  if (!activity) return
  controlToolbar.value?.dismissOverlays()
  focusConsole()
})
const fullscreen = ref(false)
const performanceOpen = ref(localStorage.getItem(PERFORMANCE_OVERLAY_KEY) !== 'false')
const performanceOrigin = ref<{ x: number, y: number } | null>(null)
const rightControlAsMeta = ref(localStorage.getItem(RIGHT_CONTROL_AS_META_KEY) === 'true')
const userShortcuts = ref<KeyboardShortcut[]>(loadLocalShortcuts())
const deviceShortcuts = ref<KeyboardShortcut[]>([])
const keyboardLayout = ref<KeyboardLayout>('us')
const mouseMode = ref<MouseMode>(
  localStorage.getItem(MOUSE_MODE_KEY) === 'relative' ? 'relative' : 'absolute',
)
const videoFit = ref<VideoFit>(parseVideoFit(localStorage.getItem(VIDEO_FIT_KEY)))
const videoRotation = shallowRef<VideoRotation>(parseVideoRotation(localStorage.getItem(VIDEO_ROTATION_KEY)))
const {
  mouseReportRate,
  scrollInterval,
  updateMouseReportRate,
  updateScrollInterval,
} = useDeviceInputSettings({
  onError: () => message.error(t('settings.mouse.saveFailed', 'Failed to save mouse settings')),
})
const trackpadOpen = ref(false)
const hideLocalCursor = ref(storedHideLocalCursor(localStorage.getItem(HIDE_LOCAL_CURSOR_KEY)))
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
const audioBitrate = ref(0)
const websocketAudioCodec = shallowRef<'opus' | 'pcm'>('pcm')
const audioPacketsPerSecond = ref(0)
const audioJitterBufferUs = ref(0)
const switchingTransport = shallowRef<'websocket' | 'webrtc' | 'h264' | ''>('')
const fallbackActionError = shallowRef('')
let unsubscribeKeyboardLED: (() => void) | undefined
let unsubscribeStatus: (() => void) | undefined

const consoleHostname = computed(() => status.value?.network.hostname || auth.hostname)
const audioOverlayChannels = computed(() => {
  const stream = status.value?.audio.stream_channels || 0
  if (stream > 0) return stream
  if (status.value?.audio.channels === 'mono') return 1
  if (status.value?.audio.channels === 'stereo') return 2
  return 0
})
const macroInputReset = ref(false)
watch(() => status.value?.hid.macro_generation, async (generation, previous) => {
  if (generation === previous || previous === undefined) return
  macroInputReset.value = true
  await nextTick()
  macroInputReset.value = false
})
const keyboardBlocked = computed(
  () => pipActive.value || macroInputReset.value || Boolean(status.value?.hid.macro_owner) || toolbox.inputBlocked || advancedSettingsOpen.value || accountOpen.value || shortcutDialogOpen.value || toolbarOverlayOpen.value || Boolean(state.value.fallbackPrompt),
)
watch(mouseMode, (value) => localStorage.setItem(MOUSE_MODE_KEY, value))
watch(videoFit, (value) => localStorage.setItem(VIDEO_FIT_KEY, value))
watch(videoRotation, (value) => localStorage.setItem(VIDEO_ROTATION_KEY, String(value)))
watch(hideLocalCursor, (value) => localStorage.setItem(HIDE_LOCAL_CURSOR_KEY, String(value)))
watch(rightControlAsMeta, (value) => localStorage.setItem(RIGHT_CONTROL_AS_META_KEY, String(value)))
watch(performanceOpen, (value) => localStorage.setItem(PERFORMANCE_OVERLAY_KEY, String(value)))
watch(
  () => state.value.fallbackPrompt,
  () => { fallbackActionError.value = '' },
)
watch(
  () => auth.authenticated,
  (authenticated) => {
    void refreshExtensionContributions()
    if (authenticated) return
    void onekvm.close()
  },
)
watch(
  () => state.value.connection,
  (connection) => {
    if (connection !== 'failed' && connection !== 'disconnected') return
    void refresh()
  },
)

function setPerformanceOpen(open: boolean, event?: MouseEvent) {
  if (open && event) performanceOrigin.value = { x: event.clientX, y: event.clientY }
  performanceOpen.value = open
}
watch(
  consoleHostname,
  (hostname) => {
    document.title = hostname ? `${hostname} - OneKVM` : 'OneKVM'
  },
  { immediate: true },
)

async function refreshExtensionContributions() {
  if (!auth.authenticated) {
    await Promise.all([loadExtensionToolbars([]), loadExtensionShells([])])
    return
  }
  try {
    const extensions = await api.getExtensions()
    toolbox.acceptCatalog(extensions)
    await Promise.all([loadExtensionToolbars(extensions), loadExtensionShells(extensions)])
  } catch {
    await Promise.all([loadExtensionToolbars([]), loadExtensionShells([])])
  }
}

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

function setAudioStats(stats: BrowserAudioStats) {
  audioBitrate.value = stats.bitrateKbps
  if (stats.codec) websocketAudioCodec.value = stats.codec
  audioPacketsPerSecond.value = stats.packetsPerSecond
  audioJitterBufferUs.value = stats.jitterBufferUs
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

async function switchToH264() {
  if (switchingTransport.value) return
  switchingTransport.value = 'h264'
  fallbackActionError.value = ''
  try {
    await onekvm.switchToH264Fallback()
  } catch {
    fallbackActionError.value = t(
      'screen.h264FallbackFailed',
      'Could not switch to H.264. Please try again.',
    )
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
  applyFullscreenInset()
  remoteConsole.value?.focusVideo()
}

function applyFullscreenInset() {
  const workspace = consoleWorkspace.value
  if (!workspace) return
  const inset = fullscreenTopInsetPx({
    fullscreen: document.fullscreenElement === workspace,
    safeTop: readSafeAreaTop(),
    visualOffsetTop: window.visualViewport?.offsetTop ?? 0,
    ipad: isIpadLikeUserAgent(navigator.userAgent, navigator.platform, navigator.maxTouchPoints),
  })
  workspace.style.setProperty('--onekvm-fullscreen-top', `${inset}px`)
}

function syncFullscreen() {
  fullscreen.value = document.fullscreenElement === consoleWorkspace.value
  if (!fullscreen.value) browserKeyboard()?.unlock()
  applyFullscreenInset()
}

function onPopState() {
  const action = consumeConsoleBack(
    isAdvancedSettingsRoute(window.location.hash),
    {
      trackpad: trackpadOpen.value,
      account: accountOpen.value,
      keyboard: virtualKeyboardOpen.value,
      shortcuts: shortcutDialogOpen.value,
      toolbar: toolbarOverlayOpen.value,
    },
  )
  if (action.type === 'navigate-settings') return
  if (action.type === 'close') {
    if (action.overlay === 'trackpad') trackpadOpen.value = false
    else if (action.overlay === 'keyboard') virtualKeyboardOpen.value = false
    else if (action.overlay === 'account') accountOpen.value = false
    else if (action.overlay === 'shortcuts') shortcutDialogOpen.value = false
    else controlToolbar.value?.dismissOverlays()
  }
  lockConsoleHistory()
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
  }
}

function openAdvancedSettings() {
  if (advancedSettingsOpen.value || !canSettings.value) return
  window.location.hash = advancedSettingsHash(phoneSettingsActive() ? '' : 'system')
}

function openMedia(sheet: boolean) {
  mediaSheet.value = sheet
  virtualMediaPopover.value?.updateShow(true)
}

function confirmAdvancedSettings() {
  if (advancedSettingsOpen.value || !canSettings.value) return
  dialog.warning({
    title: t('settings.advancedSettings.confirmTitle', 'Open advanced settings?'),
    content: t(
      'settings.advancedSettings.sessionWarning',
      'Opening advanced settings will interrupt the current remote-control session. It will reconnect after you return.',
    ),
    positiveText: t('settings.advancedSettings.continue', 'Continue'),
    negativeText: t('common.cancel', 'Cancel'),
    onPositiveClick: () => openAdvancedSettings(),
  })
}

function closeAdvancedSettings() {
  accountOpen.value = false
  virtualKeyboardOpen.value = false
  shortcutDialogOpen.value = false
  toolbarOverlayOpen.value = false
  advancedSettingsOpen.value = false
  advancedSettingsRoute.value = phoneSettingsActive() ? '' : 'system'
  const url = new URL(window.location.href)
  url.hash = ''
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`)
  void refreshDeviceShortcuts()
}

function focusConsole() {
  void nextTick(() => remoteConsole.value?.focusVideo())
}

async function togglePictureInPicture() {
  try {
    await pictureInPicture.toggle()
    controlToolbar.value?.dismissOverlays()
  } catch {
    message.error(t('screen.pictureInPictureFailed', 'Could not open picture-in-picture. Make sure the stream is playing.'))
  }
}

function navigateAdvancedSettings(route: string) {
  window.location.hash = advancedSettingsHash(route)
}

watch(advancedSettingsOpen, (open) => {
  if (open) {
    toolbox.closeAll()
    return
  }
  void nextTick(applyFullscreenInset)
})

onMounted(() => {
	unsubscribeStatus = statusEvents.subscribe(
		(next) => {
			status.value = { ...next, hid: keyboardLockOverlay.applyStatus(next.hid) }
			serverUnavailable.value = false
		},
		() => {
			serverUnavailable.value = true
			void refresh()
		},
	)
	unsubscribeKeyboardLED = onekvm.subscribeKeyboardLED((led) => {
		const locks = keyboardLockOverlay.applyLED(led)
		if (!status.value?.hid) return
		status.value = {
			...status.value,
			hid: {
				...status.value.hid,
				...locks,
			},
		}
	})
	void refreshMSDStatus()
  void refreshDeviceShortcuts()
  void refreshExtensionContributions()
  window.addEventListener('pagehide', closeSession)
  window.addEventListener('hashchange', syncRoute)
  window.addEventListener('popstate', onPopState)
  document.addEventListener('fullscreenchange', syncFullscreen)
  window.visualViewport?.addEventListener('resize', applyFullscreenInset)
  window.visualViewport?.addEventListener('scroll', applyFullscreenInset)
  lockConsoleHistory()
  syncRoute()
  applyFullscreenInset()
})

onBeforeUnmount(() => {
	document.title = 'OneKVM'
	unsubscribeStatus?.()
	unsubscribeKeyboardLED?.()
  window.removeEventListener('pagehide', closeSession)
  window.removeEventListener('hashchange', syncRoute)
  window.removeEventListener('popstate', onPopState)
  document.removeEventListener('fullscreenchange', syncFullscreen)
  window.visualViewport?.removeEventListener('resize', applyFullscreenInset)
  window.visualViewport?.removeEventListener('scroll', applyFullscreenInset)
  browserKeyboard()?.unlock()
  closeSession()
})
</script>

<template>
  <div class="app-shell">
    <KeyboardLockOverlay :changes="keyboardLockChanges" />
    <VirtualMediaPopover
      ref="virtualMediaPopover"
      :console-active="!advancedSettingsOpen"
      :sheet="mediaSheet"
      @status="msdStatus = $event"
      @upload-state="mediaTransfer = $event"
      @update:show="mediaPopoverOpen = $event"
    />
    <Transition name="onekvm-page-loading" @after-leave="focusConsole">
      <div v-if="advancedSettingsOpen" class="advanced-settings-layer">
        <AdvancedSettingsPage
          :status="status"
          :route="advancedSettingsRoute"
          :can-change-video="canChangeVideo"
          :video-session-id="state.webRTCSessionId"
          :media-transfer="mediaTransfer"
          @restore-media-transfer="virtualMediaPopover?.restoreUploadDialog()"
          @close="closeAdvancedSettings"
          @navigate="navigateAdvancedSettings"
        />
      </div>
    </Transition>

    <div
      v-if="!advancedSettingsOpen"
      ref="consoleWorkspace"
      class="console-workspace"
      :class="toolbarWorkspaceClass(toolbarDock)"
      :style="toolbarStageStyle"
      @pointerdown.capture="onekvm.unlockAudio()"
    >
        <ControlToolbar
          ref="controlToolbar"
          :state="state"
          :pip-active="pipActive"
          :pip-busy="pipBusy"
          :pip-supported="pipSupported"
          :can-settings="canSettings"
          :can-change-video="canChangeVideo"
          :can-power="canPower"
          :brand-badge="brandBadge"
          :username="isCloudHosted() ? t('auth.cloudIdentity', 'Cloud account') : auth.username"
          :mouse-mode="mouseMode"
          :scroll-interval="scrollInterval"
          :mouse-report-rate="mouseReportRate"
          :hide-local-cursor="hideLocalCursor"
          :trackpad="trackpadOpen"
          :video-fit="videoFit"
          :video-rotation="videoRotation"
          :status="status"
          :msd-status="msdStatus"
          :media-transfer="mediaTransfer"
          :media-popover-open="mediaPopoverOpen"
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
          :conceal-launcher="virtualKeyboardOpen"
          @settings="confirmAdvancedSettings"
          @account="accountOpen = true"
          @logout="logout"
          @keyboard="virtualKeyboardOpen = true"
          @media="openMedia"
          @restore-media-transfer="virtualMediaPopover?.restoreUploadDialog()"
          @edit-user-shortcuts="shortcutDialogOpen = true"
          @fullscreen="toggleFullscreen"
          @picture-in-picture="togglePictureInPicture"
          @update:performance-open="setPerformanceOpen"
          @update:right-control-as-meta="rightControlAsMeta = $event"
          @overlay="toolbarOverlayOpen = $event"
          @dock="toolbarDock = $event"
          @update:video-fit="videoFit = $event"
          @update:video-rotation="videoRotation = $event"
          @update:mouse-mode="mouseMode = $event"
          @update:scroll-interval="updateScrollInterval"
          @update:mouse-report-rate="updateMouseReportRate"
          @update:hide-local-cursor="hideLocalCursor = $event"
          @update:trackpad="trackpadOpen = $event"
        />

        <MacroRunBanner :owner="status?.hid.macro_owner" :recording="toolbox.recording" />
    <ToolboxWorkspace />

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
          :hide-local-cursor="hideLocalCursor"
          :video-fit="videoFit"
          :video-rotation="videoRotation"
          :keyboard-blocked="keyboardBlocked"
          :input-suspended="pipActive"
          :right-control-as-meta="rightControlAsMeta"
          :trackpad="trackpadOpen"
          :usb-connected="Boolean(status?.hid.connected)"
          @metadata="setMetadata"
          @canvas-size="setCanvasSize"
          @fps="videoFps = $event"
          @bitrate="videoBitrate = $event"
          @browser-latency="setBrowserLatency"
          @audio-stats="setAudioStats"
          @update:trackpad="trackpadOpen = $event"
        />

        <VideoPerformanceOverlay
          :visible="performanceOpen"
          :origin-x="performanceOrigin?.x"
          :origin-y="performanceOrigin?.y"
          :canvas-width="canvasWidth"
          :canvas-height="canvasHeight"
          :video-fps="videoFps"
          :video-bitrate="videoBitrate"
          :target-fps="status?.video.fps || 60"
          :codec="status ? effectiveVideoCodec(status.video).toUpperCase() : ''"
          :transport="state.videoMode"
          :input-width="status?.video.input_width ?? 0"
          :input-height="status?.video.input_height ?? 0"
          :capture-latency-us="status?.video.capture_latency_us ?? 0"
          :encode-latency-us="status?.video.encode_latency_us ?? 0"
          :ice-rtt-us="iceRttUs"
          :jitter-buffer-us="jitterBufferUs"
          :decode-us="decodeUs"
          :present-us="presentUs"
          :audio-enabled="status?.audio.enabled ?? false"
          :audio-encoder="state.videoMode === 'websocket' ? websocketAudioCodec : status?.audio.encoder ?? ''"
          :audio-quality="status?.audio.quality ?? ''"
          :audio-sample-rate="status?.audio.sample_rate ?? 0"
          :audio-channels="audioOverlayChannels"
          :audio-fps="audioPacketsPerSecond || status?.audio.actual_fps || 0"
          :audio-bitrate="audioBitrate || status?.audio.bitrate_kbps || 0"
          :audio-capture-latency-us="status?.audio.capture_latency_us ?? 0"
          :audio-encode-latency-us="state.videoMode === 'websocket' && websocketAudioCodec === 'pcm' ? 0 : status?.audio.encode_latency_us ?? 0"
          :audio-jitter-buffer-us="audioJitterBufferUs"
          @close="performanceOpen = false"
        />

        <VideoFallbackModal
          :show="Boolean(state.fallbackPrompt) && auth.authenticated"
          :prompt="state.fallbackPrompt"
          :loading="switchingTransport"
          :error="fallbackActionError"
          @retry-webrtc="retryWebRTC"
          @use-websocket="useWebSocketFallback"
          @switch-h264="switchToH264"
        />

        <AccountDrawer v-model:show="accountOpen" />
        <VirtualKeyboard v-if="virtualKeyboardMounted" v-model:show="virtualKeyboardOpen" :layout="keyboardLayout" :blocked="keyboardBlocked" @focus-console="focusConsole" />
        <KeyboardShortcutDrawer
          v-model:show="shortcutDialogOpen"
          :shortcuts="userShortcuts"
          @save="updateUserShortcuts"
        />
    </div>
  </div>
</template>
