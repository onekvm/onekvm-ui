<script setup lang="ts">
import { serviceURL } from '@/api/service-url'
import { computed, h, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
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
  Palette,
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
import { useOverlayMount } from '@/composables/useOverlayMount'
import type { VideoFit, VideoRotation } from '@/lib/video-fit'
import { effectiveVideoCodec } from '@/lib/video-transport'
import { currentLanguage, languageOptions, setLanguage, t } from '@/i18n/runtime'
import ToolboxMenu from './toolbox/ToolboxMenu.vue'
import PinnedTools from './toolbox/PinnedTools.vue'
import { useToolboxContext } from '@/composables/useToolbox'
import { toolbarItemsFor } from '@/extensions/pluginUi'
import { hidIndicatorState } from '@/lib/hid-status'
import { dismissControlOverlays } from '@/lib/overlay-target'
import { machineDisplayName } from '@/lib/machine'
import { onekvm, type InputActivity, type TransportState } from '@/lib/onekvm'
import { sendShortcut, shortcutChordLabel } from '@/lib/keyboard-shortcuts'
import { useOneKVMTheme } from '@/theme/runtime'
import type { OneKVMAppearancePreference } from '@/theme/model'
import {
  clampToolbarPosition,
  parseToolbarDock,
  parseToolbarLauncher,
  previewToolbarSnap,
  toolbarSnapHintI18nKey,
  resolveToolbarLauncherPosition,
  snapToolbarDock,
  dockedToolbarBox,
  floatingToolbarHideEdge,
  launcherHideEdge,
  toolbarGrabOffset,
  toolbarHandleVisible as handleVisibleForDock,
  toolbarHideOffset,
  toolbarLauncherActive,
  toolbarLauncherMenuAlign,
  toolbarMenuPlacement,
  toolbarMorphDuration,
  toolbarMorphEase,
  toolbarMorphFromRects,
  toolbarMorphKeyframes,
  toolbarMorphNeeded,
  toolbarMorphOriginInLast,
  toolbarRevealHotspot,
  TOOLBAR_AUTO_HIDE_MS,
  TOOLBAR_DOCK_KEY,
  TOOLBAR_DRAG_THRESHOLD_PX,
  TOOLBAR_LAUNCHER_KEY,
  TOOLBAR_LAUNCHER_PEEK_PX,
  TOOLBAR_LAUNCHER_PX,
  TOOLBAR_LAUNCHER_QUERY,
  type ToolbarBox,
  type ToolbarDock,
  type ToolbarDockState,
  type ToolbarHideEdge,
  type ToolbarLauncherPosition,
  type ToolbarOrigin,
  type ToolbarSnapPreview,
} from '@/lib/toolbar-dock'

import DisplaySettingsPopover from './DisplaySettingsPopover.vue'
import KeyboardControlPopover from './KeyboardControlPopover.vue'
import GamepadPopover from './GamepadPopover.vue'
import MouseSettingsPopover from './MouseSettingsPopover.vue'
import PowerControlPopover from './PowerControlPopover.vue'
import USBAudioPopover from './USBAudioPopover.vue'
import VirtualMediaPopover from './VirtualMediaPopover.vue'
import ControlOverlay from './ControlOverlay.vue'

const props = defineProps<{
  state: TransportState
  canSettings: boolean
  canChangeVideo: boolean
  canPower: boolean
  brandBadge: string
  username: string
  mouseMode: MouseMode
  scrollInterval: number
  mouseReportRate: number
  hideLocalCursor?: boolean
  trackpad?: boolean
  videoFit: VideoFit
  videoRotation: VideoRotation
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
  concealLauncher?: boolean
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
  'update:hideLocalCursor': [hidden: boolean]
  'update:trackpad': [open: boolean]
  'update:videoFit': [fit: VideoFit]
  'update:videoRotation': [rotation: VideoRotation]
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
  title: string
}

const dialog = useDialog()
const overlayTo = useOverlayMount()
const message = useMessage()
type PowerAction = 'on' | 'off' | 'reset'
const powerAction = ref<PowerAction | null>(null)
const openMenu = ref<MenuName | null>(null)
const toolbox = useToolboxContext()
const pinnedOverflowOpen = ref(false)
const mouseLed = ref<HTMLElement | null>(null)
const keyboardLed = ref<HTMLElement | null>(null)
const gamepadLed = ref<HTMLElement | null>(null)
const virtualMediaPopover = ref<{ restoreUploadDialog: () => void } | null>(null)
const toolbarEl = ref<HTMLElement | null>(null)
const toolbarDock = ref<ToolbarDockState>(parseToolbarDock(localStorage.getItem(TOOLBAR_DOCK_KEY)))
const toolbarDragging = ref(false)
const toolbarMorphing = ref(false)
const toolbarLiftPending = ref(false)
const toolbarSnapHint = ref<ToolbarSnapPreview>(null)
const toolbarSnapHintText = computed(() => {
  if (!toolbarSnapHint.value) return ''
  const key = toolbarSnapHintI18nKey(toolbarSnapHint.value)
  return t(key, key)
})
const viewport = ref({ width: window.innerWidth, height: window.innerHeight })
const toolbarLauncher = shallowRef(toolbarLauncherActive(window.innerWidth, window.innerHeight))
const launcherMenuOpen = shallowRef(false)
const launcherPos = ref<ToolbarLauncherPosition>(
  resolveToolbarLauncherPosition(
    parseToolbarLauncher(localStorage.getItem(TOOLBAR_LAUNCHER_KEY)),
    window.innerWidth,
    window.innerHeight,
  ),
)
let toolbarPointerId: number | null = null
let toolbarGrab = { x: 0, y: 0 }
let toolbarDragOffset = { x: 0, y: 0 }
let toolbarDragMoved = false
let toolbarDragReady = false
let toolbarDragPoint = { x: 0, y: 0 }
let toolbarMorphAnimation: Animation | null = null
let toolbarMorphToken = 0
let toolbarMorphFirst: ToolbarBox | null = null
let toolbarMorphExpand = false
let toolbarMorphOrigin: ToolbarOrigin = { x: 0, y: 0 }
let toolbarGrabSource: { selector: '.toolbar-handle' | '.toolbar-spacer' | '.toolbar-launcher' | '.brand'; fx: number; fy: number } | null = null
const toolbarPin = ref<ToolbarBox | null>(null)
const hideEdge = ref<ToolbarHideEdge | null>(null)
const edgeHidden = ref(false)
const pointerOnToolbarChrome = ref(false)
const toolbarSize = ref({ width: 0, height: 0 })
let toolbarHideTimer = 0
let launcherMedia: MediaQueryList | undefined

const toolbarVertical = computed(
  () => !toolbarLauncher.value && !toolbarDragging.value && (toolbarDock.value.dock === 'left' || toolbarDock.value.dock === 'right'),
)
const toolbarCompact = computed(
  () => toolbarLauncher.value || toolbarDragging.value || toolbarDock.value.dock === 'float' || toolbarVertical.value,
)
const toolbarHandleVisible = computed(() =>
  !toolbarLauncher.value && handleVisibleForDock(toolbarDock.value.dock, toolbarDragging.value),
)
const launcherAlign = computed(() =>
  toolbarLauncherMenuAlign(
    launcherPos.value.x,
    launcherPos.value.y,
    viewport.value.width,
    viewport.value.height,
  ),
)
const menuPlacement = computed(() => {
  if (!toolbarLauncher.value) return toolbarMenuPlacement(toolbarDock.value.dock)
  return launcherAlign.value.above ? 'top-end' : 'bottom-end'
})
const launcherTrayClass = computed(() => ({
  'is-centered': true,
}))
const toolbarClass = computed(() => ({
  'is-launcher': toolbarLauncher.value,
  'is-launcher-open': toolbarLauncher.value && launcherMenuOpen.value,
  'is-launcher-concealed': toolbarLauncher.value && props.concealLauncher,
  'is-floating': toolbarLauncher.value || toolbarDock.value.dock === 'float' || toolbarDragging.value,
  'is-docked-bottom': !toolbarLauncher.value && toolbarDock.value.dock === 'bottom' && !toolbarDragging.value,
  'is-docked-left': !toolbarLauncher.value && toolbarDock.value.dock === 'left' && !toolbarDragging.value,
  'is-docked-right': !toolbarLauncher.value && toolbarDock.value.dock === 'right' && !toolbarDragging.value,
  'is-vertical': toolbarVertical.value,
  'is-compact': toolbarCompact.value,
  'is-dragging': toolbarDragging.value,
  'is-morphing': toolbarMorphing.value,
  'is-lifting': toolbarLiftPending.value,
  'is-pinned': toolbarPin.value !== null,
  'is-edge-hidden': edgeHidden.value && hideEdge.value !== null,
}))
const toolbarStyle = computed(() => {
  if (toolbarLauncher.value) {
    const offset = edgeHidden.value && hideEdge.value
      ? toolbarHideOffset(
        hideEdge.value,
        launcherPos.value.x,
        launcherPos.value.y,
        TOOLBAR_LAUNCHER_PX,
        TOOLBAR_LAUNCHER_PX,
        viewport.value.width,
        viewport.value.height,
        TOOLBAR_LAUNCHER_PEEK_PX,
      )
      : { x: 0, y: 0 }
    return {
      left: `${launcherPos.value.x}px`,
      top: `${launcherPos.value.y}px`,
      '--toolbar-hide-x': `${offset.x}px`,
      '--toolbar-hide-y': `${offset.y}px`,
    }
  }
  if (toolbarPin.value) {
    return {
      left: `${toolbarPin.value.left}px`,
      top: `${toolbarPin.value.top}px`,
      width: `${toolbarPin.value.width}px`,
      height: `${toolbarPin.value.height}px`,
    }
  }
  if (!toolbarDragging.value && toolbarDock.value.dock !== 'float') return undefined
  const offset = edgeHidden.value && hideEdge.value
    ? toolbarHideOffset(
      hideEdge.value,
      toolbarDock.value.x,
      toolbarDock.value.y,
      toolbarSize.value.width,
      toolbarSize.value.height,
      viewport.value.width,
      viewport.value.height,
    )
    : { x: 0, y: 0 }
  return {
    left: `${toolbarDock.value.x}px`,
    top: `${toolbarDock.value.y}px`,
    '--toolbar-hide-x': `${offset.x}px`,
    '--toolbar-hide-y': `${offset.y}px`,
  }
})

const revealHotspotStyle = computed(() => {
  if (!hideEdge.value || !edgeHidden.value) return undefined
  const box = toolbarLauncher.value
    ? toolbarRevealHotspot(
      hideEdge.value,
      launcherPos.value.x,
      launcherPos.value.y,
      TOOLBAR_LAUNCHER_PX,
      TOOLBAR_LAUNCHER_PX,
      viewport.value.width,
      viewport.value.height,
      TOOLBAR_LAUNCHER_PX,
    )
    : toolbarRevealHotspot(
      hideEdge.value,
      toolbarDock.value.x,
      toolbarDock.value.y,
      toolbarSize.value.width,
      toolbarSize.value.height,
      viewport.value.width,
      viewport.value.height,
    )
  return {
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
  }
})

function workspaceDock(): ToolbarDock {
  return toolbarLauncher.value ? 'float' : toolbarDock.value.dock
}

function persistToolbarDock() {
  localStorage.setItem(TOOLBAR_DOCK_KEY, JSON.stringify(toolbarDock.value))
  emit('dock', workspaceDock())
}

function persistLauncherPos() {
  localStorage.setItem(TOOLBAR_LAUNCHER_KEY, JSON.stringify(launcherPos.value))
}

function emitToolbarOverlay() {
  emit('overlay', openMenu.value !== null || launcherMenuOpen.value || toolbox.menuOpen || pinnedOverflowOpen.value)
}

function setLauncherMenuOpen(open: boolean) {
  if (launcherMenuOpen.value === open) return
  launcherMenuOpen.value = open
  if (open) {
    edgeHidden.value = false
    clearToolbarHideTimer()
  } else {
    void nextTick().then(() => {
      refreshHideEdge()
      armToolbarHide()
    })
  }
  emitToolbarOverlay()
}

function toggleLauncherMenu() {
  setLauncherMenuOpen(!launcherMenuOpen.value)
}

function onLauncherClick(event: MouseEvent) {
  if (toolbarDragMoved) {
    event.preventDefault()
    event.stopPropagation()
    return
  }
  toggleLauncherMenu()
}

function isLauncherOverlayTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false
  return Boolean(target.closest(
    '.toolbar, .toolbar-tray, .toolbar-launcher-mask, .control-popover, .control-sheet-mask, .trackpad-overlay, .keyboard-panel, .n-popover, .n-dropdown-menu, .n-modal, .n-dialog, .n-drawer, .n-base-select-menu, .folder-create-popover',
  ))
}

function onLauncherWindowPointerDown(event: PointerEvent) {
  if (!launcherMenuOpen.value) return
  if (isLauncherOverlayTarget(event.target)) return
  event.preventDefault()
  event.stopPropagation()
  setLauncherMenuOpen(false)
}

function onLauncherWindowKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !launcherMenuOpen.value || openMenu.value) return
  setLauncherMenuOpen(false)
}

function syncToolbarLauncher() {
  viewport.value = { width: window.innerWidth, height: window.innerHeight }
  const next = toolbarLauncherActive(viewport.value.width, viewport.value.height)
  launcherPos.value = resolveToolbarLauncherPosition(
    next ? launcherPos.value : parseToolbarLauncher(localStorage.getItem(TOOLBAR_LAUNCHER_KEY)),
    viewport.value.width,
    viewport.value.height,
  )
  if (next) persistLauncherPos()
  if (next === toolbarLauncher.value) {
    refreshHideEdge()
    armToolbarHide()
    return
  }
  toolbarLauncher.value = next
  if (!next && props.trackpad) emit('update:trackpad', false)
  launcherMenuOpen.value = false
  openMenu.value = null
  stopToolbarMorph()
  toolbarDragging.value = false
  emit('dock', workspaceDock())
  emitToolbarOverlay()
}

function setToolbarDock(next: ToolbarDockState) {
  toolbarDock.value = next
  persistToolbarDock()
  void nextTick().then(() => {
    refreshHideEdge()
    armToolbarHide()
  })
}

function clearToolbarHideTimer() {
  window.clearTimeout(toolbarHideTimer)
  toolbarHideTimer = 0
}

function refreshHideEdge() {
  const toolbar = toolbarEl.value
  const width = toolbar?.offsetWidth ?? 0
  const height = toolbar?.offsetHeight ?? 0
  if (width > 0 && height > 0) toolbarSize.value = { width, height }
  if (toolbarLauncher.value) {
    if (toolbarDragging.value || launcherMenuOpen.value) {
      hideEdge.value = null
      return
    }
    hideEdge.value = launcherHideEdge(
      launcherPos.value.x,
      launcherPos.value.y,
      viewport.value.width,
      viewport.value.height,
    )
    return
  }
  if (
    toolbarDragging.value
    || toolbarDock.value.dock !== 'float'
    || width <= 0
    || height <= 0
  ) {
    hideEdge.value = null
    return
  }
  hideEdge.value = floatingToolbarHideEdge(
    toolbarDock.value.x,
    toolbarDock.value.y,
    width,
    height,
    viewport.value.width,
    viewport.value.height,
  )
}

function armToolbarHide() {
  clearToolbarHideTimer()
  if (!hideEdge.value) {
    edgeHidden.value = false
    return
  }
  if (
    openMenu.value
    || toolbox.menuOpen
    || pinnedOverflowOpen.value
    || launcherMenuOpen.value
    || pointerOnToolbarChrome.value
    || toolbarDragging.value
    || toolbarMorphing.value
    || toolbarLiftPending.value
  ) {
    edgeHidden.value = false
    return
  }
  if (edgeHidden.value) return
  toolbarHideTimer = window.setTimeout(() => {
    toolbarHideTimer = 0
    if (
      !hideEdge.value
      || openMenu.value
      || toolbox.menuOpen
      || pinnedOverflowOpen.value
      || launcherMenuOpen.value
      || pointerOnToolbarChrome.value
      || toolbarDragging.value
    ) return
    edgeHidden.value = true
  }, TOOLBAR_AUTO_HIDE_MS)
}

function isToolbarAutoHideChrome(target: EventTarget | null) {
  if (!(target instanceof Element)) return false
  return Boolean(target.closest('.toolbar, .toolbar-reveal-hotspot'))
}

function onToolbarChromePointerEnter() {
  pointerOnToolbarChrome.value = true
  edgeHidden.value = false
  clearToolbarHideTimer()
}

function onToolbarChromePointerLeave(event: PointerEvent) {
  if (isToolbarAutoHideChrome(event.relatedTarget)) return
  pointerOnToolbarChrome.value = false
  armToolbarHide()
}

function prefersToolbarMotion() {
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function copyToolbarBox(rect: ToolbarBox): ToolbarBox {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
}

function measureToolbarLayout() {
  const toolbar = toolbarEl.value
  if (!toolbar) return null
  if (toolbarPin.value) return copyToolbarBox(toolbarPin.value)
  if (toolbarDragging.value || toolbarDock.value.dock === 'float') {
    return {
      left: toolbarDock.value.x,
      top: toolbarDock.value.y,
      width: toolbar.offsetWidth,
      height: toolbar.offsetHeight,
    }
  }
  return copyToolbarBox(toolbar.getBoundingClientRect())
}

function morphOriginFor(first: ToolbarBox, last: ToolbarBox, expand: boolean): ToolbarOrigin {
  if (expand) return toolbarMorphOriginInLast(first, last, toolbarDragOffset)
  return { x: toolbarDragOffset.x, y: toolbarDragOffset.y }
}

function clearToolbarPin() {
  const pinned = toolbarPin.value !== null
  toolbarPin.value = null
  if (!pinned) return
  const toolbar = toolbarEl.value
  if (!toolbar) return
  toolbar.style.removeProperty('width')
  toolbar.style.removeProperty('height')
  if (toolbarDock.value.dock !== 'float' && !toolbarDragging.value) {
    toolbar.style.removeProperty('left')
    toolbar.style.removeProperty('top')
  }
}

function clearToolbarMorphStyles() {
  const toolbar = toolbarEl.value
  if (!toolbar) return
  toolbar.style.removeProperty('transform')
  toolbar.style.removeProperty('border-radius')
  toolbar.style.removeProperty('box-shadow')
  toolbar.style.removeProperty('transform-origin')
}

function stopToolbarMorph() {
  toolbarMorphToken += 1
  toolbarMorphAnimation?.cancel()
  toolbarMorphAnimation = null
  toolbarMorphFirst = null
  toolbarMorphing.value = false
  toolbarLiftPending.value = false
  clearToolbarMorphStyles()
  clearToolbarPin()
}

function retargetToolbarMorph() {
  const toolbar = toolbarEl.value
  const animation = toolbarMorphAnimation
  const first = toolbarMorphFirst
  const last = measureToolbarLayout()
  const effect = animation?.effect
  if (!toolbar || !animation || !first || !last || !(effect instanceof KeyframeEffect)) return
  const time = animation.currentTime
  toolbarMorphOrigin = morphOriginFor(first, last, toolbarMorphExpand)
  effect.setKeyframes(toolbarMorphKeyframes(first, last, toolbarMorphExpand, toolbarMorphOrigin))
  animation.currentTime = time
}

function playToolbarMorph(first: ToolbarBox, expand: boolean) {
  const toolbar = toolbarEl.value
  if (!toolbar) return
  const last = measureToolbarLayout()
  if (!last) return
  const origin = morphOriginFor(first, last, expand)
  const morph = toolbarMorphFromRects(first, last, origin)
  if (!prefersToolbarMotion() || !toolbarMorphNeeded(morph)) {
    clearToolbarPin()
    return
  }

  const token = ++toolbarMorphToken
  toolbarMorphAnimation?.cancel()
  toolbarMorphFirst = copyToolbarBox(first)
  toolbarMorphExpand = expand
  toolbarMorphOrigin = origin
  toolbarMorphing.value = true

  const animation = toolbar.animate(
    toolbarMorphKeyframes(first, last, expand, origin),
    {
      duration: toolbarMorphDuration(expand),
      easing: toolbarMorphEase(expand),
      fill: 'both',
    },
  )
  toolbarMorphAnimation = animation
  void animation.finished.then(
    () => {
      if (token !== toolbarMorphToken) return
      animation.commitStyles()
      animation.cancel()
      toolbarMorphAnimation = null
      toolbarMorphFirst = null
      toolbarMorphing.value = false
      clearToolbarMorphStyles()
      clearToolbarPin()
      refreshHideEdge()
      armToolbarHide()
    },
    () => {
      if (token !== toolbarMorphToken) return
      toolbarMorphAnimation = null
      toolbarMorphFirst = null
      toolbarMorphing.value = false
      clearToolbarMorphStyles()
      clearToolbarPin()
      refreshHideEdge()
      armToolbarHide()
    },
  )
}

function waitToolbarPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

async function liftToolbarFromDock(first: ToolbarBox | undefined, shouldMorph: boolean) {
  await nextTick()
  if (toolbarPointerId === null) {
    toolbarLiftPending.value = false
    return
  }
  await waitToolbarPaint()
  if (toolbarPointerId === null) {
    toolbarLiftPending.value = false
    return
  }
  captureToolbarDragOffset(toolbarDragPoint.x, toolbarDragPoint.y)
  toolbarDragReady = true
  if (shouldMorph && first) playToolbarMorph(first, false)
  toolbarLiftPending.value = false
}

async function settleToolbarToDock(first: ToolbarBox, next: ToolbarDockState) {
  if (next.dock === 'float') {
    setToolbarDock(next)
    return
  }
  toolbarPin.value = dockedToolbarBox(next.dock, window.innerWidth, window.innerHeight)
  setToolbarDock(next)
  await nextTick()
  await waitToolbarPaint()
  playToolbarMorph(first, true)
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
  if (toolbarLauncher.value) {
    const next = clampToolbarPosition(
      clientX - toolbarDragOffset.x,
      clientY - toolbarDragOffset.y,
      TOOLBAR_LAUNCHER_PX,
      TOOLBAR_LAUNCHER_PX,
      window.innerWidth,
      window.innerHeight,
    )
    launcherPos.value = next
    toolbar.style.left = `${next.x}px`
    toolbar.style.top = `${next.y}px`
    return
  }
  const width = toolbar.offsetWidth
  const height = toolbar.offsetHeight
  const next = clampToolbarPosition(
    clientX - toolbarDragOffset.x,
    clientY - toolbarDragOffset.y,
    width,
    height,
    window.innerWidth,
    window.innerHeight,
  )
  toolbarDock.value = { dock: 'float', ...next }
  toolbar.style.left = `${next.x}px`
  toolbar.style.top = `${next.y}px`
  updateToolbarSnapHint(next.x, next.y, width, height, clientX, clientY)
  retargetToolbarMorph()
}

function rememberToolbarGrab(event: PointerEvent) {
  const target = event.target
  const toolbar = toolbarEl.value
  if (!(target instanceof Element) || !toolbar) {
    toolbarGrabSource = null
    return
  }
  const source = target.closest('.toolbar-handle, .toolbar-spacer, .toolbar-launcher, .brand')
  if (!(source instanceof Element)) {
    toolbarGrabSource = null
    return
  }
  const rect = source.getBoundingClientRect()
  toolbarGrabSource = {
    selector: source.classList.contains('toolbar-launcher')
      ? '.toolbar-launcher'
      : source.classList.contains('toolbar-handle')
        ? '.toolbar-handle'
        : source.classList.contains('brand') ? '.brand' : '.toolbar-spacer',
    fx: rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0.5,
    fy: rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5,
  }
}

function captureToolbarDragOffset(clientX: number, clientY: number) {
  const toolbar = toolbarEl.value
  if (!toolbar) return
  if (toolbarLauncher.value) {
    toolbarDragOffset = {
      x: Math.min(TOOLBAR_LAUNCHER_PX, Math.max(0, clientX - launcherPos.value.x)),
      y: Math.min(TOOLBAR_LAUNCHER_PX, Math.max(0, clientY - launcherPos.value.y)),
    }
    applyToolbarDragPosition(clientX, clientY)
    return
  }
  const grab = toolbarGrabSource
  const grabbed = grab ? toolbar.querySelector(grab.selector) : null
  const handle = toolbar.querySelector('.toolbar-handle')
  const spacer = toolbar.querySelector('.toolbar-spacer')
  const source = grabbed instanceof HTMLElement
    ? grabbed
    : handle instanceof HTMLElement ? handle : spacer instanceof HTMLElement ? spacer : null
  if (source) {
    const toolbarRect = toolbar.getBoundingClientRect()
    const sourceRect = source.getBoundingClientRect()
    toolbarDragOffset = toolbarGrabOffset(
      toolbarRect,
      sourceRect,
      grab ? grab.fx : 0.5,
      grab ? grab.fy : 0.5,
    )
  } else {
    const layout = measureToolbarLayout()
    const left = layout?.left ?? toolbar.getBoundingClientRect().left
    const top = layout?.top ?? toolbar.getBoundingClientRect().top
    toolbarDragOffset = {
      x: Math.min(toolbar.offsetWidth, Math.max(0, clientX - left)),
      y: Math.min(toolbar.offsetHeight, Math.max(0, clientY - top)),
    }
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
    dismissOverlays()
    if (toolbarLauncher.value) {
      toolbarDragReady = true
      toolbarDragging.value = true
      captureToolbarDragOffset(event.clientX, event.clientY)
      return
    }
    if (toolbarDock.value.dock === 'float') {
      toolbarDragging.value = true
      edgeHidden.value = false
      clearToolbarHideTimer()
      hideEdge.value = null
      captureToolbarDragOffset(event.clientX, event.clientY)
      toolbarDragReady = true
      return
    }
    toolbarDragReady = false
    const first = toolbarEl.value?.getBoundingClientRect()
    const shouldMorph = true
    if (shouldMorph) toolbarLiftPending.value = true
    toolbarDragging.value = true
    edgeHidden.value = false
    clearToolbarHideTimer()
    hideEdge.value = null
    toolbarDock.value = { dock: 'float', x: toolbarDock.value.x, y: toolbarDock.value.y }
    emit('dock', 'float')
    void liftToolbarFromDock(first, shouldMorph)
    return
  }
  if (!toolbarDragReady) return
  applyToolbarDragPosition(event.clientX, event.clientY)
}

function onToolbarWindowPointerUp(event: PointerEvent) {
  if (event.pointerId !== toolbarPointerId) return
  toolbarPointerId = null
  stopToolbarWindowDrag()
  if (toolbarLauncher.value) {
    toolbarDragReady = false
    toolbarSnapHint.value = null
    toolbarDragging.value = false
    if (toolbarDragMoved) persistLauncherPos()
    void nextTick().then(() => {
      refreshHideEdge()
      armToolbarHide()
    })
    return
  }
  if (!toolbarDragMoved) {
    toolbarDragging.value = false
    toolbarSnapHint.value = null
    return
  }
  toolbarDragReady = false
  toolbarSnapHint.value = null
  toolbarLiftPending.value = false
  const toolbar = toolbarEl.value
  if (!toolbar) {
    stopToolbarMorph()
    toolbarDragging.value = false
    return
  }
  const visual = copyToolbarBox(toolbar.getBoundingClientRect())
  const layout = measureToolbarLayout() ?? visual
  const next = snapToolbarDock(
    layout.left,
    layout.top,
    layout.width,
    layout.height,
    window.innerWidth,
    window.innerHeight,
    undefined,
    toolbarDragPoint.x,
    toolbarDragPoint.y,
  )
  toolbarDragging.value = false
  if (next.dock === 'float') {
    setToolbarDock(next)
    return
  }
  stopToolbarMorph()
  void settleToolbarToDock(visual, next)
}

function isToolbarDragChrome(target: EventTarget | null) {
  if (!(target instanceof Element)) return false
  if (toolbarLauncher.value) return Boolean(target.closest('.toolbar-launcher'))
  if (target.closest('.toolbar-handle, .toolbar-spacer, .brand')) return true
  if (target.closest('.device-controls, .toolbar-actions, .toolbar-account')) return false
  return target === toolbarEl.value
}

function startToolbarDrag(event: PointerEvent) {
  if (event.button !== 0) return
  if (toolbarPointerId !== null) return
  stopToolbarMorph()
  toolbarPointerId = event.pointerId
  toolbarDragMoved = false
  toolbarDragReady = false
  toolbarGrab = { x: event.clientX, y: event.clientY }
  toolbarDragPoint = { x: event.clientX, y: event.clientY }
  rememberToolbarGrab(event)
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
  if (!toolbarLauncher.value) event.preventDefault()
}

function onToolbarHandlePointerDown(event: PointerEvent) {
  startToolbarDrag(event)
}

function onToolbarChromePointerDown(event: PointerEvent) {
  if (!isToolbarDragChrome(event.target)) return
  startToolbarDrag(event)
}

function onToolbarWindowResize() {
  stopToolbarMorph()
  syncToolbarLauncher()
  if (toolbarLauncher.value || toolbarDock.value.dock !== 'float') return
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
  if (next.x === toolbarDock.value.x && next.y === toolbarDock.value.y) {
    refreshHideEdge()
    armToolbarHide()
    return
  }
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
  title: '',
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
  if (props.status.atx.pwr_led === true) return 'ready'
  return 'waiting'
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

const mediaUploadLabel = computed(() =>
  `${t('virtualMedia.uploadingFile', 'Uploading {name}…').replace('{name}', mediaUpload.value.name)} · ${mediaUpload.value.progress}% · ${formatBytes(mediaUpload.value.speed)}/s · ${formatUploadRemaining(mediaUpload.value.remainingSeconds)}`)

function restoreMediaUpload() {
  virtualMediaPopover.value?.restoreUploadDialog()
}


const deviceVariant = computed(() => machineDisplayName(props.status))

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

const { appearance, setAppearance } = useOneKVMTheme()
const themeChoices: { key: OneKVMAppearancePreference; label: () => string }[] = [
  { key: 'system', label: () => t('settings.appearance.followSystem', 'System') },
  { key: 'light', label: () => t('settings.appearance.light', 'Light') },
  { key: 'dark', label: () => t('settings.appearance.dark', 'Dark') },
]

const accountOptions = computed<DropdownOption[]>(() => [
  {
    key: 'theme',
    label: t('settings.appearance.theme', 'Theme'),
    icon: icon(Palette),
    children: themeChoices.map((choice) => ({
      key: `theme-${choice.key}`,
      label: choice.label(),
      icon: appearance.value === choice.key ? icon(Check) : undefined,
    })),
  },
  { type: 'divider', key: 'account-theme-divider' },
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
  if (key === 'virtual') {
    setLauncherMenuOpen(false)
    emit('keyboard')
  }
  if (key === 'edit-user-shortcuts') emit('edit-user-shortcuts')
  if (key === 'right-control-as-meta') emit('update:rightControlAsMeta', !props.rightControlAsMeta)
  const match = String(key).match(/^shortcut:(user|device):(\d+)$/)
  if (!match) return
  const shortcuts = match[1] === 'user' ? props.userShortcuts : props.deviceShortcuts
  const shortcut = shortcuts[Number(match[2])]
  if (shortcut) sendShortcut(shortcut)
}

function selectAccount(key: string | number) {
  const value = String(key)
  if (value.startsWith('theme-')) {
    setAppearance(value.slice('theme-'.length))
    return
  }
  if (key === 'settings') emit('account')
  if (key === 'logout') emit('logout')
}

function pickTheme(preference: OneKVMAppearancePreference) {
  setAppearance(preference)
  updateMenu('account', false)
}

function pickLanguage(value: string) {
  setLanguage(value)
  updateMenu('language', false)
}

function pickAccount(key: string) {
  selectAccount(key)
  updateMenu('account', false)
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
  emitToolbarOverlay()
}

function onTrackpadToggle(open: boolean) {
  emit('update:trackpad', open)
  if (!open) return
  updateMenu('mouse', false)
  setLauncherMenuOpen(false)
}

function dismissOverlays() {
  if (openMenu.value !== null) openMenu.value = null
  setLauncherMenuOpen(false)
  dismissControlOverlays()
  emitToolbarOverlay()
}

defineExpose({ dismissOverlays })

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

watch(
  [openMenu, () => toolbox.menuOpen, pinnedOverflowOpen, toolbarDragging, toolbarMorphing, toolbarLiftPending],
  () => {
    refreshHideEdge()
    armToolbarHide()
    emitToolbarOverlay()
  },
)

onMounted(() => {
  unsubscribeActivity = onekvm.subscribeActivity(pulseInputLed)
  launcherMedia = window.matchMedia(TOOLBAR_LAUNCHER_QUERY)
  launcherMedia.addEventListener('change', syncToolbarLauncher)
  emit('dock', workspaceDock())
  window.addEventListener('resize', onToolbarWindowResize)
  window.addEventListener('pointerdown', onLauncherWindowPointerDown, true)
  window.addEventListener('keydown', onLauncherWindowKeydown)
  void nextTick().then(() => {
    refreshHideEdge()
    armToolbarHide()
  })
})

onBeforeUnmount(() => {
  clearToolbarHideTimer()
  window.clearTimeout(mousePulseTimer)
  window.clearTimeout(keyboardPulseTimer)
  window.clearTimeout(gamepadPulseTimer)
  window.removeEventListener('resize', onToolbarWindowResize)
  window.removeEventListener('pointerdown', onLauncherWindowPointerDown, true)
  window.removeEventListener('keydown', onLauncherWindowKeydown)
  launcherMedia?.removeEventListener('change', syncToolbarLauncher)
  stopToolbarWindowDrag()
  stopToolbarMorph()
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
    @pointerenter="onToolbarChromePointerEnter"
    @pointerleave="onToolbarChromePointerLeave"
  >
    <button
      v-if="toolbarLauncher"
      type="button"
      class="toolbar-launcher"
      :aria-expanded="launcherMenuOpen"
      aria-haspopup="menu"
      :aria-label="launcherMenuOpen
        ? t('toolbar.closeMenu', 'Close controls')
        : t('toolbar.openMenu', 'Open controls')"
      @pointerdown="onToolbarHandlePointerDown"
      @click="onLauncherClick"
    >
      <img class="brand-mark" :src="serviceURL('/brand/onekvm-app-icon.svg')" :alt="brandLabel" draggable="false" />
      <span class="toolbar-launcher-pip" :data-state="screenState" aria-hidden="true" />
    </button>
    <div v-else class="brand">
      <n-tooltip :disabled="!toolbarCompact">
        <template #trigger>
          <img class="brand-mark" :src="serviceURL('/brand/onekvm-app-icon.svg')" :alt="brandLabel" draggable="false" />
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
      v-if="!toolbarLauncher"
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

    <Teleport :to="overlayTo" :disabled="!toolbarLauncher">
    <Transition name="toolbar-launcher-menu">
    <div
      v-show="!toolbarLauncher || launcherMenuOpen"
      class="toolbar-tray"
      :class="toolbarLauncher ? launcherTrayClass : undefined"
      :inert="toolbarLauncher && !launcherMenuOpen"
    >
      <div v-if="toolbarLauncher" class="toolbar-tray-header">
        <strong>{{ brandName }}</strong>
        <span>{{ deviceVariant }}</span>
      </div>
      <div v-if="toolbarLauncher" class="toolbar-list-title">
        {{ t('deviceStatus.title', 'Device status') }}
      </div>
      <div class="device-controls" :aria-label="t('deviceStatus.title', 'Device status')">
      <DisplaySettingsPopover
        :state="state"
        :video-codec="status ? effectiveVideoCodec(status.video) : ''"
        :video-resolution="status?.video.resolution ?? 0"
        :target-fps="status?.video.fps || 0"
        :can-change-video="canChangeVideo"
        :video-fit="videoFit"
        :video-rotation="videoRotation"
        :placement="menuPlacement"
        :sheet="toolbarLauncher"
        @update:show="updateMenu('display', $event)"
        @update:video-fit="emit('update:videoFit', $event)"
        @update:video-rotation="emit('update:videoRotation', $event)"
      >
        <n-tooltip :disabled="toolbarLauncher || openMenu === 'display'">
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
              <span class="toolbar-action-label">{{ t('screen.title', 'Screen') }}</span>
            </n-button>
          </template>
          {{ deviceStateLabel(t('screen.title', 'Screen'), screenState) }}
        </n-tooltip>
      </DisplaySettingsPopover>

      <MouseSettingsPopover
        :mouse-mode="mouseMode"
        :scroll-interval="scrollInterval"
        :mouse-report-rate="mouseReportRate"
        :hide-local-cursor="hideLocalCursor"
        :trackpad="trackpad"
        :hid="status?.hid"
        :placement="menuPlacement"
        :sheet="toolbarLauncher"
        @update:show="updateMenu('mouse', $event)"
        @update:mouse-mode="emit('update:mouseMode', $event)"
        @update:scroll-interval="emit('update:scrollInterval', $event)"
        @update:mouse-report-rate="emit('update:mouseReportRate', $event)"
        @update:hide-local-cursor="emit('update:hideLocalCursor', $event)"
        @update:trackpad="onTrackpadToggle"
      >
        <n-tooltip :disabled="toolbarLauncher || openMenu === 'mouse'">
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
              <span class="toolbar-action-label">{{ t('mouse.title', 'Mouse') }}</span>
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
        :sheet="toolbarLauncher"
        @select="selectKeyboard"
        @update:show="updateMenu('keyboard', $event)"
      >
        <n-tooltip :disabled="toolbarLauncher || openMenu === 'keyboard'">
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
              <span class="toolbar-action-label">{{ t('keyboard.title', 'Keyboard') }}</span>
            </n-button>
          </template>
          {{ deviceStateLabel(t('keyboard.title', 'Keyboard'), inputState) }}
        </n-tooltip>
      </KeyboardControlPopover>

      <GamepadPopover
        v-if="status?.hid?.gamepad"
        :hid="status?.hid"
        :placement="menuPlacement"
        :sheet="toolbarLauncher"
        @update:show="updateMenu('gamepad', $event)"
      >
        <n-tooltip :disabled="toolbarLauncher || openMenu === 'gamepad'">
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
              <span class="toolbar-action-label">{{ t('gamepad.title', 'Gamepad') }}</span>
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
        :sheet="toolbarLauncher"
        @action="selectPower"
        @update:show="updateMenu('power', $event)"
      >
        <n-tooltip :disabled="toolbarLauncher || openMenu === 'power'">
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
              <span class="toolbar-action-label">{{ t('power.title', 'Power') }}</span>
            </n-button>
          </template>
          {{ t('power.title', 'Power') }}: {{ powerStateLabel }}
        </n-tooltip>
      </PowerControlPopover>

      <USBAudioPopover
        :status="status"
        :placement="menuPlacement"
        :sheet="toolbarLauncher"
        @update:show="updateMenu('audio', $event)"
      >
        <n-tooltip :disabled="toolbarLauncher || openMenu === 'audio'">
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
              <span class="toolbar-action-label">{{ t('usbAudio.title', 'Audio') }}</span>
            </n-button>
          </template>
          {{ t('usbAudio.title', 'Audio') }}: {{ audioStateLabel }}
        </n-tooltip>
      </USBAudioPopover>

      <VirtualMediaPopover
        ref="virtualMediaPopover"
        :placement="menuPlacement"
        :sheet="toolbarLauncher"
        @status="emit('media-status', $event)"
        @upload-state="mediaUpload = $event"
        @update:show="updateMenu('media', $event)"
      >
        <n-tooltip :disabled="toolbarLauncher || openMenu === 'media'">
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
              <span class="toolbar-action-label">{{ t('virtualMedia.title', 'Virtual Media') }}</span>
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

      <n-tooltip v-if="mediaUpload.minimized" :disabled="toolbarLauncher">
        <template #trigger>
          <n-button
            quaternary
            size="small"
            class="device-indicator upload-task-indicator"
            :data-state="mediaUpload.uploading ? 'uploading' : 'paused'"
            :aria-label="`${mediaUpload.title || t('virtualMedia.uploadProgressTitle', 'ISO upload')}: ${mediaUploadLabel}`"
            @click="restoreMediaUpload"
          >
            <template #icon><Upload /></template>
            <span class="device-led" />
            <span class="toolbar-action-label">{{ t('virtualMedia.uploadProgressTitle', 'ISO upload') }}</span>
          </n-button>
        </template>
        {{ mediaUpload.title || t('virtualMedia.uploadProgressTitle', 'ISO upload') }}: {{ mediaUploadLabel }}
      </n-tooltip>
    </div>

    <PinnedTools :mobile="toolbarLauncher" :vertical="toolbarVertical" :placement="menuPlacement" @overlay="pinnedOverflowOpen = $event" />

    <div v-if="toolbarLauncher" class="toolbar-list-title">
      {{ t('keyboard.actions', 'Actions') }}
    </div>
    <div class="toolbar-actions">
      <component
        v-for="item in actionStartExtensions"
        :key="`${item.extensionId}:${item.slot}:${item.order}`"
        :is="item.component"
        v-bind="extensionHostProps"
      />

      <n-tooltip :disabled="toolbarLauncher">
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
            <span v-if="toolbarLauncher" class="toolbar-action-label">{{ t('toolbar.performance', 'Stats') }}</span>
          </n-button>
        </template>
        {{ performanceOpen
          ? t('screen.hidePerformance', 'Hide performance overlay')
          : t('screen.showPerformance', 'Show performance overlay') }}
      </n-tooltip>

      <n-tooltip :disabled="toolbarLauncher">
        <template #trigger>
          <n-button
            quaternary
            size="small"
            :aria-label="t('fullscreen.toggle', 'Toggle fullscreen')"
            @click="emit('fullscreen')"
          >
            <template #icon><Minimize v-if="fullscreen" /><Maximize v-else /></template>
            <span v-if="toolbarLauncher" class="toolbar-action-label">{{ t('toolbar.fullscreen', 'Full screen') }}</span>
          </n-button>
        </template>
        {{ t('fullscreen.toggle', 'Toggle fullscreen') }}
      </n-tooltip>

      <ToolboxMenu :mobile="toolbarLauncher" :placement="menuPlacement" />

      <n-tooltip v-if="canSettings" :disabled="toolbarLauncher">
        <template #trigger>
          <n-button quaternary size="small" :aria-label="t('settings.title')" @click="emit('settings')">
            <template #icon><Settings /></template>
            <span v-if="toolbarLauncher" class="toolbar-action-label">{{ t('settings.title') }}</span>
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
        v-if="!toolbarLauncher"
        trigger="click"
        :show="openMenu === 'language'"
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
      <ControlOverlay
        v-else
        :show="openMenu === 'language'"
        sheet
        @update:show="updateMenu('language', $event)"
      >
        <n-button quaternary size="small" :aria-label="t('settings.appearance.language')">
          <template #icon><Languages /></template>
          <span class="toolbar-action-label">{{ t('settings.appearance.language') }}</span>
        </n-button>
        <template #title>{{ t('settings.appearance.language') }}</template>
        <template #panel>
          <header class="control-popover-header">
            <strong>{{ t('settings.appearance.language') }}</strong>
          </header>
          <div class="control-sheet-list">
            <button
              v-for="language in languageOptions"
              :key="language.value"
              type="button"
              class="control-sheet-row"
              :aria-current="language.value === currentLanguage ? true : undefined"
              @click="pickLanguage(language.value)"
            >
              {{ language.label }}
            </button>
          </div>
        </template>
      </ControlOverlay>

      <div class="toolbar-account">
        <n-dropdown
          v-if="!toolbarLauncher"
          trigger="click"
          :show="openMenu === 'account'"
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
        <ControlOverlay
          v-else
          :show="openMenu === 'account'"
          sheet
          @update:show="updateMenu('account', $event)"
        >
          <n-button
            quaternary
            size="small"
            class="account-button"
            :aria-label="t('settings.account.title', 'Account')"
          >
            <template #icon><CircleUserRound /></template>
            <span class="toolbar-action-label">{{ username }}</span>
          </n-button>
          <template #title>{{ t('settings.account.title', 'Account') }}</template>
          <template #panel>
            <header class="control-popover-header">
              <strong>{{ t('settings.account.title', 'Account') }}</strong>
            </header>
            <div class="control-sheet-list">
              <p class="control-sheet-label">{{ t('settings.appearance.theme', 'Theme') }}</p>
              <button
                v-for="choice in themeChoices"
                :key="choice.key"
                type="button"
                class="control-sheet-row"
                :aria-current="appearance === choice.key ? true : undefined"
                @click="pickTheme(choice.key)"
              >
                {{ choice.label() }}
              </button>
              <button type="button" class="control-sheet-row" @click="pickAccount('settings')">
                {{ t('settings.account.manage', 'Account settings') }}
              </button>
              <button type="button" class="control-sheet-row" @click="pickAccount('logout')">
                {{ t('settings.account.logoutBtn', 'Logout') }}
              </button>
            </div>
          </template>
        </ControlOverlay>
      </div>
    </div>
    </div>
    </Transition>
    </Teleport>
  </header>
  <Teleport :to="overlayTo">
    <div
      v-if="toolbarLauncher && launcherMenuOpen"
      class="toolbar-launcher-mask"
      @click="setLauncherMenuOpen(false)"
    />
    <div
      v-if="toolbarSnapHint && !toolbarLauncher"
      class="toolbar-snap-preview"
      :class="[`is-${toolbarSnapHint.dock}`, `is-${toolbarSnapHint.mode}`]"
      aria-hidden="true"
    />
    <div
      v-if="toolbarSnapHint && !toolbarLauncher"
      class="toolbar-snap-popover"
      :class="[`is-${toolbarSnapHint.dock}`, `is-${toolbarSnapHint.mode}`]"
      role="status"
    >
      {{ toolbarSnapHintText }}
    </div>
    <div
      v-if="hideEdge && edgeHidden"
      class="toolbar-reveal-hotspot"
      :class="`is-${hideEdge}`"
      :style="revealHotspotStyle"
      aria-hidden="true"
      @pointerenter="onToolbarChromePointerEnter"
      @pointerdown="onToolbarChromePointerEnter"
      @pointerleave="onToolbarChromePointerLeave"
    />
  </Teleport>
</template>
