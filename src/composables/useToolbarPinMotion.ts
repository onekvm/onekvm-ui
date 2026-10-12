import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue'

type Bounds = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>
type Snapshot = { rect: Bounds; ghost: HTMLElement }
const easing = 'cubic-bezier(0.23, 1, 0.32, 1)'

// Measure before Vue updates, then animate from the displayed layout to the new
// layout. Inverse transforms keep button text and icons from stretching.
export function useToolbarPinMotion(
  toolbar: Ref<HTMLElement | null>, tray: Ref<HTMLElement | null>,
  pins: () => string, enabled: () => boolean,
) {
  const animations = new Set<Animation>()
  const ghosts = new Set<HTMLElement>()
  let generation = 0
  function cancel() {
    for (const animation of animations) animation.cancel()
    animations.clear()
    for (const ghost of ghosts) ghost.remove()
    ghosts.clear()
  }
  function animate(element: HTMLElement, frames: Keyframe[], duration = 220) {
    const animation = element.animate(frames, { duration, easing, fill: 'both' })
    animations.add(animation)
    void animation.finished.then(() => {
      animation.cancel(); animations.delete(animation)
      if (ghosts.delete(element)) element.remove()
    }, () => undefined)
  }
  watch(pins, async () => {
    const current = ++generation
    const root = tray.value && !toolbar.value?.contains(tray.value) ? tray.value : toolbar.value
    if (!root || !enabled() || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !root.getClientRects().length) { cancel(); return }
    const first = root.getBoundingClientRect()
    const before = new Map<HTMLElement, Snapshot>()
    for (const button of root.querySelectorAll<HTMLElement>('button')) {
      if (!button.getClientRects().length) continue
      const ghost = button.cloneNode(true) as HTMLElement
      const css = getComputedStyle(button)
      Object.assign(ghost.style, { color: css.color, background: css.background, font: css.font, padding: css.padding, border: css.border, borderRadius: css.borderRadius })
      const icon = ghost.querySelector<HTMLElement>('.n-button__icon')
      if (icon) icon.style.margin = '0'
      before.set(button, { rect: button.getBoundingClientRect(), ghost })
    }
    cancel()
    await nextTick()
    if (current !== generation || !root.isConnected || !enabled()) return
    const last = root.getBoundingClientRect()
    const sx = first.width / Math.max(1, last.width)
    const sy = first.height / Math.max(1, last.height)
    const baseTransform = getComputedStyle(root).transform
    const base = baseTransform === 'none' ? '' : baseTransform
    // Measure the final layout before any animation affects its rectangles.
    const after = new Map<HTMLElement, Bounds>()
    for (const button of root.querySelectorAll<HTMLElement>('button')) {
      if (button.getClientRects().length) after.set(button, button.getBoundingClientRect())
    }
    if (Math.abs(first.width - last.width) > 0.5 || Math.abs(first.height - last.height) > 0.5) {
      animate(root, [
        { transform: `${base} translate(${first.left - last.left}px, ${first.top - last.top}px) scale(${sx}, ${sy})`, transformOrigin: '0 0' },
        { transform: base || 'none', transformOrigin: '0 0' },
      ])
    }
    for (const [button, rect] of after) {
      const offsetX = rect.left - last.left
      const offsetY = rect.top - last.top
      const previous = before.get(button)?.rect
      if (previous) {
        const dx = (previous.left - first.left) / sx - offsetX
        const dy = (previous.top - first.top) / sy - offsetY
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5 || Math.abs(sx - 1) > 0.001 || Math.abs(sy - 1) > 0.001) {
          animate(button, [{ transform: `translate(${dx}px, ${dy}px) scale(${1 / sx}, ${1 / sy})`, transformOrigin: '0 0' }, { transform: 'none', transformOrigin: '0 0' }])
        }
        before.delete(button)
      } else if (button.closest('.toolbar-pinned-tools')) {
        animate(button, [{ opacity: 0, transform: `translateY(4px) scale(${0.85 / sx}, ${0.85 / sy})` }, { opacity: 1, transform: 'none' }])
      }
    }
    for (const [button, { rect, ghost }] of before) {
      if (!button.classList.contains('toolbar-pin-button')) continue
      ghost.setAttribute('aria-hidden', 'true')
      ghost.inert = true
      Object.assign(ghost.style, { position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, pointerEvents: 'none', zIndex: '2000' })
      ;(document.fullscreenElement || document.body).append(ghost)
      ghosts.add(ghost)
      animate(ghost, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.85)' }], 160)
    }
  })
  onBeforeUnmount(() => { generation++; cancel() })
}
