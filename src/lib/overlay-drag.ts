export type OverlayPoint = { x: number; y: number }

export type OverlayBox = {
  left: number
  top: number
  width: number
  height: number
}

const VIEWPORT_MARGIN = 8

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
  const maxX = host.width - panel.width - margin
  const maxY = host.height - panel.height - margin
  return {
    x: Math.max(margin, Math.min(maxX, position.x)),
    y: Math.max(margin, Math.min(maxY, position.y)),
  }
}
