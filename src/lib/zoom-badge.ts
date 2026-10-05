export const ZOOM_BADGE_SCALE_MIN = 1.01
export const ZOOM_BADGE_HIDE_MS = 2500

export function zoomBadgeVisible(
  scale: number,
  interacting: boolean,
  idleMs: number,
  hideAfterMs = ZOOM_BADGE_HIDE_MS,
) {
  if (scale <= ZOOM_BADGE_SCALE_MIN) return false
  if (interacting) return true
  return idleMs < hideAfterMs
}
