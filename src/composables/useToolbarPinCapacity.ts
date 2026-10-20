import { onBeforeUnmount, shallowRef, watch, type Ref } from 'vue'
import { toolbarPinCapacity } from '@/lib/toolbar-pin-capacity'

export function useToolbarPinCapacity(
  root: Ref<HTMLElement | null>, count: () => number,
  mobile: () => boolean, vertical: () => boolean,
) {
  const capacity = shallowRef(count())
  let frame = 0
  const number = (value: string) => Number.parseFloat(value) || 0
  function layoutChildren(element: HTMLElement): HTMLElement[] {
    return [...element.children].flatMap(child => {
      if (!(child instanceof HTMLElement)) return []
      const display = getComputedStyle(child).display
      return display === 'none' ? [] : display === 'contents' ? layoutChildren(child) : [child]
    })
  }
  function measure() {
    frame = 0
    const pins = root.value
    const toolbar = pins?.closest<HTMLElement>('.toolbar')
    if (mobile() || !pins || !toolbar) { capacity.value = count(); return }
    const rail = vertical()
    const css = getComputedStyle(toolbar)
    const children = layoutChildren(toolbar)
    const padding = rail ? number(css.paddingTop) + number(css.paddingBottom) : number(css.paddingLeft) + number(css.paddingRight)
    const gap = number(rail ? css.rowGap : css.columnGap)
    let occupied = padding + Math.max(0, children.length - 1) * gap
    for (const child of children) {
      if (child === pins) continue
      const style = getComputedStyle(child)
      const handle = child.querySelector<HTMLElement>('.toolbar-handle')
      occupied += child.classList.contains('toolbar-spacer')
        ? Math.max(number(rail ? style.minHeight : style.minWidth), rail ? handle?.offsetHeight || 0 : handle?.offsetWidth || 0)
        : rail ? Math.max(child.offsetHeight, child.scrollHeight) : Math.max(child.offsetWidth, child.scrollWidth)
      occupied += rail ? number(style.marginTop) + number(style.marginBottom) : number(style.marginLeft) + number(style.marginRight)
    }
    const pinStyle = getComputedStyle(pins)
    occupied += rail
      ? number(pinStyle.paddingTop) + number(pinStyle.paddingBottom) + number(pinStyle.borderTopWidth) + number(pinStyle.marginTop)
      : number(pinStyle.paddingLeft) + number(pinStyle.borderLeftWidth) + number(pinStyle.marginLeft)
    const available = rail ? window.innerHeight : toolbar.classList.contains('is-floating') || toolbar.classList.contains('is-dragging') ? window.innerWidth - 16 : toolbar.clientWidth
    capacity.value = toolbarPinCapacity(count(), available - occupied, rail ? 2 : 1)
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(measure)
  }
  watch([root, count, mobile, vertical], (_value, _previous, cleanup) => {
    const toolbar = root.value?.closest<HTMLElement>('.toolbar')
    if (toolbar) {
      const observer = new ResizeObserver(schedule)
      observer.observe(toolbar)
      for (const child of layoutChildren(toolbar)) observer.observe(child)
      cleanup(() => observer.disconnect())
    }
    schedule()
  }, { immediate: true, flush: 'post' })
  window.addEventListener('resize', schedule)
  onBeforeUnmount(() => {
    window.removeEventListener('resize', schedule)
    cancelAnimationFrame(frame)
  })
  return capacity
}
