import { readonly, shallowRef, watch } from 'vue'

import {
  TRACKPAD_MINIMIZED_KEY,
  TRACKPAD_PANEL_WIDTH_KEY,
  TRACKPAD_PANEL_X_KEY,
  TRACKPAD_PANEL_Y_KEY,
  TRACKPAD_STICK_SIZE_DEFAULT,
  TRACKPAD_STICK_SIZE_KEY,
  TRACKPAD_STICK_SIZE_TOUCH,
  TRACKPAD_STICK_X_KEY,
  TRACKPAD_STICK_Y_KEY,
  clampTrackpadPercent,
  clampTrackpadStickSize,
  parseTrackpadFlag,
  parseTrackpadHeight,
  parseTrackpadPercent,
} from '@/lib/trackpad'

function readLocal(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeLocal(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Private mode or quota.
  }
}

function createTrackpadHud() {
  const minimized = shallowRef(parseTrackpadFlag(readLocal(TRACKPAD_MINIMIZED_KEY)) === true)
  const stickSize = shallowRef(
    clampTrackpadStickSize(
      parseTrackpadHeight(readLocal(TRACKPAD_STICK_SIZE_KEY))
        ?? (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)')?.matches
          ? TRACKPAD_STICK_SIZE_TOUCH
          : TRACKPAD_STICK_SIZE_DEFAULT),
    ),
  )
  const stickX = shallowRef(parseTrackpadPercent(readLocal(TRACKPAD_STICK_X_KEY)) ?? 50)
  const stickY = shallowRef(parseTrackpadPercent(readLocal(TRACKPAD_STICK_Y_KEY)) ?? 100)
  const panelX = shallowRef(parseTrackpadPercent(readLocal(TRACKPAD_PANEL_X_KEY)) ?? 50)
  const panelY = shallowRef(parseTrackpadPercent(readLocal(TRACKPAD_PANEL_Y_KEY)) ?? 100)
  const panelWidth = shallowRef(parseTrackpadHeight(readLocal(TRACKPAD_PANEL_WIDTH_KEY)))

  watch(minimized, (value) => writeLocal(TRACKPAD_MINIMIZED_KEY, value ? '1' : '0'))
  watch(stickSize, (value) => writeLocal(TRACKPAD_STICK_SIZE_KEY, String(value)))
  watch(stickX, (value) => writeLocal(TRACKPAD_STICK_X_KEY, String(value)))
  watch(stickY, (value) => writeLocal(TRACKPAD_STICK_Y_KEY, String(value)))
  watch(panelX, (value) => writeLocal(TRACKPAD_PANEL_X_KEY, String(value)))
  watch(panelY, (value) => writeLocal(TRACKPAD_PANEL_Y_KEY, String(value)))
  watch(panelWidth, (value) => {
    if (value == null) return
    writeLocal(TRACKPAD_PANEL_WIDTH_KEY, String(value))
  })

  function setMinimized(value: boolean) {
    minimized.value = value
  }

  function setStickSize(value: number) {
    stickSize.value = clampTrackpadStickSize(value)
  }

  function setStickPosition(x: number, y: number) {
    stickX.value = clampTrackpadPercent(x)
    stickY.value = clampTrackpadPercent(y)
  }

  function setPanelPosition(x: number, y: number) {
    panelX.value = clampTrackpadPercent(x)
    panelY.value = clampTrackpadPercent(y)
  }

  function setPanelWidth(value: number) {
    panelWidth.value = Math.round(value)
  }

  return {
    minimized: readonly(minimized),
    stickSize: readonly(stickSize),
    stickX: readonly(stickX),
    stickY: readonly(stickY),
    panelX: readonly(panelX),
    panelY: readonly(panelY),
    panelWidth: readonly(panelWidth),
    setMinimized,
    setStickSize,
    setStickPosition,
    setPanelPosition,
    setPanelWidth,
  }
}

let hud: ReturnType<typeof createTrackpadHud> | null = null

export function useTrackpadHud() {
  if (!hud) hud = createTrackpadHud()
  return hud
}
