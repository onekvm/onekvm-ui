export type VideoFit = 'original' | 'stretch'
export type VideoRotation = 0 | 90 | 180 | 270

export const VIDEO_FIT_KEY = 'onekvm-video-fit'
export const VIDEO_ROTATION_KEY = 'onekvm-video-rotation'

export function parseVideoRotation(value: string | null | undefined): VideoRotation {
  if (value === '90' || value === '180' || value === '270') return Number(value) as VideoRotation
  return 0
}

export function rotatedVideoSize(width: number, height: number, rotation: VideoRotation) {
  return rotation === 90 || rotation === 270 ? { width: height, height: width } : { width, height }
}

// Convert movement in the displayed picture back to the host's coordinates.
export function unrotateMouseDelta(x: number, y: number, rotation: VideoRotation) {
  switch (rotation) {
    case 90: return { x: y, y: -x }
    case 180: return { x: -x, y: -y }
    case 270: return { x: -y, y: x }
    default: return { x, y }
  }
}

export function parseVideoFit(value: string | null | undefined): VideoFit {
  return value === 'original' ? 'original' : 'stretch'
}

/* Original is one encoded pixel per device pixel. CSS px * devicePixelRatio
   is the backing-store size; 1920 CSS px on a 2x display is a bilinear 2x
   upscale and smears 11px tab glyphs. */
export function originalCssSize(
  sourceWidth: number,
  sourceHeight: number,
  devicePixelRatio: number,
): { width: number; height: number } {
  const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1
  return {
    width: sourceWidth / dpr,
    height: sourceHeight / dpr,
  }
}

/* CSS box of the painted picture (letterboxed contain for stretch). */
export function paintedCssSize(
  boxWidth: number,
  boxHeight: number,
  sourceWidth: number,
  sourceHeight: number,
  fit: VideoFit,
): { width: number; height: number } {
  if (fit !== 'stretch' || sourceWidth <= 0 || sourceHeight <= 0 || boxWidth <= 0 || boxHeight <= 0) {
    return { width: boxWidth, height: boxHeight }
  }
  const sourceRatio = sourceWidth / sourceHeight
  const boxRatio = boxWidth / boxHeight
  if (sourceRatio > boxRatio) {
    return { width: boxWidth, height: boxWidth / sourceRatio }
  }
  return { width: boxHeight * sourceRatio, height: boxHeight }
}

export function canvasDeviceSize(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number,
): { width: number; height: number } {
  const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1
  return {
    width: Math.round(cssWidth * dpr),
    height: Math.round(cssHeight * dpr),
  }
}

export function formatCanvasSize(canvasWidth: number, canvasHeight: number): string {
  if (!canvasWidth || !canvasHeight) return '-'
  return `${canvasWidth} × ${canvasHeight}`
}

export function formatCanvasScale(
  canvasWidth: number,
  canvasHeight: number,
  inputWidth: number,
  inputHeight: number,
): string | undefined {
  if (!canvasWidth || !canvasHeight || !inputWidth || !inputHeight) return undefined
  const scale = Math.min(canvasWidth / inputWidth, canvasHeight / inputHeight)
  if (!Number.isFinite(scale) || Math.abs(scale - 1) <= 0.03) return undefined
  return `${scale.toFixed(2)}×`
}

export function mapAbsoluteMouse(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  sourceWidth: number,
  sourceHeight: number,
  fit: VideoFit,
  rotation: VideoRotation = 0,
): { inside: boolean; x: number; y: number } {
  let left = rect.left
  let top = rect.top
  let renderedWidth = rect.width
  let renderedHeight = rect.height
  /* Stretch fits the picture into the stage (object-fit: contain). Original
     is 1:1, so the element box is already the picture. */
  if (fit === 'stretch' && sourceWidth > 0 && sourceHeight > 0 &&
      rect.width > 0 && rect.height > 0) {
    const rotated = rotatedVideoSize(sourceWidth, sourceHeight, rotation)
    const sourceRatio = rotated.width / rotated.height
    const boxRatio = rect.width / rect.height
    renderedWidth = sourceRatio > boxRatio ? rect.width : rect.height * sourceRatio
    renderedHeight = sourceRatio > boxRatio ? rect.width / sourceRatio : rect.height
    left = rect.left + (rect.width - renderedWidth) / 2
    top = rect.top + (rect.height - renderedHeight) / 2
  }
  let normalizedX = renderedWidth > 0 ? (clientX - left) / renderedWidth : 0
  let normalizedY = renderedHeight > 0 ? (clientY - top) / renderedHeight : 0
  const inside = normalizedX >= 0 && normalizedX <= 1 && normalizedY >= 0 && normalizedY <= 1
  switch (rotation) {
    case 90: [normalizedX, normalizedY] = [normalizedY, 1 - normalizedX]; break
    case 180: [normalizedX, normalizedY] = [1 - normalizedX, 1 - normalizedY]; break
    case 270: [normalizedX, normalizedY] = [1 - normalizedY, normalizedX]; break
  }
  return {
    inside,
    x: 1 + Math.round(Math.max(0, Math.min(1, normalizedX)) * 0x7ffe),
    y: 1 + Math.round(Math.max(0, Math.min(1, normalizedY)) * 0x7ffe),
  }
}
