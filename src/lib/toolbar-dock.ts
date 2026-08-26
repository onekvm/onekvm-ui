export type ToolbarDock = 'top' | 'right' | 'bottom' | 'left' | 'float'

export type ToolbarDockState = {
  dock: ToolbarDock
  x: number
  y: number
}

export const TOOLBAR_DOCK_KEY = 'onekvm-toolbar-dock'
export const TOOLBAR_SNAP_PX = 36
export const TOOLBAR_DRAG_THRESHOLD_PX = 8

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
): ToolbarDockState {
  const clamped = clampToolbarPosition(x, y, width, height, viewportWidth, viewportHeight)
  if (viewportWidth <= 0 || viewportHeight <= 0) {
    return { dock: 'float', ...clamped }
  }

  const distances = {
    top: clamped.y,
    bottom: viewportHeight - (clamped.y + height),
    left: clamped.x,
    right: viewportWidth - (clamped.x + width),
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

export function toolbarMenuPlacement(dock: ToolbarDock) {
  if (dock === 'bottom') return 'top-end'
  if (dock === 'left') return 'right-start'
  if (dock === 'right') return 'left-start'
  return 'bottom-end'
}
