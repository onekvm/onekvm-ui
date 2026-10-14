import { nextTick, onBeforeUnmount, readonly, shallowRef, watch, type Ref } from 'vue'

type Content = { advanced: boolean; audio: boolean; compact: boolean }

// Mount additions before expanding; keep outgoing panels until the frame has
// finished shrinking. A hidden DOM copy measures the destination without
// unmounting the live charts or interrupting their history.
export function usePerformanceContentMotion(options: {
  panel: Readonly<Ref<HTMLElement | null>>
  content: () => Content
  visible: () => boolean
  place: (size: { width: number; height: number }) => void
}) {
  const rendered = shallowRef(options.content())
  let revision = 0
  let animations: Animation[] = []
  let restore = () => {}

  function clear() {
    animations.forEach(animation => animation.cancel())
    animations = []
    restore()
    restore = () => {}
  }

  function cancel() {
    revision++
    clear()
    rendered.value = options.content()
  }

  function measure(element: HTMLElement, content: Content) {
    const copy = element.cloneNode(true) as HTMLElement
    copy.inert = true
    copy.setAttribute('aria-hidden', 'true')
    copy.removeAttribute('id')
    copy.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'))
    copy.classList.toggle('is-advanced', content.advanced && !content.compact)
    copy.classList.toggle('has-audio', content.audio && !content.compact)
    copy.classList.toggle('is-compact', content.compact)
    Object.assign(copy.style, {
      visibility: 'hidden', pointerEvents: 'none', left: '0', top: '0',
      width: '', height: '', transform: 'none', overflow: '',
    })
    const chrome = copy.querySelector<HTMLElement>('.console-floating-chrome')
    const header = copy.querySelector<HTMLElement>('.display-status-titlebar')
    const body = copy.querySelector<HTMLElement>('.display-status-content')
    const card = copy.querySelector<HTMLElement>('.console-floating-card')
    if (chrome) chrome.style.display = content.compact ? '' : 'none'
    if (header) header.style.display = content.compact ? 'none' : ''
    if (body && content.compact) body.remove()
    if (card) { card.style.width = ''; card.style.height = ''; card.style.transform = 'none' }
    for (const node of copy.querySelectorAll<HTMLElement>('[data-performance-panel]')) {
      const kind = node.dataset.performancePanel
      if ((kind === 'latency' && !content.advanced) || (kind === 'audio' && !content.audio)
        || (kind === 'audio-latency' && (!content.audio || !content.advanced))) node.remove()
    }
    element.parentElement?.append(copy)
    try { return { width: copy.offsetWidth, height: copy.offsetHeight } }
    finally { copy.remove() }
  }

  watch(options.content, async desired => {
    const element = options.panel.value
    const previousContent = rendered.value
    const before = element?.getBoundingClientRect()
    const current = ++revision
    clear()
    if (!element || !before?.width || !before.height || !options.visible()
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches
      || typeof element.animate !== 'function') {
      rendered.value = desired
      return
    }

    // This union never removes a live panel. Compact chrome stays mounted but
    // hidden, so its natural width is available for destination measurement.
    rendered.value = {
      advanced: previousContent.advanced || desired.advanced,
      audio: previousContent.audio || desired.audio,
      compact: previousContent.compact && desired.compact,
    }
    await nextTick()
    if (current !== revision || !element.isConnected || !options.visible()) return
    const destination = measure(element, desired)
    const card = element.querySelector<HTMLElement>('.console-floating-card')
    if (!card || !destination.width || !destination.height) { cancel(); return }

    const frameWidth = element.style.width
    const frameHeight = element.style.height
    const overflow = element.style.overflow
    const cardWidth = card.style.width
    const cardHeight = card.style.height
    // Lock the content at its natural size while the frame clips it. Reciprocal
    // transforms keep text and charts at full size throughout the animation.
    card.style.width = `${card.offsetWidth}px`
    card.style.height = `${card.offsetHeight}px`
    element.style.width = `${destination.width}px`
    element.style.height = `${destination.height}px`
    element.style.overflow = 'hidden'
    restore = () => {
      element.style.width = frameWidth; element.style.height = frameHeight
      element.style.overflow = overflow
      card.style.width = cardWidth; card.style.height = cardHeight
    }
    options.place(destination)
    await nextTick()
    if (current !== revision) return

    const after = element.getBoundingClientRect()
    const sx = before.width / after.width
    const sy = before.height / after.height
    const styles = getComputedStyle(element)
    const duration = styles.getPropertyValue('--win11-enter').trim()
    const timing = {
      duration: parseFloat(duration) * (duration.endsWith('ms') ? 1 : 1000) || 250,
      easing: styles.getPropertyValue('--win11-ease-out').trim() || 'ease-out',
      fill: 'both' as const,
    }
    animations = [element.animate([
      { transformOrigin: 'top left', transform: `translate(${before.left - after.left}px, ${before.top - after.top}px) scale(${sx}, ${sy})` },
      { transformOrigin: 'top left', transform: 'none' },
    ], timing), card.animate(Array.from({ length: 61 }, (_, index) => {
      const progress = index / 60
      return {
        offset: progress, transformOrigin: 'top left',
        transform: `scale(${1 / (sx + (1 - sx) * progress)}, ${1 / (sy + (1 - sy) * progress)})`,
      }
    }), timing)]
    try { await Promise.all(animations.map(animation => animation.finished)) } catch { return }
    if (current !== revision) return
    rendered.value = desired
    await nextTick()
    if (current !== revision) return
    clear()
  })

  watch(options.visible, cancel)
  onBeforeUnmount(cancel)
  return { rendered: readonly(rendered), cancel }
}
