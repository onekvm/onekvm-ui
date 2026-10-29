export interface ToolbarSlotRect {
  left: number
  right: number
  top: number
  bottom: number
}
export type ToolbarDragLayout = 'horizontal' | 'vertical' | 'grid'

// Gaps and surface padding belong to the nearest slot edge, not to the end
// of the toolbar. Use the original rectangles so animated icons cannot move
// the drop target out from under a stationary pointer.
export function toolbarSlotAt(rects: readonly ToolbarSlotRect[], x: number, y: number, layout: ToolbarDragLayout = 'horizontal'): number {
  let nearest = -1
  let distance = Infinity
  let row = Infinity
  let column = Infinity
  for (const [index, rect] of rects.entries()) {
    const dx = Math.max(rect.left - x, x - rect.right, 0)
    const dy = Math.max(rect.top - y, y - rect.bottom, 0)
    const next = layout === 'grid' ? dx * dx + dy * dy : layout === 'vertical' ? dy : dx
    const start = layout === 'horizontal' ? rect.left : rect.top
    if (next < distance || (next === distance && (start < row || (start === row && rect.left < column)))) {
      nearest = index
      distance = next
      row = start
      column = rect.left
    }
  }
  return nearest
}
