export const DOUBLE_TAP_ZOOM_MS = 350
export const DOUBLE_TAP_ZOOM_PX = 32
export const EDITABLE_TOUCH_SELECTOR = 'input, textarea, select, [contenteditable="true"], [contenteditable=""]'
export const PHONE_UI_MAX_WIDTH = 760
export const PHONE_UI_LANDSCAPE_MAX_HEIGHT = 500
export const PHONE_UI_LANDSCAPE_MAX_WIDTH = 1100
export const PHONE_UI_QUERY = `(max-width: ${PHONE_UI_MAX_WIDTH}px), (max-height: ${PHONE_UI_LANDSCAPE_MAX_HEIGHT}px) and (max-width: ${PHONE_UI_LANDSCAPE_MAX_WIDTH}px)`
export const COARSE_POINTER_QUERY = '(pointer: coarse)'

export function phoneUiActive(viewportWidth: number, viewportHeight = viewportWidth) {
  if (viewportWidth <= PHONE_UI_MAX_WIDTH) return true
  return viewportHeight <= PHONE_UI_LANDSCAPE_MAX_HEIGHT && viewportWidth <= PHONE_UI_LANDSCAPE_MAX_WIDTH
}

export type TapStamp = {
  t: number
  x: number
  y: number
}

export function isEditableTouchTarget(target: EventTarget | null) {
  if (target == null || typeof target !== 'object' || !('closest' in target)) return false
  const element = target as { closest: (selector: string) => unknown }
  if (typeof element.closest !== 'function') return false
  return Boolean(element.closest(EDITABLE_TOUCH_SELECTOR))
}

export function shouldAllowBrowserPinch(target: EventTarget | null) {
  if (target == null || typeof target !== 'object' || !('closest' in target)) return false
  const element = target as { closest: (selector: string) => unknown }
  if (typeof element.closest !== 'function') return false
  return Boolean(element.closest('.console-stage.is-zoomable'))
}

export function tapStampFromTouchEnd(event: Pick<TouchEvent, 'timeStamp' | 'changedTouches'>): TapStamp | null {
  const touch = event.changedTouches.item(0)
  if (!touch) return null
  return { t: event.timeStamp, x: touch.clientX, y: touch.clientY }
}

export function shouldPreventDoubleTapZoom(
  current: TapStamp,
  previous: TapStamp | null,
  editable: boolean,
) {
  if (editable || !previous) return false
  const dt = current.t - previous.t
  if (dt <= 0 || dt > DOUBLE_TAP_ZOOM_MS) return false
  return Math.hypot(current.x - previous.x, current.y - previous.y) <= DOUBLE_TAP_ZOOM_PX
}

export function lockMobileViewport(doc: Document = document) {
  const block = (event: Event) => event.preventDefault()
  let lastTap: TapStamp | null = null

  const onTouchMove = (event: TouchEvent) => {
    if (event.touches.length <= 1) return
    if (shouldAllowBrowserPinch(event.target)) return
    event.preventDefault()
  }

  const onTouchEnd = (event: TouchEvent) => {
    const stamp = tapStampFromTouchEnd(event)
    if (!stamp) return
    if (shouldPreventDoubleTapZoom(stamp, lastTap, isEditableTouchTarget(event.target))) {
      event.preventDefault()
    }
    lastTap = stamp
  }

  const onDblClick = (event: Event) => {
    if (isEditableTouchTarget(event.target)) return
    event.preventDefault()
  }

  doc.addEventListener('gesturestart', block)
  doc.addEventListener('gesturechange', block)
  doc.addEventListener('gestureend', block)
  doc.addEventListener('touchmove', onTouchMove, { passive: false })
  doc.addEventListener('touchend', onTouchEnd, { passive: false })
  doc.addEventListener('dblclick', onDblClick, true)
}
