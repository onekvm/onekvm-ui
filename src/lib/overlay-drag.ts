export type OverlayPoint = { x: number; y: number }

export type OverlayBox = {
  left: number
  top: number
  width: number
  height: number
}

export const OVERLAY_DRAG_MARGIN = 8
export const OVERLAY_MIN_VISIBLE = 36
const VIEWPORT_MARGIN = OVERLAY_DRAG_MARGIN

export function overlayDragHostRect(
  offsetParent: OverlayBox | null,
  stage: OverlayBox | null,
  viewport: { width: number; height: number },
): OverlayBox {
  if (stage) return stage
  if (offsetParent) return offsetParent
  return { left: 0, top: 0, width: viewport.width, height: viewport.height }
}

export function overlayGrabOffset(
  clientX: number,
  clientY: number,
  panel: Pick<OverlayBox, 'left' | 'top'>,
): OverlayPoint {
  return { x: clientX - panel.left, y: clientY - panel.top }
}

export function overlayPointerPosition(
  clientX: number,
  clientY: number,
  host: Pick<OverlayBox, 'left' | 'top'>,
  grab: OverlayPoint,
): OverlayPoint {
  return {
    x: clientX - host.left - grab.x,
    y: clientY - host.top - grab.y,
  }
}

export function clampOverlayPosition(
  position: OverlayPoint,
  panel: Pick<OverlayBox, 'width' | 'height'>,
  host: OverlayBox,
  margin = VIEWPORT_MARGIN,
): OverlayPoint {
  const clampAxis = (value: number, panelSize: number, hostSize: number) => {
    const containedMax = hostSize - panelSize - margin
    if (containedMax >= margin) return Math.max(margin, Math.min(containedMax, value))

    // A diagnostics window can be taller than the video stage on a short
    // viewport. Keeping the usual containment bound would make max < min and
    // pin the window at the top. Let oversized windows move while preserving
    // one title-bar-sized strip inside the host so they remain recoverable.
    const reachableMax = Math.max(
      margin,
      hostSize - Math.min(panelSize, OVERLAY_MIN_VISIBLE) - margin,
    )
    return Math.max(margin, Math.min(reachableMax, value))
  }
  return {
    x: clampAxis(position.x, panel.width, host.width),
    y: clampAxis(position.y, panel.height, host.height),
  }
}

export function overlayMountHostRect(
  target: unknown,
  viewport: { width: number; height: number },
): OverlayBox {
  if (typeof HTMLElement !== 'undefined' && target instanceof HTMLElement) {
    return overlayDragHostRect(target.getBoundingClientRect(), null, viewport)
  }
  return overlayDragHostRect(null, null, viewport)
}

export function overlayPlaceBottomCenter(
  panel: Pick<OverlayBox, 'width' | 'height'>,
  host: OverlayBox,
  margin = VIEWPORT_MARGIN,
): OverlayPoint {
  return clampOverlayPosition(
    {
      x: (host.width - panel.width) / 2,
      y: host.height - panel.height - margin,
    },
    panel,
    host,
    margin,
  )
}

export function overlayAxisSpan(hostSize: number, panelSize: number, margin = VIEWPORT_MARGIN) {
  return hostSize - panelSize - margin * 2
}

export function overlayPositionToPercent(
  position: OverlayPoint,
  panel: Pick<OverlayBox, 'width' | 'height'>,
  host: OverlayBox,
  margin = VIEWPORT_MARGIN,
): OverlayPoint {
  const spanX = overlayAxisSpan(host.width, panel.width, margin)
  const spanY = overlayAxisSpan(host.height, panel.height, margin)
  return {
    x: spanX <= 0 ? 50 : ((position.x - margin) / spanX) * 100,
    y: spanY <= 0 ? 50 : ((position.y - margin) / spanY) * 100,
  }
}

export function overlayPercentToPosition(
  percent: OverlayPoint,
  panel: Pick<OverlayBox, 'width' | 'height'>,
  host: OverlayBox,
  margin = VIEWPORT_MARGIN,
): OverlayPoint {
  const spanX = Math.max(0, overlayAxisSpan(host.width, panel.width, margin))
  const spanY = Math.max(0, overlayAxisSpan(host.height, panel.height, margin))
  return clampOverlayPosition(
    {
      x: margin + (percent.x / 100) * spanX,
      y: margin + (percent.y / 100) * spanY,
    },
    panel,
    host,
    margin,
  )
}

export type OverlayResizeCorner = 'nw' | 'ne' | 'se' | 'sw'

export function resizeAnchoredBox(
  corner: OverlayResizeCorner,
  x: number,
  y: number,
  start: OverlayPoint & { width: number; height: number },
  minWidth: number,
  minHeight: number,
  host: Pick<OverlayBox, 'width' | 'height'>,
  margin = VIEWPORT_MARGIN,
): OverlayPoint & { width: number; height: number } {
  const west = corner === 'nw' || corner === 'sw'
  const north = corner === 'nw' || corner === 'ne'
  const startRight = start.x + start.width
  const startBottom = start.y + start.height
  const maxRight = host.width - margin
  const maxBottom = host.height - margin
  let left = start.x
  let top = start.y
  let right = startRight
  let bottom = startBottom
  if (west) left = Math.min(Math.max(x, margin), startRight - minWidth)
  else right = Math.max(Math.min(x, maxRight), start.x + minWidth)
  if (north) top = Math.min(Math.max(y, margin), startBottom - minHeight)
  else bottom = Math.max(Math.min(y, maxBottom), start.y + minHeight)
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  }
}
