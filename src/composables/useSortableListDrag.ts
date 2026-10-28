import { nextTick, onBeforeUnmount, shallowRef, watch } from 'vue'

export function useSortableListDrag<Id extends string>({
  attribute,
  disabled = () => false,
  commit,
}: {
  attribute: `data-${string}`
  disabled?: () => boolean | undefined
  commit: (from: Id, to: Id) => void
}) {
  const dragId = shallowRef<Id | null>(null)
  const overId = shallowRef<Id | null>(null)
  let active: {
    pointerId: number
    handle: HTMLElement
    list: HTMLElement
    slots: { id: Id; center: number }[]
    ghost: HTMLElement
    startY: number
  } | null = null

  function cancelDrag() {
    const previous = active
    active = null
    dragId.value = null
    overId.value = null
    previous?.ghost.remove()
    window.removeEventListener('keydown', cancelOnEscape, true)
    if (previous?.list.hasPointerCapture(previous.pointerId)) {
      previous.list.releasePointerCapture(previous.pointerId)
    }
    if (previous) void nextTick(() => {
      if (previous.handle.isConnected) previous.handle.focus({ preventScroll: true })
    })
  }

  function cancelOnEscape(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !active) return
    event.preventDefault()
    event.stopPropagation()
    cancelDrag()
  }

  function startDrag(event: PointerEvent, id: Id) {
    if (disabled() || active || event.button !== 0 || !event.isPrimary) return
    const handle = event.currentTarget
    if (!(handle instanceof HTMLElement)) return
    const row = handle.closest<HTMLElement>(`[${attribute}]`)
    const list = row?.parentElement
    if (!row || !list) return
    event.preventDefault()
    event.stopPropagation()
    handle.focus({ preventScroll: true })
    const bounds = row.getBoundingClientRect()
    const ghost = row.cloneNode(true) as HTMLElement
    ghost.removeAttribute(attribute)
    ghost.removeAttribute('role')
    ghost.setAttribute('aria-hidden', 'true')
    ghost.inert = true
    ghost.classList.add('is-drag-ghost')
    Object.assign(ghost.style, {
      position: 'fixed', left: `${bounds.left}px`, top: `${bounds.top}px`,
      width: `${bounds.width}px`, height: `${bounds.height}px`, margin: '0',
      boxSizing: 'border-box', pointerEvents: 'none', zIndex: '5000',
      transform: 'none', transition: 'none',
    })
    ;(document.fullscreenElement || document.body).append(ghost)
    active = {
      pointerId: event.pointerId, handle, list, ghost, startY: event.clientY,
      // Keep the original slots stable while TransitionGroup moves the rows.
      slots: Array.from(list.querySelectorAll<HTMLElement>(`[${attribute}]`)).map(item => ({
        id: item.getAttribute(attribute) as Id,
        center: item.offsetTop + item.offsetHeight / 2,
      })),
    }
    dragId.value = id
    overId.value = id
    window.addEventListener('keydown', cancelOnEscape, true)
    // The list stays in place when Vue moves the captured row during sorting.
    try { list.setPointerCapture(event.pointerId) } catch { cancelDrag() }
  }

  function moveDrag(event: PointerEvent) {
    if (!active || event.pointerId !== active.pointerId) return
    const { list, ghost, slots, startY } = active
    ghost.style.transform = `translateY(${event.clientY - startY}px)`
    const bounds = list.getBoundingClientRect()
    if (event.clientX < bounds.left || event.clientX > bounds.right
      || event.clientY < bounds.top || event.clientY > bounds.bottom) return
    const y = event.clientY - bounds.top
    const nearest = slots.reduce((best, slot) => Math.abs(slot.center - y) < Math.abs(best.center - y) ? slot : best)
    overId.value = nearest.id
  }

  function endDrag(event: PointerEvent) {
    if (!active || event.pointerId !== active.pointerId) return
    moveDrag(event)
    const from = dragId.value
    const to = overId.value
    cancelDrag()
    if (from && to && from !== to && !disabled()) commit(from, to)
  }

  watch(disabled, value => { if (value) cancelDrag() })
  onBeforeUnmount(cancelDrag)
  return { dragId, overId, startDrag, moveDrag, endDrag, cancelDrag }
}
