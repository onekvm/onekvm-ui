import { nextTick, onBeforeUnmount, shallowRef, watch } from 'vue'

function destinationBounds(element: HTMLElement) {
  // The toolbar can still be making room. Measure its settled layout without
  // disturbing the current animation or displaying an intermediate frame.
  const times = new Map<Animation, CSSNumberish | null>()
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    for (const animation of node.getAnimations()) {
      if (!(animation.effect instanceof KeyframeEffect)
        || !animation.effect.getKeyframes().some(frame => frame.transform)) continue
      const end = animation.effect.getComputedTiming().endTime
      if (typeof end !== 'number' || !Number.isFinite(end)) continue
      times.set(animation, animation.currentTime)
      animation.currentTime = end
    }
  }
  const rect = element.getBoundingClientRect()
  for (const [animation, time] of times) animation.currentTime = time
  return rect
}

// Keep the departing bar visible while Vue moves its content between surfaces.
export function usePerformanceDockMotion(
  embedded: () => boolean,
  element: (docked: boolean) => HTMLElement | null,
) {
  const active = shallowRef(false)
  let generation = 0
  let ghost: HTMLElement | null = null
  const animations = new Set<Animation>()
  function cancel() {
    for (const animation of animations) animation.cancel()
    animations.clear()
    ghost?.remove()
    ghost = null
    active.value = false
  }
  watch(embedded, async (docked, previous) => {
    const current = ++generation
    const source = element(previous)
    const first = source?.getBoundingClientRect()
    cancel()
    if (!source || !first?.width || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const clone = source.cloneNode(true) as HTMLElement
    const originals = [source, ...source.querySelectorAll<HTMLElement>('*')]
    const copies = [clone, ...clone.querySelectorAll<HTMLElement>('*')]
    const properties = ['display', 'flex-direction', 'align-items', 'justify-content', 'gap', 'padding', 'margin', 'width', 'height', 'min-width', 'max-width', 'flex', 'font', 'color', 'background', 'border', 'border-radius', 'transform', 'white-space', 'fill', 'stroke', 'stroke-width']
    originals.forEach((original, index) => {
      const css = getComputedStyle(original)
      for (const property of properties) copies[index]?.style.setProperty(property, css.getPropertyValue(property))
    })
    clone.inert = true
    clone.setAttribute('aria-hidden', 'true')
    Object.assign(clone.style, { position: 'fixed', left: `${first.left}px`, top: `${first.top}px`, width: `${first.width}px`, height: `${first.height}px`, margin: '0', pointerEvents: 'none', zIndex: '5000' })
    ;(document.fullscreenElement || document.body).append(clone)
    ghost = clone
    active.value = true
    await nextTick()
    if (current !== generation) return
    const destination = element(docked)
    const last = destination && destinationBounds(destination)
    if (!destination || !last?.width) { cancel(); return }
    const options = { duration: 240, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'both' as const }
    const travel = clone.animate([
      { transform: 'none', opacity: 1, transformOrigin: '0 0' },
      { transform: `translate(${last.left - first.left}px, ${last.top - first.top}px) scale(${last.width / first.width}, ${last.height / first.height})`, opacity: 0, transformOrigin: '0 0' },
    ], options)
    const arrive = destination.animate([{ opacity: 0 }, { opacity: 0, offset: 0.35 }, { opacity: 1 }], options)
    animations.add(travel)
    animations.add(arrive)
    await Promise.allSettled([travel.finished, arrive.finished])
    if (current === generation) cancel()
  })
  onBeforeUnmount(() => { generation++; cancel() })
  return { active }
}
