<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { GripVertical } from '@/icons'

import { t } from '@/i18n/runtime'
import { MOUSE_BUTTON_LEFT, MOUSE_BUTTON_RIGHT } from '@/lib/hid-mouse'
import {
  clampOverlayPosition,
  overlayGrabOffset,
  overlayPercentToPosition,
  overlayPlaceBottomCenter,
  overlayPositionToPercent,
  type OverlayBox,
  type OverlayPoint,
} from '@/lib/overlay-drag'
import { parseTouchButtonsPosition, TOUCH_BUTTONS_POSITION_KEY } from '@/lib/touchscreen'

// Left and right mouse buttons floating over the Relative-mode touchpad.
// Holding one keeps the button pressed, and sliding on it moves the pointer;
// the grip moves the buttons, and where they sit is kept on this browser.

const emit = defineEmits<{
  button: [bit: number, down: boolean]
  move: [dx: number, dy: number]
}>()

const root = ref<HTMLElement | null>(null)
const position = shallowRef<OverlayPoint | null>(null)
const pressed = ref(0)
const keys = new Map<number, { bit: number; x: number; y: number }>()
let grab: { id: number; offset: OverlayPoint } | null = null
let percent = readPercent()
let observer: ResizeObserver | undefined

function readPercent() {
  try {
    return parseTouchButtonsPosition(localStorage.getItem(TOUCH_BUTTONS_POSITION_KEY))
  } catch {
    return null
  }
}

function boxes(): { host: OverlayBox; panel: { width: number; height: number } } | null {
  const el = root.value
  const parent = el?.parentElement
  if (!el || !parent) return null
  const rect = parent.getBoundingClientRect()
  return {
    host: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    panel: { width: el.offsetWidth, height: el.offsetHeight },
  }
}

function place() {
  const box = boxes()
  if (!box || box.host.width <= 0 || box.host.height <= 0) return
  position.value = percent
    ? overlayPercentToPosition(percent, box.panel, box.host)
    : overlayPlaceBottomCenter(box.panel, box.host)
}

function capture(event: PointerEvent) {
  try {
    (event.currentTarget as HTMLElement | null)?.setPointerCapture(event.pointerId)
  } catch {
    // Capture is best-effort; the button still tracks its own pointer.
  }
}

function keyDown(bit: number, event: PointerEvent) {
  event.preventDefault()
  if (keys.has(event.pointerId) || pressed.value & bit) return
  capture(event)
  keys.set(event.pointerId, { bit, x: event.clientX, y: event.clientY })
  pressed.value |= bit
  emit('button', bit, true)
}

function keyMove(event: PointerEvent) {
  const key = keys.get(event.pointerId)
  if (!key) return
  event.preventDefault()
  const dx = event.clientX - key.x
  const dy = event.clientY - key.y
  key.x = event.clientX
  key.y = event.clientY
  emit('move', dx, dy)
}

function keyUp(event: PointerEvent) {
  const key = keys.get(event.pointerId)
  if (!key) return
  event.preventDefault()
  keys.delete(event.pointerId)
  pressed.value &= ~key.bit
  emit('button', key.bit, false)
}

function gripDown(event: PointerEvent) {
  if (!root.value || grab) return
  event.preventDefault()
  capture(event)
  grab = {
    id: event.pointerId,
    offset: overlayGrabOffset(event.clientX, event.clientY, root.value.getBoundingClientRect()),
  }
}

function gripMove(event: PointerEvent) {
  if (grab?.id !== event.pointerId) return
  event.preventDefault()
  const box = boxes()
  if (!box) return
  position.value = clampOverlayPosition(
    {
      x: event.clientX - box.host.left - grab.offset.x,
      y: event.clientY - box.host.top - grab.offset.y,
    },
    box.panel,
    box.host,
  )
}

function gripUp(event: PointerEvent) {
  if (grab?.id !== event.pointerId) return
  grab = null
  const box = boxes()
  if (!box || !position.value) return
  percent = overlayPositionToPercent(position.value, box.panel, box.host)
  try {
    localStorage.setItem(TOUCH_BUTTONS_POSITION_KEY, JSON.stringify(percent))
  } catch {
    // The position lasts for this page only.
  }
}

onMounted(() => {
  place()
  const parent = root.value?.parentElement
  if (parent && typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => place())
    observer.observe(parent)
  }
})

onBeforeUnmount(() => {
  observer?.disconnect()
  for (const key of keys.values()) emit('button', key.bit, false)
  keys.clear()
})
</script>

<template>
  <div
    ref="root"
    class="touch-mouse-buttons"
    :class="{ 'is-placed': position }"
    :style="position ? { left: `${position.x}px`, top: `${position.y}px` } : undefined"
    @contextmenu.prevent
  >
    <button
      type="button"
      class="touch-mouse-grip"
      :aria-label="t('mouse.moveButtons', 'Move buttons')"
      @pointerdown="gripDown"
      @pointermove="gripMove"
      @pointerup="gripUp"
      @pointercancel="gripUp"
    >
      <GripVertical :size="18" />
    </button>
    <button
      type="button"
      class="trackpad-key"
      :class="{ 'is-down': pressed & MOUSE_BUTTON_LEFT }"
      @pointerdown="keyDown(MOUSE_BUTTON_LEFT, $event)"
      @pointermove="keyMove"
      @pointerup="keyUp"
      @pointercancel="keyUp"
      @lostpointercapture="keyUp"
    >
      {{ t('mouse.leftButton', 'Left') }}
    </button>
    <button
      type="button"
      class="trackpad-key"
      :class="{ 'is-down': pressed & MOUSE_BUTTON_RIGHT }"
      @pointerdown="keyDown(MOUSE_BUTTON_RIGHT, $event)"
      @pointermove="keyMove"
      @pointerup="keyUp"
      @pointercancel="keyUp"
      @lostpointercapture="keyUp"
    >
      {{ t('mouse.rightButton', 'Right') }}
    </button>
  </div>
</template>

<style scoped>
.touch-mouse-buttons {
  position: absolute;
  z-index: 4;
  display: flex;
  gap: 6px;
  padding: 6px;
  border: 1px solid var(--onekvm-glass-border);
  border-radius: 14px;
  background: var(--onekvm-glass-bg);
  box-shadow: var(--onekvm-shadow-popover);
  backdrop-filter: blur(18px) saturate(140%);
  -webkit-backdrop-filter: blur(18px) saturate(140%);
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

.touch-mouse-buttons:not(.is-placed) {
  visibility: hidden;
}

.touch-mouse-buttons .trackpad-key {
  min-width: 76px;
}

.touch-mouse-grip {
  display: flex;
  width: 32px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--muted-foreground);
  cursor: grab;
  touch-action: none;
}

.touch-mouse-grip:active {
  cursor: grabbing;
}
</style>
