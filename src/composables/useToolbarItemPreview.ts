import { nextTick, onBeforeUnmount } from 'vue'

// Keep hit testing in the original slots while sibling icons slide aside.
// Translating slots avoids changing persisted/Vue state during the gesture.
export function useToolbarItemPreview() {
  const originals = new Map<HTMLElement, { rect: DOMRect; translate: string }>()
  const animations = new Set<Animation>()
  function clear() {
    for (const [element, original] of originals) {
      element.style.translate = original.translate
      element.classList.remove('toolbar-item-preview')
    }
    originals.clear()
  }
  function bounds(element: HTMLElement) { return originals.get(element)?.rect ?? element.getBoundingClientRect() }
  function hit(x: number, y: number) {
    return [...originals].find(([, { rect }]) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom)?.[0]
  }
  function preview(source: HTMLElement, surface: HTMLElement | null, before?: string, vertical = false) {
    if (!surface || source.closest('[data-toolbar-surface]') !== surface) { clear(); return }
    const elements = [...surface.querySelectorAll<HTMLElement>('[data-toolbar-item]')]
      .filter(element => element.closest('[data-toolbar-surface]') === surface && element.getClientRects().length && !element.closest('.toolbar-item-drag-ghost'))
    for (const element of elements) {
      if (!originals.has(element)) originals.set(element, { rect: element.getBoundingClientRect(), translate: element.style.translate })
    }
    vertical ||= surface.hasAttribute('data-toolbar-folder-list')
    elements.sort((a, b) => vertical ? bounds(a).top - bounds(b).top : bounds(a).left - bounds(b).left)
    const from = elements.indexOf(source)
    if (from < 0) { clear(); return }
    const reordered = elements.filter(element => element !== source)
    const index = before ? reordered.findIndex(element => element.dataset.toolbarItem === before) : -1
    reordered.splice(index < 0 ? reordered.length : index, 0, source)
    const first = bounds(elements[0]!)
    const gaps = new Map(elements.map((element, index) => [element, index === 0 ? 0 : vertical
      ? bounds(element).top - bounds(elements[index - 1]!).bottom
      : bounds(element).left - bounds(elements[index - 1]!).right]))
    let offset = vertical ? first.top : first.left
    const gap = parseFloat(getComputedStyle(surface).gap) || 0
    for (const [index, element] of reordered.entries()) {
      const rect = bounds(element)
      if (index > 0) offset += Math.max(gap, gaps.get(element) ?? gap)
      const delta = offset - (vertical ? rect.top : rect.left)
      element.classList.add('toolbar-item-preview')
      element.style.translate = vertical ? `0 ${delta}px` : `${delta}px 0`
      offset += vertical ? rect.height : rect.width
    }
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
  return { clear, bounds, hit, preview, capture, settle }
}
