export const TRACKPAD_TAP_SLOP = 10
export const TRACKPAD_TOUCH_TAP_SLOP = 18
export const TRACKPAD_HOLD_MS = 220
export const TRACKPAD_TOUCH_HOLD_MS = 280
export const TRACKPAD_GAIN = 1.35

export function trackpadTapSlop(pointerType: string) {
  return pointerType === 'touch' || pointerType === 'pen' ? TRACKPAD_TOUCH_TAP_SLOP : TRACKPAD_TAP_SLOP
}

export function trackpadHoldMs(pointerType: string) {
  return pointerType === 'touch' || pointerType === 'pen' ? TRACKPAD_TOUCH_HOLD_MS : TRACKPAD_HOLD_MS
}

export function trackpadPointerMoved(
  originX: number,
  originY: number,
  x: number,
  y: number,
  slop = TRACKPAD_TAP_SLOP,
) {
  return Math.hypot(x - originX, y - originY) >= slop
}

export function extraFingerScrolls(buttons: number) {
  return buttons === 0
}

export function latchPadPressAllowed(
  moved: boolean,
  extraFingers: number,
  leftAlreadyDown: boolean,
) {
  return !moved && extraFingers === 0 && !leftAlreadyDown
}

export function padReleaseKind(moved: boolean, padHeldLeft: boolean): 'tap' | 'release-press' | 'idle' {
  if (padHeldLeft) return 'release-press'
  if (!moved) return 'tap'
  return 'idle'
}

export function scaledTrackpadDelta(dx: number, dy: number, gain = TRACKPAD_GAIN) {
  return { dx: dx * gain, dy: dy * gain }
}

export const TRACKPAD_HEIGHT_KEY = 'onekvm-trackpad-height'
export const TRACKPAD_MINIMIZED_KEY = 'onekvm-trackpad-minimized'
export const TRACKPAD_STICK_SIZE_KEY = 'onekvm-trackpad-stick-size'
export const TRACKPAD_STICK_X_KEY = 'onekvm-trackpad-stick-x'
export const TRACKPAD_STICK_Y_KEY = 'onekvm-trackpad-stick-y'
export const TRACKPAD_PANEL_X_KEY = 'onekvm-trackpad-panel-x'
export const TRACKPAD_PANEL_Y_KEY = 'onekvm-trackpad-panel-y'
export const TRACKPAD_PANEL_WIDTH_KEY = 'onekvm-trackpad-panel-width'
export const TRACKPAD_SURFACE_MIN = 88
export const TRACKPAD_SURFACE_DEFAULT = 220
export const TRACKPAD_PANEL_MIN_WIDTH = 220
export const TRACKPAD_PANEL_MAX_WIDTH = 560
export const TRACKPAD_PANEL_NARROW = 760
export const TRACKPAD_STICK_SIZE_MIN = 64
export const TRACKPAD_STICK_SIZE_MAX = 168
export const TRACKPAD_STICK_SIZE_DEFAULT = 96
export const TRACKPAD_STICK_SIZE_TOUCH = 120
export const TRACKPAD_STICK_NUDGE = 0.28

export function parseTrackpadHeight(raw: string | null) {
  if (raw == null || raw === '') return null
  const value = Number(raw)
  if (!Number.isFinite(value)) return null
  return value
}

export function maxTrackpadSurface(viewportHeight: number) {
  return Math.max(TRACKPAD_SURFACE_MIN, Math.round(viewportHeight * 0.62) - 108)
}

export function clampTrackpadHeight(height: number, maxHeight: number) {
  const max = Math.max(TRACKPAD_SURFACE_MIN, maxHeight)
  return Math.round(Math.min(max, Math.max(TRACKPAD_SURFACE_MIN, height)))
}

export function parseTrackpadFlag(raw: string | null) {
  if (raw == null || raw === '') return null
  if (raw === '1' || raw === 'true') return true
  if (raw === '0' || raw === 'false') return false
  return null
}

export function clampTrackpadPercent(value: number) {
  if (!Number.isFinite(value)) return 50
  return Math.round(Math.min(100, Math.max(0, value)))
}

export function parseTrackpadPercent(raw: string | null) {
  const value = parseTrackpadHeight(raw)
  if (value == null) return null
  return clampTrackpadPercent(value)
}

export function clampTrackpadStickSize(size: number) {
  if (!Number.isFinite(size)) return TRACKPAD_STICK_SIZE_DEFAULT
  return Math.round(Math.min(TRACKPAD_STICK_SIZE_MAX, Math.max(TRACKPAD_STICK_SIZE_MIN, size)))
}

export function trackpadPanelWidth(hostWidth: number) {
  const inset = hostWidth <= TRACKPAD_PANEL_NARROW ? 20 : 24
  const max = hostWidth <= TRACKPAD_PANEL_NARROW ? hostWidth - inset : TRACKPAD_PANEL_MAX_WIDTH
  return Math.max(TRACKPAD_PANEL_MIN_WIDTH, Math.min(max, hostWidth - inset))
}

export function clampTrackpadPanelWidth(width: number, hostWidth: number) {
  const max = Math.max(TRACKPAD_PANEL_MIN_WIDTH, hostWidth - 16)
  return Math.round(Math.min(max, Math.max(TRACKPAD_PANEL_MIN_WIDTH, width)))
}

export function trackpadJoystickMetrics(size: number) {
  const knob = clampTrackpadStickSize(size)
  const moon = Math.round(knob * 0.5)
  const overlap = Math.round(knob * 0.1)
  return {
    knob,
    moon,
    width: moon * 2 + knob - overlap * 2,
    height: knob,
  }
}

export function trackpadKnobNudge(dx: number, dy: number, max: number) {
  const dist = Math.hypot(dx, dy)
  if (dist <= 0 || max <= 0) return { x: 0, y: 0 }
  const scale = Math.min(1, max / dist)
  return { x: dx * scale, y: dy * scale }
}

export function trackpadPinchSize(startSize: number, startDist: number, dist: number) {
  if (!(startDist > 0) || !Number.isFinite(dist)) return clampTrackpadStickSize(startSize)
  return clampTrackpadStickSize(startSize * (dist / startDist))
}

export function trackpadPlacePercent(
  clientX: number,
  clientY: number,
  pad: { left: number; top: number; width: number; height: number },
) {
  if (pad.width <= 0 || pad.height <= 0) return { x: 50, y: 50 }
  return {
    x: clampTrackpadPercent(((clientX - pad.left) / pad.width) * 100),
    y: clampTrackpadPercent(((clientY - pad.top) / pad.height) * 100),
  }
}
