import { nextTick, onBeforeUnmount, shallowRef, watch, type Ref } from 'vue'
import type { VideoFit, VideoRotation } from '@/lib/video-fit'

// Keep the live media element attached. Only its compositor transform moves;
// decoded frames and the final one-to-one pixel size remain unchanged.
export function useVideoDisplayMotion(options: {
  target: Readonly<Ref<HTMLVideoElement | HTMLCanvasElement | null>>
  fit: () => VideoFit
  rotation: () => VideoRotation
  ready: () => boolean
  settle: () => void
  settled: () => void
}) {
  const rotating = shallowRef(false)
  let animation: Animation | undefined
  let revision = 0

  function cancel() {
    revision++
    animation?.cancel()
    animation = undefined
    rotating.value = false
  }

  function viewportScale(element: HTMLElement) {
    const viewport = element.closest('.console-viewport')
    if (!viewport) return 1
    const matrix = new DOMMatrixReadOnly(getComputedStyle(viewport).transform)
    return Math.hypot(matrix.a, matrix.b) || 1
  }

  watch([options.fit, options.rotation], async ([, rotation], [, previousRotation]) => {
    const element = options.target.value
    if (!element || !options.ready() || !element.getClientRects().length
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches
      || typeof element.animate !== 'function') { cancel(); return }

    const before = element.getBoundingClientRect()
    const styles = getComputedStyle(element)
    const matrix = new DOMMatrixReadOnly(styles.transform)
    const width = parseFloat(styles.width) * Math.hypot(matrix.a, matrix.b) * viewportScale(element)
    const angle = Math.atan2(matrix.b, matrix.a) * 180 / Math.PI
    const wasRotating = rotating.value
    cancel()
    const current = revision
    rotating.value = wasRotating || rotation !== previousRotation
    await nextTick()
    options.settle()
    await nextTick()
    if (current !== revision || options.target.value !== element || !element.isConnected) return

    const after = element.getBoundingClientRect()
    const parentScale = viewportScale(element)
    const scale = width / (parseFloat(getComputedStyle(element).width) * parentScale)
    const dx = (before.left + before.width / 2 - after.left - after.width / 2) / parentScale
    const dy = (before.top + before.height / 2 - after.top - after.height / 2) / parentScale
    // Use the shortest turn, including 270° -> 0°, and resume a running turn.
    const fromAngle = rotation + ((angle - rotation + 540) % 360) - 180
    if (![scale, dx, dy].every(Number.isFinite) || scale <= 0
      || (Math.abs(scale - 1) < 0.001 && Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5
        && Math.abs(fromAngle - rotation) < 0.1)) {
      rotating.value = false
      options.settled()
      return
    }
    const motion = element.animate([
      { transform: `translate(-50%, -50%) translate(${dx}px, ${dy}px) rotate(${fromAngle}deg) scale(${scale})` },
      { transform: `translate(-50%, -50%) translate(0px, 0px) rotate(${rotation}deg) scale(1)` },
    ], { duration: 240, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'both' })
    animation = motion
    try { await motion.finished } catch { return }
    if (current !== revision) return
    motion.cancel()
    animation = undefined
    rotating.value = false
    options.settled()
  })

  watch(options.target, cancel)
  onBeforeUnmount(cancel)
  return { rotating, cancel }
}
