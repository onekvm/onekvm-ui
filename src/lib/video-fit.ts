export type VideoFit = 'original' | 'stretch'

export const VIDEO_FIT_KEY = 'onekvm-video-fit'

export function parseVideoFit(value: string | null | undefined): VideoFit {
  return value === 'stretch' ? 'stretch' : 'original'
}

export function mapAbsoluteMouse(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  sourceWidth: number,
  sourceHeight: number,
  fit: VideoFit,
): { inside: boolean; x: number; y: number } {
  let left = rect.left
  let top = rect.top
  let renderedWidth = rect.width
  let renderedHeight = rect.height
  if (fit !== 'stretch' && sourceWidth > 0 && sourceHeight > 0 &&
      rect.width > 0 && rect.height > 0) {
    const sourceRatio = sourceWidth / sourceHeight
    const boxRatio = rect.width / rect.height
    renderedWidth = sourceRatio > boxRatio ? rect.width : rect.height * sourceRatio
    renderedHeight = sourceRatio > boxRatio ? rect.width / sourceRatio : rect.height
    left = rect.left + (rect.width - renderedWidth) / 2
    top = rect.top + (rect.height - renderedHeight) / 2
  }
  const normalizedX = renderedWidth > 0 ? (clientX - left) / renderedWidth : 0
  const normalizedY = renderedHeight > 0 ? (clientY - top) / renderedHeight : 0
  const inside = normalizedX >= 0 && normalizedX <= 1 && normalizedY >= 0 && normalizedY <= 1
  return {
    inside,
    x: 1 + Math.round(Math.max(0, Math.min(1, normalizedX)) * 0x7ffe),
    y: 1 + Math.round(Math.max(0, Math.min(1, normalizedY)) * 0x7ffe),
  }
}
