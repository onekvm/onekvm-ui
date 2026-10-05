export const IPAD_STATUS_BAR_PX = 24

export function isIpadLikeUserAgent(userAgent: string, platform: string, maxTouchPoints: number) {
  if (/iPad/i.test(userAgent)) return true
  return platform === 'MacIntel' && maxTouchPoints > 1
}

export function fullscreenTopInsetPx(input: {
  fullscreen: boolean
  safeTop: number
  visualOffsetTop: number
  ipad: boolean
}) {
  if (!input.fullscreen) return 0
  const safe = Math.max(0, input.safeTop, input.visualOffsetTop)
  if (safe > 0) return Math.ceil(safe)
  return input.ipad ? IPAD_STATUS_BAR_PX : 0
}

export function readSafeAreaTop(doc: Document = document) {
  const probe = doc.createElement('div')
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top,0px)'
  doc.body.append(probe)
  const value = Number.parseFloat(doc.defaultView?.getComputedStyle(probe).paddingTop || '0') || 0
  probe.remove()
  return value
}

export function readSafeAreaInsets(doc: Document = document) {
  const probe = doc.createElement('div')
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)'
  doc.body.append(probe)
  const style = doc.defaultView?.getComputedStyle(probe)
  const pixel = (value: string | undefined) => Number.parseFloat(value || '0') || 0
  const result = { top: pixel(style?.paddingTop), right: pixel(style?.paddingRight), bottom: pixel(style?.paddingBottom), left: pixel(style?.paddingLeft) }
  probe.remove()
  return result
}
