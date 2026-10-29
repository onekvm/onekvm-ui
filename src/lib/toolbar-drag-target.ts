export interface ToolbarSlotRect {
  left: number
  right: number
  top: number
  bottom: number
}

// Gaps and surface padding belong to the nearest slot edge, not to the end
// of the toolbar. Use the original rectangles so animated icons cannot move
// the drop target out from under a stationary pointer.
export function toolbarSlotAt(rects: readonly ToolbarSlotRect[], x: number, y: number, vertical = false): number {
  const point = vertical ? y : x
  let nearest = -1
  let distance = Infinity
  let nearestStart = Infinity
  for (const [index, rect] of rects.entries()) {
    const start = vertical ? rect.top : rect.left
    const end = vertical ? rect.bottom : rect.right
    const next = Math.max(start - point, point - end, 0)
    if (next < distance || (next === distance && start < nearestStart)) {
      nearest = index
      distance = next
      nearestStart = start
    }
  }
  return nearest
}
