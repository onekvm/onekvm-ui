export const DISMISS_CONTROL_OVERLAY_EVENT = 'onekvm:dismiss-control-overlay'

export function overlayMountTarget(fullscreenElement: EventTarget | null): string | HTMLElement {
  if (typeof HTMLElement !== 'undefined' && fullscreenElement instanceof HTMLElement) {
    return fullscreenElement
  }
  return 'body'
}

export function dismissControlOverlays() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(DISMISS_CONTROL_OVERLAY_EVENT))
}
