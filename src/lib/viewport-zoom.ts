export const VIEWPORT_ZOOM_MIN = 1
export const VIEWPORT_ZOOM_MAX = 4

export type ViewportView = {
  scale: number
  x: number
  y: number
}

export const IDENTITY_VIEW: ViewportView = { scale: 1, x: 0, y: 0 }

export function clampZoom(scale: number) {
  if (!Number.isFinite(scale)) return VIEWPORT_ZOOM_MIN
  return Math.min(VIEWPORT_ZOOM_MAX, Math.max(VIEWPORT_ZOOM_MIN, scale))
}

export function distance(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(bx - ax, by - ay)
}

export function midpoint(ax: number, ay: number, bx: number, by: number) {
  return { x: (ax + bx) / 2, y: (ay + by) / 2 }
}

export function zoomAround(view: ViewportView, nextScale: number, focalX: number, focalY: number): ViewportView {
  const scale = clampZoom(nextScale)
  if (view.scale <= 0) return { scale, x: focalX, y: focalY }
  const contentX = (focalX - view.x) / view.scale
  const contentY = (focalY - view.y) / view.scale
  return {
    scale,
    x: focalX - contentX * scale,
    y: focalY - contentY * scale,
  }
}

export function clampPan(view: ViewportView, stageWidth: number, stageHeight: number): ViewportView {
  const scale = clampZoom(view.scale)
  if (scale <= 1 || stageWidth <= 0 || stageHeight <= 0) return { ...IDENTITY_VIEW }
  const minX = stageWidth * (1 - scale)
  const minY = stageHeight * (1 - scale)
  return {
    scale,
    x: Math.min(0, Math.max(minX, view.x)),
    y: Math.min(0, Math.max(minY, view.y)),
  }
}

export function panBy(view: ViewportView, dx: number, dy: number, stageWidth: number, stageHeight: number) {
  return clampPan({ scale: view.scale, x: view.x + dx, y: view.y + dy }, stageWidth, stageHeight)
}

export function viewportTransform(view: ViewportView) {
  if (view.scale <= 1 && view.x === 0 && view.y === 0) return undefined
  return `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`
}

export function containFittedSize(
  sourceWidth: number,
  sourceHeight: number,
  boxWidth: number,
  boxHeight: number,
) {
  if (sourceWidth <= 0 || sourceHeight <= 0 || boxWidth <= 0 || boxHeight <= 0) {
    return { width: Math.max(0, boxWidth), height: Math.max(0, boxHeight) }
  }
  const sourceRatio = sourceWidth / sourceHeight
  const boxRatio = boxWidth / boxHeight
  if (sourceRatio > boxRatio) return { width: boxWidth, height: boxWidth / sourceRatio }
  return { width: boxHeight * sourceRatio, height: boxHeight }
}

export function oneToOneZoom(
  sourceWidth: number,
  sourceHeight: number,
  stageWidth: number,
  stageHeight: number,
) {
  const fitted = containFittedSize(sourceWidth, sourceHeight, stageWidth, stageHeight)
  if (fitted.width <= 0) return VIEWPORT_ZOOM_MIN
  return clampZoom(sourceWidth / fitted.width)
}

export function viewOverflows(scale: number) {
  return clampZoom(scale) > 1.001
}

export type ContentPoint = { x: number; y: number }

export function contentPointFromScreen(view: ViewportView, screenX: number, screenY: number): ContentPoint {
  const scale = view.scale <= 0 ? 1 : view.scale
  return {
    x: (screenX - view.x) / scale,
    y: (screenY - view.y) / scale,
  }
}

export function cursorToScreen(view: ViewportView, cursor: ContentPoint) {
  return {
    x: view.x + cursor.x * view.scale,
    y: view.y + cursor.y * view.scale,
  }
}

export function clampContentCursor(
  cursor: ContentPoint,
  contentWidth: number,
  contentHeight: number,
): ContentPoint {
  return {
    x: Math.min(contentWidth, Math.max(0, cursor.x)),
    y: Math.min(contentHeight, Math.max(0, cursor.y)),
  }
}

export function viewForCursor(
  cursor: ContentPoint,
  scale: number,
  stageWidth: number,
  stageHeight: number,
  centerX = stageWidth / 2,
  centerY = stageHeight / 2,
) {
  return clampPan({
    scale,
    x: centerX - cursor.x * scale,
    y: centerY - cursor.y * scale,
  }, stageWidth, stageHeight)
}

export function nudgeContentCursor(
  cursor: ContentPoint,
  dx: number,
  dy: number,
  scale: number,
  contentWidth: number,
  contentHeight: number,
) {
  const zoom = scale <= 0 ? 1 : scale
  return clampContentCursor(
    { x: cursor.x + dx / zoom, y: cursor.y + dy / zoom },
    contentWidth,
    contentHeight,
  )
}
