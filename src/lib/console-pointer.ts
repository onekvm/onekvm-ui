export function storedHideLocalCursor(stored: string | null) {
  return stored !== 'false'
}

export function consolePointerCursor(
  hideLocalCursor: boolean,
  relative: boolean,
  trackpad: boolean,
  insidePicture = true,
) {
  if (trackpad) return undefined
  if (hideLocalCursor) return insidePicture ? 'none' : undefined
  if (relative) return 'crosshair'
  return undefined
}
