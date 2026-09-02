<script setup lang="ts">
import { computed, h, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  Check,
  CircleUserRound,
  Command,
  Disc3,
  GripHorizontal,
  GripVertical,
  Gamepad2,
  Keyboard,
  Languages,
  LogOut,
  Activity,
  Maximize,
  Minimize,
  Monitor,
  MousePointer2,
  Pencil,
  Power,
  Settings,
  TextCursorInput,
  Upload,
  Server,
  UserRound,
  Volume2,
} from '@lucide/vue'
import { NIcon, useDialog, useMessage, type DialogReactive, type DropdownOption } from 'naive-ui'

import { api, type KeyboardLayout, type KeyboardShortcut, type MSDStatus, type OneKVMStatus } from '@/api/client'
import { type MouseMode } from '@/composables/useMouse'
import type { VideoFit } from '@/lib/video-fit'
import { currentLanguage, languageOptions, setLanguage, t } from '@/i18n/runtime'
import { toolbarItemsFor } from '@/extensions/pluginUi'
import { hidIndicatorState } from '@/lib/hid-status'
import { onekvm, type InputActivity, type TransportState } from '@/lib/onekvm'
import { sendShortcut, shortcutChordLabel } from '@/lib/keyboard-shortcuts'
import {
  clampToolbarPosition,
  parseToolbarDock,
  previewToolbarSnap,
  snapToolbarDock,
  toolbarHandleVisible as handleVisibleForDock,
  toolbarMenuPlacement,
  TOOLBAR_DOCK_KEY,
  TOOLBAR_DRAG_THRESHOLD_PX,
  type ToolbarDock,
  type ToolbarDockState,
  type ToolbarSnapPreview,
} from '@/lib/toolbar-dock'

import DisplaySettingsPopover from './DisplaySettingsPopover.vue'
import KeyboardControlPopover from './KeyboardControlPopover.vue'
import GamepadPopover from './GamepadPopover.vue'
import MouseSettingsPopover from './MouseSettingsPopover.vue'
import PowerControlPopover from './PowerControlPopover.vue'
import USBAudioPopover from './USBAudioPopover.vue'
import VirtualMediaPopover from './VirtualMediaPopover.vue'

const props = defineProps<{
  state: TransportState
  canSettings: boolean
  canPower: boolean
  brandBadge: string
  username: string
  mouseMode: MouseMode
  scrollInterval: number
  mouseReportRate: number
  videoFit: VideoFit
  status: OneKVMStatus | null
  msdStatus: MSDStatus | null
  canvasWidth: number
  canvasHeight: number
  videoFps: number
  videoBitrate: number
  fullscreen: boolean
  performanceOpen: boolean
  rightControlAsMeta: boolean
  keyboardLayout: KeyboardLayout
  userShortcuts: KeyboardShortcut[]
  deviceShortcuts: KeyboardShortcut[]
}>()

const emit = defineEmits<{
  settings: []
  account: []
  logout: []
  keyboard: []
  'media-status': [status: MSDStatus]
  fullscreen: []
  'update:performanceOpen': [open: boolean, event?: MouseEvent]
  'update:rightControlAsMeta': [enabled: boolean]
  'edit-user-shortcuts': []
  overlay: [visible: boolean]
  dock: [dock: ToolbarDock]
  'update:mouseMode': [mode: MouseMode]
  'update:scrollInterval': [interval: number]
  'update:mouseReportRate': [rate: number]
  'update:videoFit': [fit: VideoFit]
}>()

type DeviceState = 'ready' | 'waiting' | 'error'
type MenuName = 'display' | 'mouse' | 'keyboard' | 'gamepad' | 'power' | 'audio' | 'media' | 'language' | 'account'
type MediaUploadState = {
  minimized: boolean
  uploading: boolean
  name: string
  progress: number
  transferred: number
  total: number
  speed: number
  remainingSeconds: number
}

const dialog = useDialog()
const message = useMessage()
type PowerAction = 'on' | 'off' | 'reset'
const powerAction = ref<PowerAction | null>(null)
const openMenu = ref<MenuName | null>(null)
const mouseLed = ref<HTMLElement | null>(null)
const keyboardLed = ref<HTMLElement | null>(null)
const gamepadLed = ref<HTMLElement | null>(null)
const virtualMediaPopover = ref<{ restoreUploadDialog: () => void } | null>(null)
const toolbarEl = ref<HTMLElement | null>(null)
const toolbarDock = ref<ToolbarDockState>(parseToolbarDock(localStorage.getItem(TOOLBAR_DOCK_KEY)))
const toolbarDragging = ref(false)
const toolbarSnapHint = ref<ToolbarSnapPreview>(null)
let toolbarPointerId: number | null = null
let toolbarGrab = { x: 0, y: 0 }
let toolbarDragOffset = { x: 0, y: 0 }
let toolbarDragMoved = false
let toolbarDragReady = false
let toolbarDragPoint = { x: 0, y: 0 }

const toolbarVertical = computed(
  () => !toolbarDragging.value && (toolbarDock.value.dock === 'left' || toolbarDock.value.dock === 'right'),
)
const toolbarCompact = computed(
  () => toolbarDragging.value || toolbarDock.value.dock === 'float' || toolbarVertical.value,
)
const toolbarHandleVisible = computed(() =>
  handleVisibleForDock(toolbarDock.value.dock, toolbarDragging.value),
)
const menuPlacement = computed(() => toolbarMenuPlacement(toolbarDock.value.dock))
const toolbarClass = computed(() => ({
  'is-floating': toolbarDock.value.dock === 'float' || toolbarDragging.value,
  'is-docked-bottom': toolbarDock.value.dock === 'bottom' && !toolbarDragging.value,
  'is-docked-left': toolbarDock.value.dock === 'left' && !toolbarDragging.value,
  'is-docked-right': toolbarDock.value.dock === 'right' && !toolbarDragging.value,
  'is-vertical': toolbarVertical.value,
  'is-compact': toolbarCompact.value,
  'is-dragging': toolbarDragging.value,
}))
const toolbarStyle = computed(() => {
  if (!toolbarDragging.value && toolbarDock.value.dock !== 'float') return undefined
  return {
    left: `${toolbarDock.value.x}px`,
    top: `${toolbarDock.value.y}px`,
  }
})

function persistToolbarDock() {
  localStorage.setItem(TOOLBAR_DOCK_KEY, JSON.stringify(toolbarDock.value))
  emit('dock', toolbarDock.value.dock)
}

function setToolbarDock(next: ToolbarDockState) {
  toolbarDock.value = next
  persistToolbarDock()
}

function updateToolbarSnapHint(
  x: number,
  y: number,
  width: number,
  height: number,
  pointerX: number,
  pointerY: number,
) {
  toolbarSnapHint.value = previewToolbarSnap(
    x,
    y,
    width,
    height,
    window.innerWidth,
    window.innerHeight,
    pointerX,
    pointerY,
  )
}

function applyToolbarDragPosition(clientX: number, clientY: number) {
  const toolbar = toolbarEl.value
  if (!toolbar) return
  const rect = toolbar.getBoundingClientRect()
  const next = clampToolbarPosition(
    clientX - toolbarDragOffset.x,
    clientY - toolbarDragOffset.y,
    rect.width,
    rect.height,
    window.innerWidth,
    window.innerHeight,
  )
  toolbarDock.value = { dock: 'float', ...next }
  updateToolbarSnapHint(next.x, next.y, rect.width, rect.height, clientX, clientY)
}

function captureToolbarDragOffset(clientX: number, clientY: number) {
  const toolbar = toolbarEl.value
  if (!toolbar) return
  const toolbarRect = toolbar.getBoundingClientRect()
  toolbarDragOffset = {
    x: Math.min(toolbarRect.width, Math.max(0, clientX - toolbarRect.left)),
    y: Math.min(toolbarRect.height, Math.max(0, clientY - toolbarRect.top)),
  }
  applyToolbarDragPosition(clientX, clientY)
}

function stopToolbarWindowDrag() {
  window.removeEventListener('pointermove', onToolbarWindowPointerMove)
  window.removeEventListener('pointerup', onToolbarWindowPointerUp)
  window.removeEventListener('pointercancel', onToolbarWindowPointerUp)
}

function onToolbarWindowPointerMove(event: PointerEvent) {
  if (event.pointerId !== toolbarPointerId) return
  toolbarDragPoint = { x: event.clientX, y: event.clientY }
  if (!toolbarDragMoved) {
    const moveX = event.clientX - toolbarGrab.x
    const moveY = event.clientY - toolbarGrab.y
    if (Math.hypot(moveX, moveY) < TOOLBAR_DRAG_THRESHOLD_PX) return
    toolbarDragMoved = true
    toolbarDragReady = false
    toolbarDragging.value = true
    toolbarDock.value = { dock: 'float', x: toolbarDock.value.x, y: toolbarDock.value.y }
    emit('dock', 'float')
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (toolbarPointerId === null) return
        captureToolbarDragOffset(toolbarDragPoint.x, toolbarDragPoint.y)
        toolbarDragReady = true
      })
    })
    return
  }
  if (!toolbarDragReady) return
  applyToolbarDragPosition(event.clientX, event.clientY)
}

function onToolbarWindowPointerUp(event: PointerEvent) {
  if (event.pointerId !== toolbarPointerId) return
  toolbarPointerId = null
  stopToolbarWindowDrag()
  if (!toolbarDragMoved) {
    toolbarDragging.value = false
    toolbarSnapHint.value = null
    return
  }
  toolbarDragging.value = false
  toolbarDragReady = false
  toolbarSnapHint.value = null
  const toolbar = toolbarEl.value
  if (!toolbar) return
  const rect = toolbar.getBoundingClientRect()
  setToolbarDock(snapToolbarDock(
    rect.left,
    rect.top,
    rect.width,
    rect.height,
    window.innerWidth,
    window.innerHeight,
    undefined,
    toolbarDragPoint.x,
    toolbarDragPoint.y,
  ))
}

function isToolbarDragChrome(target: EventTarget | null) {
  if (!(target instanceof Element)) return false
  if (target.closest('.toolbar-handle, .toolbar-spacer')) return true
  if (target.closest('.device-controls, .toolbar-actions, .toolbar-account, .brand')) return false
  return target === toolbarEl.value
}

function startToolbarDrag(event: PointerEvent) {
  if (event.button !== 0) return
  if (toolbarPointerId !== null) return
  toolbarPointerId = event.pointerId
  toolbarDragMoved = false
  toolbarDragReady = false
  toolbarGrab = { x: event.clientX, y: event.clientY }
  toolbarDragPoint = { x: event.clientX, y: event.clientY }
  const origin = event.currentTarget
  if (origin instanceof HTMLElement) {
    try {
      origin.setPointerCapture(event.pointerId)
    } catch {
      // Capture is optional; window listeners still follow the pointer.
    }
  }
  window.addEventListener('pointermove', onToolbarWindowPointerMove)
  window.addEventListener('pointerup', onToolbarWindowPointerUp)
  window.addEventListener('pointercancel', onToolbarWindowPointerUp)
  event.preventDefault()
}

function onToolbarHandlePointerDown(event: PointerEvent) {
  startToolbarDrag(event)
}

function onToolbarChromePointerDown(event: PointerEvent) {
  if (!isToolbarDragChrome(event.target)) return
  startToolbarDrag(event)
}

function onToolbarWindowResize() {
  if (toolbarDock.value.dock !== 'float') return
  const toolbar = toolbarEl.value
  if (!toolbar) return
  const rect = toolbar.getBoundingClientRect()
  const next = clampToolbarPosition(
    toolbarDock.value.x,
    toolbarDock.value.y,
    rect.width,
    rect.height,
    window.innerWidth,
    window.innerHeight,
  )
  if (next.x === toolbarDock.value.x && next.y === toolbarDock.value.y) return
  setToolbarDock({ dock: 'float', ...next })
}
const mediaUpload = ref<MediaUploadState>({
  minimized: false,
  uploading: false,
  name: '',
  progress: 0,
  transferred: 0,
  total: 0,
  speed: 0,
  remainingSeconds: 0,
})
let unsubscribeActivity: (() => void) | undefined
let mousePulseTimer = 0
let keyboardPulseTimer = 0
let gamepadPulseTimer = 0
let lastMousePulse = 0

const screenState = computed<DeviceState>(() => {
  if (props.state.connection === 'connected' && props.videoFps > 0) return 'ready'
  if (['idle', 'connecting', 'connected'].includes(props.state.connection)) return 'waiting'
  return 'error'
})

const inputState = computed<DeviceState>(() => hidIndicatorState(props.status?.hid))
const deviceControlExtensions = toolbarItemsFor('device-controls')
const actionStartExtensions = toolbarItemsFor('actions-start')
const actionEndExtensions = toolbarItemsFor('actions-end')
const extensionHostProps = computed(() => ({
  compact: toolbarCompact.value,
  placement: menuPlacement.value,
  status: props.status,
  state: props.state,
}))
const gamepadState = computed<DeviceState>(() => {
  if (!props.status?.hid?.gamepad) return 'waiting'
  return inputState.value
})

const powerState = computed<DeviceState>(() => {
  if (!props.status) return 'waiting'
  if (!props.status.atx?.available) return 'error'
  return props.status.atx.pwr_led === false ? 'waiting' : 'ready'
})

const powerStateLabel = computed(() => {
  const led = props.status?.atx?.pwr_led
  if (led === true) return t('power.on', 'Host is On')
  if (led === false) return t('power.off', 'Host is Off')
  return t('power.title', 'Power')
})

const audioState = computed<DeviceState>(() =>
  props.status?.audio.enabled || props.status?.audio.microphone ? 'ready' : 'waiting',
)
const audioStateLabel = computed(() => {
  const speaker = props.status?.audio.enabled
  const microphone = props.status?.audio.microphone
  if (speaker && microphone) return `${t('usbAudio.speaker', 'Speaker')} + ${t('usbAudio.microphone', 'Microphone')}`
  if (speaker) return t('usbAudio.speaker', 'Speaker')
  if (microphone) return t('usbAudio.microphone', 'Microphone')
  return t('usbAudio.off', 'Off')
})

const mediaOpen = computed(() =>
  Boolean(props.msdStatus?.available || props.msdStatus?.mtp_available))

const mediaState = computed<DeviceState>(() => {
  if (!props.msdStatus) return 'waiting'
  if (!mediaOpen.value) return 'error'
  if (props.msdStatus.available && props.msdStatus.connected) {
    return props.msdStatus.iso_mounted || props.msdStatus.drive_mounted ? 'ready' : 'waiting'
  }
  if (props.msdStatus.mtp) return 'ready'
  return 'waiting'
})

const mediaStateLabel = computed(() => {
  if (!props.msdStatus) return t('virtualMedia.connectingStatus', 'Connecting...')
  if (!mediaOpen.value) return t('virtualMedia.unavailable', 'Virtual media is unavailable')
  if (props.msdStatus.available && props.msdStatus.connected) {
    return props.msdStatus.iso_mounted || props.msdStatus.drive_mounted
      ? t('virtualMedia.mounted', 'Virtual Media Mounted')
      : t('virtualMedia.noMountedFile', 'No mounted media')
  }
  if (props.msdStatus.mtp) return t('virtualMedia.mtpOn', 'File transfer on')
  return t('virtualMedia.disconnected', 'Disconnected')
})

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)))
  return `${(value / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`
}

function formatUploadRemaining(seconds: number) {
  if (seconds <= 0) return t('virtualMedia.remainingCalculating', 'Calculating time remaining…')
  if (seconds < 60) return t('virtualMedia.remainingLessThanMinute', 'Less than 1 minute remaining')
  return t('virtualMedia.remainingMinutes', '{count} minutes remaining')
    .replace('{count}', String(Math.ceil(seconds / 60)))
}

const mediaUploadLabel = computed(() => mediaUpload.value.uploading
  ? `${t('virtualMedia.uploadingFile', 'Uploading {name}…').replace('{name}', mediaUpload.value.name)} · ${mediaUpload.value.progress}% · ${formatBytes(mediaUpload.value.speed)}/s · ${formatUploadRemaining(mediaUpload.value.remainingSeconds)}`
  : `${t('virtualMedia.uploadPaused', 'Upload paused.')} · ${mediaUpload.value.progress}%`)

function restoreMediaUpload() {
  virtualMediaPopover.value?.restoreUploadDialog()
}


const deviceVariant = computed(() => {
  const machine = props.status?.machine === 'nanokvm' ? 'NanoKVM' : props.status?.machine || '-'
  if (!props.status?.variant) return machine
  const normalized = props.status.variant.toLowerCase()
  const variant = normalized === 'pcie' ? 'PCIe' : normalized === 'cube' ? 'Cube' : props.status.variant
  return `${machine} ${variant}`
})

const brandName = computed(() => (props.brandBadge ? `OneKVM ${props.brandBadge}` : 'OneKVM'))
const brandLabel = computed(() => `${brandName.value} · ${deviceVariant.value}`)

const icon = (component: typeof Power) => () => h(NIcon, null, { default: () => h(component) })

function shortcutOptions(shortcuts: KeyboardShortcut[], scope: 'user' | 'device'): DropdownOption[] {
  if (!shortcuts.length) {
    return [{ key: `shortcut-empty:${scope}`, label: t('keyboard.shortcuts.empty', 'No shortcuts'), disabled: true }]
  }
  return shortcuts.map((shortcut, index) => ({
    key: `shortcut:${scope}:${index}`,
    label: shortcut.name || shortcutChordLabel(shortcut),
    extra: shortcut.name ? shortcutChordLabel(shortcut) : undefined,
  }))
}

const keyboardOptions = computed<DropdownOption[]>(() => [
  {
    type: 'group',
    key: 'keyboard-actions',
    label: t('keyboard.actions', 'Actions'),
    children: [
      { key: 'cad', label: t('keyboard.ctrlaltdel'), icon: icon(Command) },
      { key: 'virtual', label: t('keyboard.virtualKeyboard'), icon: icon(Keyboard) },
      { key: 'send-text', label: t('keyboard.paste', 'Send text'), icon: icon(TextCursorInput) },
    ],
  },
  {
    key: 'user-shortcuts',
    label: t('keyboard.shortcuts.userGroup', 'User shortcuts'),
    icon: icon(UserRound),
    extra: String(props.userShortcuts.length),
    children: [
      ...shortcutOptions(props.userShortcuts, 'user'),
      { key: 'edit-user-shortcuts', label: t('keyboard.shortcuts.editBrowser', 'Edit browser shortcuts'), icon: icon(Pencil) },
    ],
  },
  {
    key: 'device-shortcuts',
    label: t('keyboard.shortcuts.deviceGroup', 'Device shortcuts'),
    icon: icon(Server),
    extra: String(props.deviceShortcuts.length),
    children: shortcutOptions(props.deviceShortcuts, 'device'),
  },
  { type: 'divider', key: 'keyboard-options-divider' },
  {
    key: 'right-control-as-meta',
    label: t('keyboard.rightControlAsWin', 'Right Ctrl as remote Win'),
    icon: props.rightControlAsMeta ? icon(Check) : undefined,
    extra: props.rightControlAsMeta ? t('keyboard.lockOn', 'On') : t('keyboard.lockOff', 'Off'),
  },
])

const languageMenuOptions = computed<DropdownOption[]>(() =>
  languageOptions.map((language) => ({
    key: language.value,
    label: language.label,
    disabled: language.value === currentLanguage.value,
  })),
)

const accountOptions = computed<DropdownOption[]>(() => [
  { key: 'settings', label: t('settings.account.manage', 'Account settings'), icon: icon(CircleUserRound) },
  { key: 'logout', label: t('settings.account.logoutBtn', 'Logout'), icon: icon(LogOut) },
])

function deviceStateLabel(device: string, deviceState: DeviceState) {
  const labels = {
    ready: t('deviceStatus.ready', 'working'),
    waiting: t('deviceStatus.waiting', 'connecting'),
    error: t('deviceStatus.error', 'disconnected'),
  }
  return `${device}: ${labels[deviceState]}`
}

function sendCtrlAltDelete() {
  onekvm.sendKeyboard([76], 1 | 4)
  window.setTimeout(() => onekvm.sendKeyboard([]), 80)
}

function selectKeyboard(key: string | number) {
  if (key === 'cad') sendCtrlAltDelete()
  if (key === 'virtual') emit('keyboard')
  if (key === 'edit-user-shortcuts') emit('edit-user-shortcuts')
  if (key === 'right-control-as-meta') emit('update:rightControlAsMeta', !props.rightControlAsMeta)
  const match = String(key).match(/^shortcut:(user|device):(\d+)$/)
  if (!match) return
  const shortcuts = match[1] === 'user' ? props.userShortcuts : props.deviceShortcuts
  const shortcut = shortcuts[Number(match[2])]
  if (shortcut) sendShortcut(shortcut)
}

function selectAccount(key: string | number) {
  if (key === 'settings') emit('account')
  if (key === 'logout') emit('logout')
}

function selectPower(key: string | number) {
  if (powerAction.value) return
  const action = key as PowerAction
  let confirmation: DialogReactive
  const execute = async () => {
    powerAction.value = action
    confirmation.loading = true
    confirmation.positiveText = t('power.executing', 'Executing…')
    confirmation.negativeButtonProps = { disabled: true }
    confirmation.closable = false
    confirmation.maskClosable = false
    confirmation.closeOnEsc = false
    try {
      await api.power(action)
      const successMessage = {
        on: t('power.powerShortSent', 'Short power press sent'),
        off: t('power.powerLongSent', 'Long power press sent'),
        reset: t('power.resetSent', 'Reset command sent'),
      }[action]
      message.success(successMessage)
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error))
      return false
    } finally {
      powerAction.value = null
      confirmation.loading = false
      confirmation.positiveText = t('power.okBtn')
      confirmation.negativeButtonProps = undefined
      confirmation.closable = true
      confirmation.maskClosable = true
      confirmation.closeOnEsc = true
    }
  }

  confirmation = dialog.warning({
    title: t('power.title'),
    content: action === 'reset' ? t('power.resetConfirm') : t('power.powerConfirm'),
    positiveText: t('power.okBtn'),
    negativeText: t('power.cancelBtn'),
    onPositiveClick: execute,
  })
}

function updateMenu(name: MenuName, visible: boolean) {
  if (visible) openMenu.value = name
  else if (openMenu.value === name) openMenu.value = null
  emit('overlay', openMenu.value !== null)
}

function pulseInputLed(activity: InputActivity) {
  const now = performance.now()
  if (activity === 'mouse' && now - lastMousePulse < 220) return
  if (activity === 'mouse') lastMousePulse = now

  const led = activity === 'mouse' ? mouseLed.value : activity === 'gamepad' ? gamepadLed.value : keyboardLed.value
  if (!led) return
  const timer = activity === 'mouse' ? mousePulseTimer : activity === 'gamepad' ? gamepadPulseTimer : keyboardPulseTimer
  window.clearTimeout(timer)
  led.classList.remove('device-led-active')
  void led.offsetWidth
  led.classList.add('device-led-active')
  const nextTimer = window.setTimeout(() => led.classList.remove('device-led-active'), 170)
  if (activity === 'mouse') mousePulseTimer = nextTimer
  else if (activity === 'gamepad') gamepadPulseTimer = nextTimer
  else keyboardPulseTimer = nextTimer
}

onMounted(() => {
  unsubscribeActivity = onekvm.subscribeActivity(pulseInputLed)
  emit('dock', toolbarDock.value.dock)
  window.addEventListener('resize', onToolbarWindowResize)
})

onBeforeUnmount(() => {
  window.clearTimeout(mousePulseTimer)
  window.clearTimeout(keyboardPulseTimer)
  window.clearTimeout(gamepadPulseTimer)
  window.removeEventListener('resize', onToolbarWindowResize)
  stopToolbarWindowDrag()
  toolbarSnapHint.value = null
  unsubscribeActivity?.()
})
</script>

<template>
  <header
    ref="toolbarEl"
    class="toolbar"
    :class="toolbarClass"
    :style="toolbarStyle"
    @pointerdown="onToolbarChromePointerDown"
  >
    <div class="brand">
      <n-tooltip :disabled="!toolbarCompact">
        <template #trigger>
          <img class="brand-mark" src="/brand/onekvm-app-icon.svg" :alt="brandLabel" />
        </template>
        <div class="toolbar-brand-tooltip">
          <strong>{{ brandName }}</strong>
          <span>{{ deviceVariant }}</span>
        </div>
      </n-tooltip>
      <div v-if="!toolbarCompact" class="brand-copy">
        <span class="brand-title-row"><span class="brand-name">OneKVM</span><span v-if="brandBadge" class="brand-badge">{{ brandBadge }}</span></span>
        <span class="brand-device">{{ deviceVariant }}</span>
      </div>
    </div>

    <div
      class="toolbar-spacer"
      :aria-label="toolbarHandleVisible ? undefined : t('toolbar.dragHandle', 'Drag menu bar')"
    >
      <button
        v-if="toolbarHandleVisible"
        type="button"
        class="toolbar-handle"
        :aria-label="t('toolbar.dragHandle', 'Drag menu bar')"
        @pointerdown.stop="onToolbarHandlePointerDown"
      >
        <GripVertical v-if="toolbarVertical" :size="14" />
        <GripHorizontal v-else :size="14" />
      </button>
    </div>

    <div class="device-controls" :aria-label="t('deviceStatus.title', 'Device status')">
      <DisplaySettingsPopover
        :video-resolution="status?.video.resolution ?? 0"
        :target-fps="status?.video.fps || 0"
        :can-change-video="canSettings"
        :video-fit="videoFit"
        :placement="menuPlacement"
        @update:show="updateMenu('display', $event)"
        @update:video-fit="emit('update:videoFit', $event)"
      >
        <n-tooltip :disabled="openMenu === 'display'">
          <template #trigger>
            <n-button
              quaternary
              size="small"
              class="device-indicator screen-device-indicator"
              :data-state="screenState"
              :aria-label="deviceStateLabel(t('screen.title', 'Screen'), screenState)"
            >
              <template #icon><Monitor /></template>
              <span class="device-led" />
            </n-button>
          </template>
          {{ deviceStateLabel(t('screen.title', 'Screen'), screenState) }}
        </n-tooltip>
      </DisplaySettingsPopover>

      <MouseSettingsPopover
        :mouse-mode="mouseMode"
        :scroll-interval="scrollInterval"
        :mouse-report-rate="mouseReportRate"
        :hid="status?.hid"
        :placement="menuPlacement"
        @update:show="updateMenu('mouse', $event)"
        @update:mouse-mode="emit('update:mouseMode', $event)"
        @update:scroll-interval="emit('update:scrollInterval', $event)"
        @update:mouse-report-rate="emit('update:mouseReportRate', $event)"
      >
        <n-tooltip :disabled="openMenu === 'mouse'">
          <template #trigger>
            <n-button
              quaternary
              size="small"
              class="device-indicator"
              :data-state="inputState"
              :aria-label="deviceStateLabel(t('mouse.title', 'Mouse'), inputState)"
            >
              <template #icon><MousePointer2 /></template>
              <span ref="mouseLed" class="device-led" />
            </n-button>
          </template>
          {{ deviceStateLabel(t('mouse.title', 'Mouse'), inputState) }}
        </n-tooltip>
      </MouseSettingsPopover>

      <KeyboardControlPopover
        :options="keyboardOptions"
        :layout="keyboardLayout"
        :hid="status?.hid"
        :num-lock="status?.hid?.num_lock"
        :caps-lock="status?.hid?.caps_lock"
        :scroll-lock="status?.hid?.scroll_lock"
        :placement="menuPlacement"
        @select="selectKeyboard"
        @update:show="updateMenu('keyboard', $event)"
      >
        <n-tooltip :disabled="openMenu === 'keyboard'">
          <template #trigger>
            <n-button
              quaternary
              size="small"
              class="device-indicator"
              :data-state="inputState"
              :aria-label="deviceStateLabel(t('keyboard.title', 'Keyboard'), inputState)"
            >
              <template #icon><Keyboard /></template>
              <span ref="keyboardLed" class="device-led" />
            </n-button>
          </template>
          {{ deviceStateLabel(t('keyboard.title', 'Keyboard'), inputState) }}
        </n-tooltip>
      </KeyboardControlPopover>

      <GamepadPopover
        v-if="status?.hid?.gamepad"
        :hid="status?.hid"
        :placement="menuPlacement"
        @update:show="updateMenu('gamepad', $event)"
      >
        <n-tooltip :disabled="openMenu === 'gamepad'">
          <template #trigger>
            <n-button
              quaternary
              size="small"
              class="device-indicator"
              :data-state="gamepadState"
              :aria-label="deviceStateLabel(t('gamepad.title', 'Gamepad'), gamepadState)"
            >
              <template #icon><Gamepad2 /></template>
              <span ref="gamepadLed" class="device-led" />
            </n-button>
          </template>
          {{ deviceStateLabel(t('gamepad.title', 'Gamepad'), gamepadState) }}
        </n-tooltip>
      </GamepadPopover>

      <PowerControlPopover
        :available="Boolean(status?.atx?.available)"
        :can-power="canPower && Boolean(status?.atx?.available)"
        :pwr-led="status?.atx?.pwr_led"
        :hdd-led="status?.atx?.hdd_led"
        :loading-action="powerAction"
        :placement="menuPlacement"
        @action="selectPower"
        @update:show="updateMenu('power', $event)"
      >
        <n-tooltip :disabled="openMenu === 'power'">
          <template #trigger>
            <n-button
              quaternary
              size="small"
              class="device-indicator power-device-indicator"
              :data-state="powerState"
              :loading="powerAction !== null"
              :aria-label="`${t('power.title', 'Power')}: ${powerStateLabel}`"
            >
              <template #icon><Power /></template>
              <span class="device-led" />
            </n-button>
          </template>
          {{ t('power.title', 'Power') }}: {{ powerStateLabel }}
        </n-tooltip>
      </PowerControlPopover>

      <USBAudioPopover
        v-if="status?.audio.enabled"
        :status="status"
        :placement="menuPlacement"
        @update:show="updateMenu('audio', $event)"
      >
        <n-tooltip :disabled="openMenu === 'audio'">
          <template #trigger>
            <n-button
              quaternary
              size="small"
              class="device-indicator"
              :data-state="audioState"
              :aria-label="`${t('usbAudio.title', 'Audio')}: ${audioStateLabel}`"
            >
              <template #icon><Volume2 /></template>
              <span class="device-led" />
            </n-button>
          </template>
          {{ t('usbAudio.title', 'Audio') }}: {{ audioStateLabel }}
        </n-tooltip>
      </USBAudioPopover>

      <VirtualMediaPopover
        ref="virtualMediaPopover"
        :placement="menuPlacement"
        @status="emit('media-status', $event)"
        @upload-state="mediaUpload = $event"
        @update:show="updateMenu('media', $event)"
      >
        <n-tooltip :disabled="openMenu === 'media'">
          <template #trigger>
            <n-button
              quaternary
              size="small"
              class="device-indicator"
              :data-state="mediaState"
              :aria-label="`${t('virtualMedia.title', 'Virtual Media')}: ${mediaStateLabel}`"
            >
              <template #icon><Disc3 /></template>
              <span class="device-led" />
            </n-button>
          </template>
          {{ t('virtualMedia.title', 'Virtual Media') }}: {{ mediaStateLabel }}
        </n-tooltip>
      </VirtualMediaPopover>

      <component
        v-for="item in deviceControlExtensions"
        :key="`${item.extensionId}:${item.slot}:${item.order}`"
        :is="item.component"
        v-bind="extensionHostProps"
      />

      <n-tooltip v-if="mediaUpload.minimized">
        <template #trigger>
          <n-button
            quaternary
            size="small"
            class="device-indicator upload-task-indicator"
            :data-state="mediaUpload.uploading ? 'uploading' : 'paused'"
            :aria-label="`${t('virtualMedia.uploadProgressTitle', 'ISO upload')}: ${mediaUploadLabel}`"
            @click="restoreMediaUpload"
          >
            <template #icon><Upload /></template>
            <span class="device-led" />
          </n-button>
        </template>
        {{ t('virtualMedia.uploadProgressTitle', 'ISO upload') }}: {{ mediaUploadLabel }}
      </n-tooltip>
    </div>

    <div class="toolbar-actions">
      <component
        v-for="item in actionStartExtensions"
        :key="`${item.extensionId}:${item.slot}:${item.order}`"
        :is="item.component"
        v-bind="extensionHostProps"
      />

      <n-tooltip>
        <template #trigger>
          <n-button
            quaternary
            size="small"
            :aria-pressed="performanceOpen"
            :aria-label="performanceOpen
              ? t('screen.hidePerformance', 'Hide performance overlay')
              : t('screen.showPerformance', 'Show performance overlay')"
            @click="emit('update:performanceOpen', !performanceOpen, $event)"
          >
            <template #icon><Activity /></template>
          </n-button>
        </template>
        {{ performanceOpen
          ? t('screen.hidePerformance', 'Hide performance overlay')
          : t('screen.showPerformance', 'Show performance overlay') }}
      </n-tooltip>

      <n-tooltip>
        <template #trigger>
          <n-button
            quaternary
            size="small"
            :aria-label="t('fullscreen.toggle', 'Toggle fullscreen')"
            @click="emit('fullscreen')"
          >
            <template #icon><Minimize v-if="fullscreen" /><Maximize v-else /></template>
          </n-button>
        </template>
        {{ t('fullscreen.toggle', 'Toggle fullscreen') }}
      </n-tooltip>

      <n-tooltip v-if="canSettings">
        <template #trigger>
          <n-button quaternary size="small" :aria-label="t('settings.title')" @click="emit('settings')">
            <template #icon><Settings /></template>
          </n-button>
        </template>
        {{ t('settings.title') }}
      </n-tooltip>

      <component
        v-for="item in actionEndExtensions"
        :key="`${item.extensionId}:${item.slot}:${item.order}`"
        :is="item.component"
        v-bind="extensionHostProps"
      />

      <n-dropdown
        trigger="click"
        :placement="menuPlacement"
        :options="languageMenuOptions"
        @select="setLanguage(String($event))"
        @update:show="updateMenu('language', $event)"
      >
        <n-tooltip :disabled="openMenu === 'language'">
          <template #trigger>
            <n-button quaternary size="small" :aria-label="t('settings.appearance.language')">
              <template #icon><Languages /></template>
            </n-button>
          </template>
          {{ t('settings.appearance.language') }}
        </n-tooltip>
      </n-dropdown>

      <div class="toolbar-account">
        <n-dropdown
          trigger="click"
          :placement="menuPlacement"
          :options="accountOptions"
          @select="selectAccount"
          @update:show="updateMenu('account', $event)"
        >
          <n-tooltip :disabled="openMenu === 'account'">
            <template #trigger>
              <n-button
                quaternary
                size="small"
                class="account-button"
                :aria-label="t('settings.account.title', 'Account')"
              >
                <template #icon><CircleUserRound /></template>
                <span v-if="!toolbarVertical" class="button-label account-name">{{ username }}</span>
              </n-button>
            </template>
            {{ t('settings.account.title', 'Account') }}
          </n-tooltip>
        </n-dropdown>
      </div>
    </div>
  </header>
  <Teleport to="body">
    <div
      v-if="toolbarSnapHint"
      class="toolbar-snap-preview"
      :class="[`is-${toolbarSnapHint.dock}`, `is-${toolbarSnapHint.mode}`]"
      aria-hidden="true"
    />
  </Teleport>
</template>
