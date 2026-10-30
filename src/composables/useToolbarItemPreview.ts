import { nextTick, onBeforeUnmount } from 'vue'
import { toolbarSlotAt, type ToolbarDragLayout } from '@/lib/toolbar-drag-target'

// Keep hit testing in the original slots while sibling icons slide aside.
// Translating slots avoids changing persisted/Vue state during the gesture.
export function useToolbarItemPreview() {
  const originals = new Map<HTMLElement, { rect: DOMRect; translate: string; order: string }>()
  const animations = new Set<Animation>()
  let shown: { source: HTMLElement; surface: HTMLElement; before?: string } | null = null
  function reset() {
    // Switching between insertion and merging restores the layout, but keeps
    // the same hit-test rectangles until this gesture finishes.
    for (const [element, original] of originals) {
      element.classList.remove('toolbar-item-preview')
      element.style.translate = original.translate
    }
    shown = null
  }
  function clear() { reset(); originals.clear() }
  function bounds(element: HTMLElement) { return originals.get(element)?.rect ?? element.getBoundingClientRect() }
  function slots(surface: HTMLElement) {
    const elements = [...surface.querySelectorAll<HTMLElement>('[data-toolbar-item]')]
      .filter(element => element.closest('[data-toolbar-surface]') === surface && element.getClientRects().length && !element.closest('.toolbar-item-drag-ghost'))
    for (const element of elements) {
      if (!originals.has(element)) originals.set(element, {
        rect: element.getBoundingClientRect(), translate: element.style.translate,
        order: element.style.order,
      })
    }
    return elements
  }
  function direction(surface: HTMLElement, vertical: boolean): ToolbarDragLayout {
    const style = getComputedStyle(surface)
    if (style.display === 'grid' && style.gridTemplateColumns.split(' ').length > 1) return 'grid'
    return vertical || surface.hasAttribute('data-toolbar-folder-list') ? 'vertical' : 'horizontal'
  }
  function hit(surface: HTMLElement, x: number, y: number, layout: ToolbarDragLayout) {
    const elements = slots(surface)
    return elements[toolbarSlotAt(elements.map(bounds), x, y, layout)]
  }
  function preview(source: HTMLElement, surface: HTMLElement | null, before?: string, vertical = false) {
    if (!surface || source.closest('[data-toolbar-surface]') !== surface) { reset(); return }
    if (shown?.source === source && shown.surface === surface && shown.before === before) return
    const elements = slots(surface)
    const layout = direction(surface, vertical)
    elements.sort((a, b) => layout === 'horizontal' ? bounds(a).left - bounds(b).left
      : bounds(a).top - bounds(b).top || bounds(a).left - bounds(b).left)
    const from = elements.indexOf(source)
    if (from < 0) { reset(); return }
    const reordered = elements.filter(element => element !== source)
    const index = before ? reordered.findIndex(element => element.dataset.toolbarItem === before) : -1
    reordered.splice(index < 0 ? reordered.length : index, 0, source)
    // Ask CSS for the destination cells, including full-row separators and
    // account buttons. Measure without translations: animated icons can create
    // scrollbars and change grid column widths while measuring a new order.
    // Restore the current visual positions before animating to the new cells.
    const current = new Map(elements.map(element => {
      const rect = element.getBoundingClientRect(), original = bounds(element)
      return [element, { x: rect.left - original.left, y: rect.top - original.top }] as const
    }))
    for (const element of elements) {
      element.classList.remove('toolbar-item-preview')
      element.style.translate = originals.get(element)!.translate
    }
    const destinations = new Map<HTMLElement, { x: number; y: number }>()
    try {
      reordered.forEach((element, index) => { element.style.order = String((index + 1) * 2 + 10) })
      for (const element of reordered) {
        const rect = element.getBoundingClientRect(), original = bounds(element)
        destinations.set(element, { x: rect.left - original.left, y: rect.top - original.top })
      }
    } finally {
      for (const element of elements) element.style.order = originals.get(element)!.order
    }
    for (const [element, delta] of current) element.style.translate = `${delta.x}px ${delta.y}px`
    void surface.offsetWidth
    for (const [element, delta] of destinations) {
      element.classList.add('toolbar-item-preview')
      element.style.translate = `${delta.x}px ${delta.y}px`
    }
    shown = { source, surface, before }
  }
  function capture() {
    return new Map([...document.querySelectorAll<HTMLElement>('[data-toolbar-surface] [data-toolbar-item]')]
      .filter(element => element.getClientRects().length).map(element => [element, element.getBoundingClientRect()]))
  }
  async function settle(before: Map<HTMLElement, DOMRect>) {
    await nextTick()
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const after = [...before].filter(([element]) => element.isConnected && element.getClientRects().length)
      .map(([element, rect]) => ({ element, rect, next: element.getBoundingClientRect() }))
    for (const { element, rect, next } of after) {
      const dx = rect.left - next.left, dy = rect.top - next.top
      if (Math.abs(dx) < .5 && Math.abs(dy) < .5) continue
      const animation = element.animate([{ translate: `${dx}px ${dy}px` }, { translate: '0 0' }], { duration: 220, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' })
      animations.add(animation)
      void animation.finished.then(() => animations.delete(animation), () => animations.delete(animation))
    }
  }
  onBeforeUnmount(() => { clear(); for (const animation of animations) animation.cancel() })
  return { clear, reset, bounds, direction, hit, items: (surface: HTMLElement) => slots(surface).map(element => element.dataset.toolbarItem!), preview, capture, settle }
}
