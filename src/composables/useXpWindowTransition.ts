import { nextTick, onBeforeUnmount } from 'vue'

type TaskTarget = 'files' | 'media' | undefined

/** XP moves a copy of the title bar between the window and its task button. */
export function useXpWindowTransition(options: {
  minimized: () => boolean
  target: () => TaskTarget
}) {
  let animations: Animation[] = []
  let titlebarCopy: HTMLElement | null = null
  let restoring = false
  let taskBounds: DOMRect | null = null
  let viewport = { width: 0, height: 0 }
  let revision = 0

  function cancel() {
    revision++
    animations.forEach((animation) => animation.cancel())
    animations = []
    titlebarCopy?.remove()
    titlebarCopy = null
  }

  function findTask() {
    if (!options.target()) return null
    return [...document.querySelectorAll<HTMLElement>(`[data-transfer-task="${options.target()}"]`)]
      .find((element) => {
        const bounds = element.getBoundingClientRect()
        return bounds.width > 0 && bounds.height > 0
          && bounds.bottom > 0 && bounds.top < window.innerHeight
          && bounds.right > 0 && bounds.left < window.innerWidth
          && getComputedStyle(element).visibility !== 'hidden'
      }) ?? null
  }

  async function transition(element: Element, done: () => void, entering: boolean) {
    cancel()
    const currentRevision = revision
    const layer = element as HTMLElement
    const panel = layer.querySelector<HTMLElement>('.xp-upload-window')
    const titlebar = panel?.querySelector<HTMLElement>('.xp-upload-titlebar')
    const minimize = !entering && options.minimized()
    const restore = entering && restoring
    restoring = minimize

    // The task indicator may be created by the same update that hides the window.
    await nextTick()
    if (currentRevision !== revision) return
    if (!panel || !titlebar) {
      done()
      return
    }

    const task = findTask()
    if (task) {
      taskBounds = task.getBoundingClientRect()
      viewport = { width: window.innerWidth, height: window.innerHeight }
    }
    if (minimize && panel.contains(document.activeElement)) task?.focus({ preventScroll: true })
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion || typeof panel.animate !== 'function') {
      done()
      if (restore) panel.querySelector<HTMLElement>('.xp-title-minimize')?.focus({ preventScroll: true })
      return
    }

    const canMove = (minimize || restore) && taskBounds
      && viewport.width === window.innerWidth && viewport.height === window.innerHeight
    if (canMove && taskBounds) {
      const bounds = titlebar.getBoundingClientRect()
      const destination = taskBounds
      const copy = titlebar.cloneNode(true) as HTMLElement
      copy.classList.add('xp-upload-motion-titlebar')
      copy.setAttribute('aria-hidden', 'true')
      copy.inert = true
      Object.assign(copy.style, {
        left: `${bounds.left}px`, top: `${bounds.top}px`,
        width: `${bounds.width}px`, height: `${bounds.height}px`,
      })
      layer.parentElement?.append(copy)
      titlebarCopy = copy
      const taskTransform = `translate(${destination.left - bounds.left}px, ${destination.top - bounds.top}px) scale(${destination.width / bounds.width}, ${destination.height / bounds.height})`
      const duration = entering ? 520 : 480
      animations.push(copy.animate(entering ? [
        { transform: taskTransform, opacity: 0 },
        { opacity: 1, offset: 0.12 },
        { opacity: 1, offset: 0.78 },
        { transform: 'none', opacity: 0 },
      ] : [
        { transform: 'none', opacity: 1 },
        { opacity: 1, offset: 0.85 },
        { transform: taskTransform, opacity: 0 },
      ], { duration, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'both' }))
      animations.push(panel.animate(entering ? [
        { opacity: 0 }, { opacity: 0, offset: 0.45 }, { opacity: 1 },
      ] : [{ opacity: 1 }, { opacity: 0 }], {
        duration: entering ? duration : 160, easing: 'ease-out', fill: 'both',
      }))
    } else {
      const hidden = { opacity: 0, transform: 'translateY(8px) scale(0.98)' }
      const visible = { opacity: 1, transform: 'none' }
      animations.push(panel.animate(entering ? [hidden, visible] : [visible, hidden], {
        duration: entering ? 160 : 120, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'both',
      }))
    }

    try {
      await Promise.all(animations.map((animation) => animation.finished))
    } catch {
      return // Vue's cancellation hooks own interrupted transitions.
    }
    if (currentRevision !== revision) return
    done()
    cancel()
    if (restore) panel.querySelector<HTMLElement>('.xp-title-minimize')?.focus({ preventScroll: true })
  }

  onBeforeUnmount(cancel)
  return {
    enter: (element: Element, done: () => void) => { void transition(element, done, true) },
    leave: (element: Element, done: () => void) => { void transition(element, done, false) },
    cancel,
  }
}
