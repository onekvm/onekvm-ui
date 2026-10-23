import { nextTick, onBeforeUnmount, shallowRef, watch } from 'vue'
import { useOverlayMount } from './useOverlayMount'

/** Move a title bar to its task button; keep the actual window and its state mounted. */
export function useWindowMinimizeTransition(options: {
  state: () => string
  element: () => HTMLElement | null
  taskId: string
}) {
  const mountTo = useOverlayMount()
  const running = shallowRef(false)
  let animation: Animation | undefined
  let copy: HTMLElement | undefined
  let revision = 0
  function cancel() {
    revision++
    animation?.cancel()
    animation = undefined
    copy?.remove()
    copy = undefined
    running.value = false
  }
  watch(options.state, async (state, previous) => {
    if (state !== 'minimized' && previous !== 'minimized') return
    cancel()
    const current = revision
    const element = options.element()
    if (!element) return
    const minimizing = state === 'minimized'
    const focused = element.contains(document.activeElement)
    const oldTask = document.querySelector<HTMLElement>(`[data-window-task="${options.taskId}"]`)
    const origin = oldTask?.getBoundingClientRect()
    const titlebar = element.querySelector<HTMLElement>('.host-window-titlebar')
    if (minimizing && titlebar) {
      const bounds = titlebar.getBoundingClientRect()
      copy = titlebar.cloneNode(true) as HTMLElement
      copy.inert = true
      copy.setAttribute('aria-hidden', 'true')
      Object.assign(copy.style, { position: 'fixed', margin: '0', left: `${bounds.left}px`, top: `${bounds.top}px`, width: `${bounds.width}px`, height: `${bounds.height}px`, zIndex: '1795', pointerEvents: 'none', boxSizing: 'border-box', transformOrigin: 'top left', background: 'var(--onekvm-toolbar)' })
      const target = mountTo.value
      ;(typeof target === 'string' ? document.querySelector(target) : target)?.append(copy)
    }
    running.value = true
    await nextTick()
    if (current !== revision) return
    const task = document.querySelector<HTMLElement>(`[data-window-task="${options.taskId}"]`)
    if (minimizing && focused) task?.focus({ preventScroll: true })
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const target = minimizing ? task?.getBoundingClientRect() : origin
    const animated = minimizing ? copy : element
    if (!target || !animated || reduced || typeof animated.animate !== 'function') { cancel(); return }
    const bounds = animated.getBoundingClientRect()
    if (!bounds.width || !bounds.height) { cancel(); return }
    const transform = `translate(${target.left - bounds.left}px, ${target.top - bounds.top}px) scale(${target.width / bounds.width}, ${target.height / bounds.height})`
    animation = animated.animate(minimizing
      ? [{ transform: 'none', opacity: 1 }, { transform, opacity: 0.1 }]
      : [{ transform, opacity: 0.1 }, { transform: 'none', opacity: 1 }],
    { duration: 200, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'both' })
    try { await animation.finished } catch { /* Superseded by another window action. */ }
    if (current === revision) cancel()
  }, { flush: 'sync' })
  onBeforeUnmount(cancel)
  return running
}
