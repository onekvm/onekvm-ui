import { PHONE_UI_QUERY, phoneUiActive } from './mobile-viewport.ts'

export type ToolbarDock = 'top' | 'right' | 'bottom' | 'left' | 'float'

export type ToolbarDockState = {
  dock: ToolbarDock
  x: number
  y: number
}

export const TOOLBAR_DOCK_KEY = 'onekvm-toolbar-dock'
export const TOOLBAR_LAUNCHER_KEY = 'onekvm-toolbar-launcher'
export const TOOLBAR_LAUNCHER_QUERY = PHONE_UI_QUERY
export const TOOLBAR_LAUNCHER_PX = 48
export const TOOLBAR_LAUNCHER_INSET_PX = 16
export const TOOLBAR_SNAP_HINT_PX = 72
export const TOOLBAR_SNAP_PX = 16
export const TOOLBAR_AUTO_HIDE_MS = 2000
export const TOOLBAR_HIDE_PEEK_PX = 3
export const TOOLBAR_LAUNCHER_HIDE_PX = 8
export const TOOLBAR_LAUNCHER_PEEK_PX = 28
export const TOOLBAR_REVEAL_HIT_PX = 20
export const TOOLBAR_DRAG_THRESHOLD_PX = 8
export const TOOLBAR_MORPH_EXPAND_MS = 420
export const TOOLBAR_MORPH_COLLAPSE_MS = 280
export const TOOLBAR_MORPH_EXPAND_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'
export const TOOLBAR_MORPH_COLLAPSE_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'
export const TOOLBAR_FLOAT_RADIUS = '6px'
export const TOOLBAR_DOCK_RADIUS = '0px'
export const TOOLBAR_FLOAT_SHADOW = '0 14px 36px rgb(0 0 0 / 45%)'
export const TOOLBAR_DOCK_SHADOW = '0 14px 36px rgb(0 0 0 / 0)'
export const TOOLBAR_MORPH_REST_TRANSFORM = 'translate3d(0px, 0px, 0px)'
export const TOOLBAR_BAR_PX = 42
export const TOOLBAR_RAIL_PX = 80

export type ToolbarBox = {
  left: number
  top: number
  width: number
  height: number
}

export type ToolbarMorph = {
  x: number
  y: number
  scaleX: number
  scaleY: number
}

export type ToolbarOrigin = {
  x: number
  y: number
}

export type ToolbarSnapMode = 'place' | 'snap'
export type ToolbarSnapPreview = {
  dock: Exclude<ToolbarDock, 'float'>
  mode: ToolbarSnapMode
} | null

export function toolbarSnapHintI18nKey(preview: NonNullable<ToolbarSnapPreview>) {
  return `toolbar.snapHint.${preview.mode}.${preview.dock}`
}

const DOCKS: ToolbarDock[] = ['top', 'bottom', 'left', 'right', 'float']

export function defaultToolbarDock(): ToolbarDockState {
  return { dock: 'top', x: 0, y: 0 }
}

function isDock(value: unknown): value is ToolbarDock {
  return typeof value === 'string' && DOCKS.includes(value as ToolbarDock)
}

export function parseToolbarDock(raw: string | null): ToolbarDockState {
  const fallback = defaultToolbarDock()
  if (!raw) return fallback
  try {
    const parsed = JSON.parse(raw) as Partial<ToolbarDockState>
    if (!isDock(parsed.dock)) return fallback
    const x = Number(parsed.x)
    const y = Number(parsed.y)
    return {
      dock: parsed.dock,
      x: Number.isFinite(x) ? x : 0,
      y: Number.isFinite(y) ? y : 0,
    }
  } catch {
    return fallback
  }
}

export function clampToolbarPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
) {
  const maxX = Math.max(0, viewportWidth - width)
  const maxY = Math.max(0, viewportHeight - height)
  return {
    x: Math.min(maxX, Math.max(0, x)),
    y: Math.min(maxY, Math.max(0, y)),
  }
}

export function snapToolbarDock(
  x: number,
  y: number,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
  threshold = TOOLBAR_SNAP_PX,
  pointerX?: number,
  pointerY?: number,
): ToolbarDockState {
  const clamped = clampToolbarPosition(x, y, width, height, viewportWidth, viewportHeight)
  if (viewportWidth <= 0 || viewportHeight <= 0) {
    return { dock: 'float', ...clamped }
  }

  const distances = {
    top: Math.min(clamped.y, pointerY ?? clamped.y),
    bottom: Math.min(
      viewportHeight - (clamped.y + height),
      pointerY == null ? viewportHeight - (clamped.y + height) : viewportHeight - pointerY,
    ),
    left: Math.min(clamped.x, pointerX ?? clamped.x),
    right: Math.min(
      viewportWidth - (clamped.x + width),
      pointerX == null ? viewportWidth - (clamped.x + width) : viewportWidth - pointerX,
    ),
  }

  let dock: ToolbarDock = 'float'
  let nearest = threshold
  for (const edge of ['top', 'bottom', 'left', 'right'] as const) {
    if (distances[edge] > nearest) continue
    nearest = distances[edge]
    dock = edge
  }
  if (dock === 'float') return { dock, ...clamped }
  return { dock, x: 0, y: 0 }
}

export function previewToolbarSnap(
  x: number,
  y: number,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
  pointerX?: number,
  pointerY?: number,
): ToolbarSnapPreview {
  const snap = snapToolbarDock(
    x, y, width, height, viewportWidth, viewportHeight, TOOLBAR_SNAP_PX, pointerX, pointerY,
  )
  if (snap.dock !== 'float') return { dock: snap.dock, mode: 'snap' }
  const hint = snapToolbarDock(
    x, y, width, height, viewportWidth, viewportHeight, TOOLBAR_SNAP_HINT_PX, pointerX, pointerY,
  )
  if (hint.dock === 'float') return null
  return { dock: hint.dock, mode: 'place' }
}

export type ToolbarHideEdge = Exclude<ToolbarDock, 'float'>

/** Place-band only: near an edge, but not inside the snap/dock strip. */
export function floatingToolbarHideEdge(
  x: number,
  y: number,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
): ToolbarHideEdge | null {
  const preview = previewToolbarSnap(x, y, width, height, viewportWidth, viewportHeight)
  if (preview?.mode !== 'place') return null
  return preview.dock
}

export function launcherHideEdge(
  x: number,
  y: number,
  viewportWidth: number,
  viewportHeight: number,
  size = TOOLBAR_LAUNCHER_PX,
): ToolbarHideEdge | null {
  const distances = {
    top: y,
    bottom: viewportHeight - (y + size),
    left: x,
    right: viewportWidth - (x + size),
  }
  let edge: ToolbarHideEdge | null = null
  let nearest = TOOLBAR_LAUNCHER_HIDE_PX
  for (const name of ['top', 'bottom', 'left', 'right'] as const) {
    if (distances[name] > nearest) continue
    nearest = distances[name]
    edge = name
  }
  return edge
}

export function toolbarHideOffset(
  edge: ToolbarHideEdge,
  x: number,
  y: number,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
  peek = TOOLBAR_HIDE_PEEK_PX,
): { x: number; y: number } {
  if (edge === 'top') return { x: 0, y: peek - height - y }
  if (edge === 'bottom') return { x: 0, y: viewportHeight - peek - y }
  if (edge === 'left') return { x: peek - width - x, y: 0 }
  return { x: viewportWidth - peek - x, y: 0 }
}

export function toolbarRevealHotspot(
  edge: ToolbarHideEdge,
  x: number,
  y: number,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
  hit = TOOLBAR_REVEAL_HIT_PX,
): ToolbarBox {
  if (edge === 'top') {
    return { left: Math.max(0, x), top: 0, width: Math.max(hit, width), height: hit }
  }
  if (edge === 'bottom') {
    return {
      left: Math.max(0, x),
      top: Math.max(0, viewportHeight - hit),
      width: Math.max(hit, width),
      height: hit,
    }
  }
  if (edge === 'left') {
    return { left: 0, top: Math.max(0, y), width: hit, height: Math.max(hit, height) }
  }
  return {
    left: Math.max(0, viewportWidth - hit),
    top: Math.max(0, y),
    width: hit,
    height: Math.max(hit, height),
  }
}

export function toolbarMenuPlacement(dock: ToolbarDock) {
  if (dock === 'bottom') return 'top-end'
  if (dock === 'left') return 'right-start'
  if (dock === 'right') return 'left-start'
  return 'bottom-end'
}

export type ToolbarLauncherPosition = {
  x: number
  y: number
}

export type ToolbarLauncherMenuAlign = {
  above: boolean
  end: boolean
}

export function toolbarLauncherActive(viewportWidth: number, viewportHeight = viewportWidth) {
  return phoneUiActive(viewportWidth, viewportHeight)
}

export function parseToolbarLauncher(raw: string | null): ToolbarLauncherPosition | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<ToolbarLauncherPosition>
    const x = Number(parsed.x)
    const y = Number(parsed.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    return { x, y }
  } catch {
    return null
  }
}

export function defaultToolbarLauncherPosition(
  viewportWidth: number,
  viewportHeight: number,
  size = TOOLBAR_LAUNCHER_PX,
  inset = TOOLBAR_LAUNCHER_INSET_PX,
) {
  return clampToolbarPosition(
    viewportWidth - size - inset,
    viewportHeight - size - inset,
    size,
    size,
    viewportWidth,
    viewportHeight,
  )
}

export function resolveToolbarLauncherPosition(
  stored: ToolbarLauncherPosition | null,
  viewportWidth: number,
  viewportHeight: number,
  size = TOOLBAR_LAUNCHER_PX,
) {
  const origin = stored ?? defaultToolbarLauncherPosition(viewportWidth, viewportHeight, size)
  return clampToolbarPosition(origin.x, origin.y, size, size, viewportWidth, viewportHeight)
}

export function toolbarLauncherMenuAlign(
  x: number,
  y: number,
  viewportWidth: number,
  viewportHeight: number,
  size = TOOLBAR_LAUNCHER_PX,
): ToolbarLauncherMenuAlign {
  return {
    above: y + size / 2 >= viewportHeight / 2,
    end: x + size / 2 >= viewportWidth / 2,
  }
}

export function toolbarLauncherMenuPlacement(align: ToolbarLauncherMenuAlign) {
  if (align.above) return align.end ? 'top-end' : 'top-start'
  return align.end ? 'bottom-end' : 'bottom-start'
}

/* Docked edges reserve a grid track so stretch-fit video can shrink.
   Floating (and dragging) overlays the full stage. */
export function toolbarWorkspaceClass(dock: ToolbarDock) {
  if (dock === 'float') return 'toolbar-overlay'
  return `toolbar-dock-${dock}`
}

export function toolbarStageDuration(dock: ToolbarDock) {
  return toolbarMorphDuration(dock !== 'float')
}

export function toolbarStageEase(dock: ToolbarDock) {
  return toolbarMorphEase(dock !== 'float')
}

export function toolbarHandleVisible(dock: ToolbarDock, dragging: boolean) {
  return dragging || dock === 'float'
}

export function toolbarMorphFromRects(
  first: ToolbarBox,
  last: ToolbarBox,
  origin: ToolbarOrigin = { x: 0, y: 0 },
): ToolbarMorph {
  const scaleX = last.width === 0 ? 1 : first.width / last.width
  const scaleY = last.height === 0 ? 1 : first.height / last.height
  return {
    x: first.left - last.left - origin.x * (1 - scaleX),
    y: first.top - last.top - origin.y * (1 - scaleY),
    scaleX,
    scaleY,
  }
}

export function toolbarMorphOriginInLast(first: ToolbarBox, last: ToolbarBox, originInFirst: ToolbarOrigin): ToolbarOrigin {
  return {
    x: first.left + originInFirst.x - last.left,
    y: first.top + originInFirst.y - last.top,
  }
}

export function toolbarGrabOffset(toolbar: ToolbarBox, source: ToolbarBox, fx: number, fy: number): ToolbarOrigin {
  const clampedX = Math.min(1, Math.max(0, fx))
  const clampedY = Math.min(1, Math.max(0, fy))
  return {
    x: source.left - toolbar.left + clampedX * source.width,
    y: source.top - toolbar.top + clampedY * source.height,
  }
}

export function dockedToolbarBox(
  dock: Exclude<ToolbarDock, 'float'>,
  viewportWidth: number,
  viewportHeight: number,
  bar = TOOLBAR_BAR_PX,
  rail = TOOLBAR_RAIL_PX,
): ToolbarBox {
  if (dock === 'top') return { left: 0, top: 0, width: viewportWidth, height: bar }
  if (dock === 'bottom') {
    return { left: 0, top: Math.max(0, viewportHeight - bar), width: viewportWidth, height: bar }
  }
  if (dock === 'left') return { left: 0, top: 0, width: rail, height: viewportHeight }
  return { left: Math.max(0, viewportWidth - rail), top: 0, width: rail, height: viewportHeight }
}

export function toolbarMorphTransform(morph: ToolbarMorph) {
  return `translate(${morph.x}px, ${morph.y}px) scale(${morph.scaleX}, ${morph.scaleY})`
}

export function toolbarMorphChrome(expand: boolean) {
  return expand
    ? {
      fromRadius: TOOLBAR_FLOAT_RADIUS,
      toRadius: TOOLBAR_DOCK_RADIUS,
      fromShadow: TOOLBAR_FLOAT_SHADOW,
      toShadow: TOOLBAR_DOCK_SHADOW,
    }
    : {
      fromRadius: TOOLBAR_DOCK_RADIUS,
      toRadius: TOOLBAR_FLOAT_RADIUS,
      fromShadow: TOOLBAR_DOCK_SHADOW,
      toShadow: TOOLBAR_FLOAT_SHADOW,
    }
}

export function toolbarMorphKeyframes(
  first: ToolbarBox,
  last: ToolbarBox,
  expand: boolean,
  origin: ToolbarOrigin = { x: 0, y: 0 },
) {
  const morph = toolbarMorphFromRects(first, last, origin)
  const chrome = toolbarMorphChrome(expand)
  const transformOrigin = `${origin.x}px ${origin.y}px`
  return [
    {
      transform: toolbarMorphTransform(morph),
      transformOrigin,
      borderRadius: chrome.fromRadius,
      boxShadow: chrome.fromShadow,
    },
    {
      transform: TOOLBAR_MORPH_REST_TRANSFORM,
      transformOrigin,
      borderRadius: chrome.toRadius,
      boxShadow: chrome.toShadow,
    },
  ]
}

export function toolbarMorphNeeded(morph: ToolbarMorph, epsilon = 0.5) {
  return (
    Math.abs(morph.x) > epsilon
    || Math.abs(morph.y) > epsilon
    || Math.abs(morph.scaleX - 1) > 0.02
    || Math.abs(morph.scaleY - 1) > 0.02
  )
}

export function toolbarMorphDuration(expand: boolean) {
  return expand ? TOOLBAR_MORPH_EXPAND_MS : TOOLBAR_MORPH_COLLAPSE_MS
}

export function toolbarMorphEase(expand: boolean) {
  return expand ? TOOLBAR_MORPH_EXPAND_EASE : TOOLBAR_MORPH_COLLAPSE_EASE
}
