<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import { CircleQuestionMark, Maximize, Minus, X } from '@lucide/vue'

import { useOverlayMount } from '@/composables/useOverlayMount'
import { useTrackpadHud } from '@/composables/useTrackpadHud'
import { MOUSE_BUTTON_LEFT, MOUSE_BUTTON_RIGHT } from '@/lib/hid-mouse'
import { t } from '@/i18n/runtime'
import {
  clampOverlayPosition,
  overlayDragHostRect,
  overlayGrabOffset,
  overlayPercentToPosition,
  overlayPointerPosition,
  overlayPositionToPercent,
  resizeAnchoredBox,
  type OverlayPoint,
  type OverlayResizeCorner,
} from '@/lib/overlay-drag'
import {
  TRACKPAD_HEIGHT_KEY,
  TRACKPAD_PANEL_MIN_WIDTH,
  TRACKPAD_STICK_NUDGE,
  TRACKPAD_SURFACE_DEFAULT,
  TRACKPAD_SURFACE_MIN,
  clampTrackpadHeight,
  clampTrackpadPanelWidth,
  extraFingerScrolls,
  latchPadPressAllowed,
  padReleaseKind,
  parseTrackpadHeight,
  scaledTrackpadDelta,
  trackpadHoldMs,
  trackpadKnobNudge,
  trackpadPanelWidth,
  trackpadPinchSize,
  trackpadPointerMoved,
  trackpadTapSlop,
} from '@/lib/trackpad'
import { COARSE_POINTER_QUERY } from '@/lib/mobile-viewport'

const emit = defineEmits<{
  close: []
  look: [dx: number, dy: number]
  tap: []
  wheel: [delta: number]
  buttons: [buttons: number]
  chrome: [height: number]
}>()

const overlayTo = useOverlayMount()
const {
  minimized,
  stickSize,
  stickX,
  stickY,
  panelX,
  panelY,
  panelWidth: savedPanelWidth,
  setMinimized,
  setStickSize,
  setStickPosition,
  setPanelPosition,
  setPanelWidth,
} = useTrackpadHud()
const overlay = shallowRef<HTMLElement | null>(null)
const leftDown = shallowRef(false)
const rightDown = shallowRef(false)
const placed = shallowRef(false)
const dragging = shallowRef(false)
const touchUi = shallowRef(
  typeof window !== 'undefined' && Boolean(window.matchMedia?.(COARSE_POINTER_QUERY)?.matches),
)
let pointerMedia: MediaQueryList | undefined
const posX = shallowRef(8)
const posY = shallowRef(8)
const panelWidth = shallowRef(360)
const nudgeX = shallowRef(0)
const nudgeY = shallowRef(0)
const surfaceHeight = shallowRef(
  clampTrackpadHeight(
    parseTrackpadHeight(localStorage.getItem(TRACKPAD_HEIGHT_KEY)) ?? TRACKPAD_SURFACE_DEFAULT,
    480,
  ),
)

let buttons = 0
let activeId: number | null = null
let originX = 0
let originY = 0
let lastX = 0
let lastY = 0
let moved = false
let pinched = false
let padHeldLeft = false
let holdTimer = 0
let keyPointer: { id: number; bit: 'left' | 'right'; lastX: number; lastY: number } | null = null
const padPointers = new Map<number, { x: number; y: number }>()
let pinch: { a: number; b: number; startDist: number; startSize: number } | null = null
let chromeObserver: ResizeObserver | undefined
const extra = new Map<number, { y: number }>()
let hudGrab: OverlayPoint = { x: 0, y: 0 }
let hudHandle: HTMLElement | null = null
let hudPointerId: number | null = null
let resize:
  | {
      corner: OverlayResizeCorner
      id: number
      start: OverlayPoint & { width: number; height: number }
      chromeExtra: number
    }
  | null = null
const resizeCorners: OverlayResizeCorner[] = ['nw', 'ne', 'se', 'sw']

const overlayStyle = computed(() => {
  const style: Record<string, string> = {
    left: `${posX.value}px`,
    top: `${posY.value}px`,
    '--knob': `${stickSize.value}px`,
  }
  if (!minimized.value) style.width = `${panelWidth.value}px`
  return style
})

const knobCapStyle = computed(() => ({
  transform: `translate(${nudgeX.value}px, ${nudgeY.value}px)`,
}))

function publishButtons() {
  emit('buttons', buttons)
}

function setButton(bit: number, down: boolean) {
  if (down) buttons |= bit
  else buttons &= ~bit
  leftDown.value = Boolean(buttons & MOUSE_BUTTON_LEFT)
  rightDown.value = Boolean(buttons & MOUSE_BUTTON_RIGHT)
  publishButtons()
}

function pressLeft(down: boolean) {
  setButton(MOUSE_BUTTON_LEFT, down)
}

function pressRight(down: boolean) {
  setButton(MOUSE_BUTTON_RIGHT, down)
}

function clearHold() {
  if (!holdTimer) return
  window.clearTimeout(holdTimer)
  holdTimer = 0
}

function latchPadPress() {
  holdTimer = 0
  if (
    !latchPadPressAllowed(
      moved || Boolean(pinch),
      extra.size + (pinch ? 1 : 0),
      Boolean(buttons & MOUSE_BUTTON_LEFT) || padHeldLeft,
    )
  ) return
  padHeldLeft = true
  pressLeft(true)
}

function capturePointer(event: PointerEvent) {
  const target = event.currentTarget
  if (!(target instanceof HTMLElement)) return
  try {
    target.setPointerCapture(event.pointerId)
  } catch {
    // Best-effort.
  }
}

function look(dx: number, dy: number) {
  const scaled = scaledTrackpadDelta(dx, dy)
  if (!scaled.dx && !scaled.dy) return
  emit('look', scaled.dx, scaled.dy)
}

function hostRect() {
  const parent = overlay.value?.offsetParent
  const box = parent instanceof HTMLElement ? parent.getBoundingClientRect() : null
  return overlayDragHostRect(box, box, { width: window.innerWidth, height: window.innerHeight })
}

function panelSize() {
  const el = overlay.value
  if (!el) return null
  const width = minimized.value ? el.offsetWidth : panelWidth.value
  const height = el.offsetHeight
  if (width <= 0 || height <= 0) return null
  return { width, height }
}

function chromeExtra() {
  const el = overlay.value
  if (!el) return 108
  return Math.max(48, el.offsetHeight - surfaceHeight.value)
}

function hudPercent() {
  return minimized.value
    ? { x: stickX.value, y: stickY.value }
    : { x: panelX.value, y: panelY.value }
}

function persistSurface() {
  localStorage.setItem(TRACKPAD_HEIGHT_KEY, String(surfaceHeight.value))
}

function persistHudPosition() {
  const size = panelSize()
  if (!size) return
  const percent = overlayPositionToPercent({ x: posX.value, y: posY.value }, size, hostRect())
  if (minimized.value) setStickPosition(percent.x, percent.y)
  else setPanelPosition(percent.x, percent.y)
}

function applyHudPosition() {
  const el = overlay.value
  if (!el) return
  const host = hostRect()
  if (!minimized.value) {
    panelWidth.value = clampTrackpadPanelWidth(
      savedPanelWidth.value ?? trackpadPanelWidth(host.width),
      host.width,
    )
    const extra = chromeExtra()
    const maxSurface = Math.max(TRACKPAD_SURFACE_MIN, host.height - extra - 16)
    surfaceHeight.value = clampTrackpadHeight(surfaceHeight.value, maxSurface)
  }
  const size = panelSize()
  if (!size) return
  const next = overlayPercentToPosition(hudPercent(), size, host)
  posX.value = next.x
  posY.value = next.y
  placed.value = true
}

function publishChrome() {
  const el = overlay.value
  if (!(el instanceof HTMLElement)) return
  emit('chrome', el.getBoundingClientRect().height)
}

function interacting() {
  return dragging.value || resize != null
}

function resetPad() {
  activeId = null
  extra.clear()
  padPointers.clear()
  pinch = null
  pinched = false
  keyPointer = null
  padHeldLeft = false
  clearHold()
  nudgeX.value = 0
  nudgeY.value = 0
  if (!buttons) return
  buttons = 0
  leftDown.value = false
  rightDown.value = false
  publishButtons()
}

function finishPad(event: PointerEvent) {
  if (event.pointerId !== activeId) return
  activeId = null
  clearHold()
  nudgeX.value = 0
  nudgeY.value = 0
  const kind = pinched ? 'idle' : padReleaseKind(moved, padHeldLeft)
  padHeldLeft = false
  pinched = false
  pinch = null
  if (kind === 'release-press') pressLeft(false)
  else if (kind === 'tap') emit('tap')
}

function onGlobalPointerEnd(event: PointerEvent) {
  padPointers.delete(event.pointerId)
  extra.delete(event.pointerId)
  if (pinch && (event.pointerId === pinch.a || event.pointerId === pinch.b)) pinch = null
  if (keyPointer?.id === event.pointerId) {
    const bit = keyPointer.bit
    keyPointer = null
    if (bit === 'left') pressLeft(false)
    else pressRight(false)
    return
  }
  if (event.pointerId === activeId) finishPad(event)
}

function onPageHidden() {
  if (document.visibilityState === 'hidden') resetPad()
}

function onPadDown(event: PointerEvent) {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  event.preventDefault()
  capturePointer(event)
  padPointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  if (activeId !== null && event.pointerId !== activeId) {
    clearHold()
    if (padHeldLeft) {
      padHeldLeft = false
      pressLeft(false)
    }
    if (minimized.value) {
      const first = padPointers.get(activeId)
      const second = padPointers.get(event.pointerId)
      if (first && second) {
        pinch = {
          a: activeId,
          b: event.pointerId,
          startDist: Math.hypot(first.x - second.x, first.y - second.y),
          startSize: stickSize.value,
        }
        pinched = true
      }
      return
    }
    if (extraFingerScrolls(buttons)) extra.set(event.pointerId, { y: event.clientY })
    return
  }
  activeId = event.pointerId
  originX = lastX = event.clientX
  originY = lastY = event.clientY
  moved = false
  pinched = false
  padHeldLeft = false
  clearHold()
  if (!buttons) holdTimer = window.setTimeout(latchPadPress, trackpadHoldMs(event.pointerType))
}

function updateKnobNudge(event: PointerEvent) {
  if (!minimized.value) return
  const knob = event.currentTarget
  if (!(knob instanceof HTMLElement)) return
  const rect = knob.getBoundingClientRect()
  const next = trackpadKnobNudge(
    event.clientX - (rect.left + rect.width / 2),
    event.clientY - (rect.top + rect.height / 2),
    rect.width * TRACKPAD_STICK_NUDGE,
  )
  nudgeX.value = next.x
  nudgeY.value = next.y
}

function onPadMove(event: PointerEvent) {
  padPointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  if (pinch) {
    event.preventDefault()
    const first = padPointers.get(pinch.a)
    const second = padPointers.get(pinch.b)
    if (!first || !second) return
    setStickSize(trackpadPinchSize(
      pinch.startSize,
      pinch.startDist,
      Math.hypot(first.x - second.x, first.y - second.y),
    ))
    return
  }
  if (extra.has(event.pointerId)) {
    event.preventDefault()
    const previous = extra.get(event.pointerId)
    if (!previous) return
    const delta = event.clientY - previous.y
    extra.set(event.pointerId, { y: event.clientY })
    if (Math.abs(delta) >= 1) emit('wheel', -Math.sign(delta))
    return
  }
  if (event.pointerId !== activeId || extra.size > 0) return
  event.preventDefault()
  const dx = event.clientX - lastX
  const dy = event.clientY - lastY
  lastX = event.clientX
  lastY = event.clientY
  if (!moved && trackpadPointerMoved(originX, originY, event.clientX, event.clientY, trackpadTapSlop(event.pointerType))) {
    moved = true
    if (!padHeldLeft) clearHold()
  }
  updateKnobNudge(event)
  if (moved) look(dx, dy)
}

function onPadUp(event: PointerEvent) {
  padPointers.delete(event.pointerId)
  if (pinch && (event.pointerId === pinch.a || event.pointerId === pinch.b)) {
    pinch = null
    return
  }
  if (extra.delete(event.pointerId)) return
  finishPad(event)
}

function onButtonDown(bit: 'left' | 'right', event: PointerEvent) {
  event.preventDefault()
  event.stopPropagation()
  capturePointer(event)
  keyPointer = { id: event.pointerId, bit, lastX: event.clientX, lastY: event.clientY }
  if (bit === 'left') pressLeft(true)
  else pressRight(true)
}

function onButtonMove(event: PointerEvent) {
  if (!keyPointer || event.pointerId !== keyPointer.id) return
  event.preventDefault()
  const dx = event.clientX - keyPointer.lastX
  const dy = event.clientY - keyPointer.lastY
  keyPointer.lastX = event.clientX
  keyPointer.lastY = event.clientY
  look(dx, dy)
}

function onButtonUp(bit: 'left' | 'right', event: PointerEvent) {
  event.preventDefault()
  event.stopPropagation()
  if (keyPointer?.id === event.pointerId) keyPointer = null
  if (bit === 'left') pressLeft(false)
  else pressRight(false)
}

function onHudDown(event: PointerEvent) {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  if (!overlay.value) return
  const handle = event.currentTarget
  if (!(handle instanceof HTMLElement)) return
  event.preventDefault()
  capturePointer(event)
  hudGrab = overlayGrabOffset(event.clientX, event.clientY, overlay.value.getBoundingClientRect())
  dragging.value = true
  hudHandle = handle
  hudPointerId = event.pointerId
  window.addEventListener('pointermove', onHudMove)
  window.addEventListener('pointerup', onHudUp)
  window.addEventListener('pointercancel', onHudUp)
}

function onHudMove(event: PointerEvent) {
  if (!dragging.value || event.pointerId !== hudPointerId) return
  const size = panelSize()
  if (!size) return
  event.preventDefault()
  const next = clampOverlayPosition(
    overlayPointerPosition(event.clientX, event.clientY, hostRect(), hudGrab),
    size,
    hostRect(),
  )
  posX.value = next.x
  posY.value = next.y
}

function onHudUp() {
  if (!dragging.value) return
  dragging.value = false
  if (hudHandle && hudPointerId != null && hudHandle.hasPointerCapture(hudPointerId)) {
    hudHandle.releasePointerCapture(hudPointerId)
  }
  hudHandle = null
  hudPointerId = null
  window.removeEventListener('pointermove', onHudMove)
  window.removeEventListener('pointerup', onHudUp)
  window.removeEventListener('pointercancel', onHudUp)
  persistHudPosition()
}

function onResizeDown(corner: OverlayResizeCorner, event: PointerEvent) {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  const el = overlay.value
  if (!el) return
  event.preventDefault()
  event.stopPropagation()
  capturePointer(event)
  resize = {
    corner,
    id: event.pointerId,
    start: {
      x: posX.value,
      y: posY.value,
      width: panelWidth.value,
      height: el.offsetHeight,
    },
    chromeExtra: chromeExtra(),
  }
  dragging.value = true
}

function onResizeMove(event: PointerEvent) {
  if (!resize || event.pointerId !== resize.id) return
  event.preventDefault()
  const host = hostRect()
  const box = resizeAnchoredBox(
    resize.corner,
    event.clientX - host.left,
    event.clientY - host.top,
    resize.start,
    TRACKPAD_PANEL_MIN_WIDTH,
    resize.chromeExtra + TRACKPAD_SURFACE_MIN,
    host,
  )
  posX.value = box.x
  posY.value = box.y
  panelWidth.value = box.width
  surfaceHeight.value = clampTrackpadHeight(box.height - resize.chromeExtra, host.height)
}

function onResizeUp(event: PointerEvent) {
  if (!resize || event.pointerId !== resize.id) return
  resize = null
  dragging.value = false
  setPanelWidth(panelWidth.value)
  persistSurface()
  persistHudPosition()
}

function minimize() {
  resetPad()
  setMinimized(true)
}

function expand() {
  resetPad()
  setMinimized(false)
}

function onViewportResize() {
  applyHudPosition()
}

watch(
  () => [minimized.value, stickSize.value, stickX.value, stickY.value, panelX.value, panelY.value, savedPanelWidth.value],
  async () => {
    if (interacting()) return
    await nextTick()
    applyHudPosition()
  },
)

function syncTouchUi(event?: MediaQueryListEvent) {
  touchUi.value = event?.matches ?? Boolean(pointerMedia?.matches)
}

onMounted(() => {
  if (!overlay.value) return
  chromeObserver = new ResizeObserver(publishChrome)
  chromeObserver.observe(overlay.value)
  void nextTick(() => {
    applyHudPosition()
    publishChrome()
  })
  pointerMedia = window.matchMedia(COARSE_POINTER_QUERY)
  touchUi.value = pointerMedia.matches
  pointerMedia.addEventListener('change', syncTouchUi)
  window.addEventListener('resize', onViewportResize)
  window.addEventListener('pointerup', onGlobalPointerEnd, true)
  window.addEventListener('pointercancel', onGlobalPointerEnd, true)
  window.addEventListener('blur', resetPad)
  document.addEventListener('visibilitychange', onPageHidden)
  emit('buttons', 0)
})

onBeforeUnmount(() => {
  chromeObserver?.disconnect()
  pointerMedia?.removeEventListener('change', syncTouchUi)
  window.removeEventListener('resize', onViewportResize)
  window.removeEventListener('pointerup', onGlobalPointerEnd, true)
  window.removeEventListener('pointercancel', onGlobalPointerEnd, true)
  window.removeEventListener('blur', resetPad)
  document.removeEventListener('visibilitychange', onPageHidden)
  onHudUp()
  resize = null
  resetPad()
})
</script>

<template>
  <section
    ref="overlay"
    class="trackpad-overlay"
    :class="{ 'is-minimized': minimized, 'is-placed': placed, 'is-dragging': dragging, 'is-touch': touchUi }"
    :style="overlayStyle"
    role="group"
    :aria-label="t('mouse.trackpad', 'Trackpad')"
  >
    <template v-if="!minimized">
      <header
        class="trackpad-overlay-header"
        :aria-label="t('mouse.moveTrackpad', 'Move trackpad')"
        @pointerdown="onHudDown"
      >
        <strong>{{ t('mouse.trackpad', 'Trackpad') }}</strong>
        <div class="trackpad-overlay-actions" @pointerdown.stop>
          <n-popover
            trigger="click"
            placement="top-end"
            :to="overlayTo"
            :show-arrow="true"
            :z-index="5000"
            class="trackpad-help-popover"
          >
            <template #trigger>
              <button
                type="button"
                class="trackpad-overlay-help"
                :aria-label="t('mouse.trackpadHelp', 'Trackpad help')"
              >
                <CircleQuestionMark :size="18" />
              </button>
            </template>
            <p class="trackpad-help-copy">
              {{ t('mouse.trackpadHint', 'Drag the title to move. Drag a corner to resize. Hold a button or long-press to drag. Minimize for the joystick. Pinch the picture to zoom.') }}
            </p>
          </n-popover>
          <button
            type="button"
            class="trackpad-overlay-help"
            :aria-label="t('mouse.minimizeTrackpad', 'Minimize trackpad')"
            @click="minimize"
          >
            <Minus :size="18" />
          </button>
          <button
            type="button"
            class="trackpad-overlay-close"
            :aria-label="t('mouse.closeTrackpad', 'Close trackpad')"
            @click="emit('close')"
          >
            <X :size="18" />
          </button>
        </div>
      </header>
      <div
        class="trackpad-surface"
        :style="{ height: `${surfaceHeight}px` }"
        @pointerdown="onPadDown"
        @pointermove="onPadMove"
        @pointerup="onPadUp"
        @pointercancel="onPadUp"
        @lostpointercapture="onPadUp"
      />
      <div class="trackpad-keys">
        <button
          type="button"
          class="trackpad-key"
          :class="{ 'is-down': leftDown }"
          @pointerdown="onButtonDown('left', $event)"
          @pointermove="onButtonMove"
          @pointerup="onButtonUp('left', $event)"
          @pointercancel="onButtonUp('left', $event)"
          @lostpointercapture="onButtonUp('left', $event)"
        >
          {{ t('mouse.leftButton', 'Left') }}
        </button>
        <button
          type="button"
          class="trackpad-key"
          :class="{ 'is-down': rightDown }"
          @pointerdown="onButtonDown('right', $event)"
          @pointermove="onButtonMove"
          @pointerup="onButtonUp('right', $event)"
          @pointercancel="onButtonUp('right', $event)"
          @lostpointercapture="onButtonUp('right', $event)"
        >
          {{ t('mouse.rightButton', 'Right') }}
        </button>
      </div>
      <button
        v-for="corner in resizeCorners"
        :key="corner"
        type="button"
        class="trackpad-resize-corner"
        :class="`is-${corner}`"
        :aria-label="t('mouse.resizeTrackpad', 'Resize trackpad')"
        @pointerdown="onResizeDown(corner, $event)"
        @pointermove="onResizeMove"
        @pointerup="onResizeUp"
        @pointercancel="onResizeUp"
      />
    </template>
    <div v-else class="trackpad-joystick">
      <div
        class="trackpad-joystick-chrome"
        :aria-label="t('mouse.moveTrackpad', 'Move trackpad')"
        @pointerdown="onHudDown"
      >
        <button
          type="button"
          class="trackpad-overlay-help"
          :aria-label="t('mouse.expandTrackpad', 'Expand trackpad')"
          @pointerdown.stop
          @click="expand"
        >
          <Maximize :size="16" />
        </button>
      </div>
      <div class="trackpad-joystick-body">
        <div
          class="trackpad-knob"
          :aria-label="t('mouse.trackpad', 'Trackpad')"
          @pointerdown="onPadDown"
          @pointermove="onPadMove"
          @pointerup="onPadUp"
          @pointercancel="onPadUp"
          @lostpointercapture="onPadUp"
        >
          <span class="trackpad-knob-cap" :style="knobCapStyle" />
        </div>
      </div>
      <div class="trackpad-joystick-keys">
        <button
          type="button"
          class="trackpad-joystick-key"
          :class="{ 'is-down': leftDown }"
          :aria-label="t('mouse.leftButton', 'Left')"
          @pointerdown="onButtonDown('left', $event)"
          @pointermove="onButtonMove"
          @pointerup="onButtonUp('left', $event)"
          @pointercancel="onButtonUp('left', $event)"
          @lostpointercapture="onButtonUp('left', $event)"
        >
          {{ t('mouse.leftButton', 'Left') }}
        </button>
        <button
          type="button"
          class="trackpad-joystick-key"
          :class="{ 'is-down': rightDown }"
          :aria-label="t('mouse.rightButton', 'Right')"
          @pointerdown="onButtonDown('right', $event)"
          @pointermove="onButtonMove"
          @pointerup="onButtonUp('right', $event)"
          @pointercancel="onButtonUp('right', $event)"
          @lostpointercapture="onButtonUp('right', $event)"
        >
          {{ t('mouse.rightButton', 'Right') }}
        </button>
      </div>
    </div>
  </section>
</template>
