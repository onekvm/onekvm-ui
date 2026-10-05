import { onBeforeUnmount, watch, type Ref } from 'vue'

import { sendRelativeMotion } from '@/lib/hid-mouse'
import { onekvm } from '@/lib/onekvm'
import { mapAbsoluteMouse, unrotateMouseDelta, type VideoFit, type VideoRotation } from '@/lib/video-fit'

export type MouseMode = 'absolute' | 'relative'

const buttonBits = [1, 4, 2, 8, 16]

export function useMouse(
  video: Readonly<Ref<HTMLVideoElement | HTMLImageElement | HTMLCanvasElement | null>>,
  mode: Ref<MouseMode>,
  scrollInterval: Ref<number>,
  reportRate: Ref<number>,
  videoFit: Ref<VideoFit> = { value: 'original' } as Ref<VideoFit>,
  surface?: Readonly<Ref<HTMLElement | null>>,
  enabled?: Readonly<Ref<boolean>>,
  rotation?: Readonly<Ref<VideoRotation>>,
) {
  let buttons = 0
  let moveTimer = 0
  let lastMoveSent = 0
  let pendingX = 0
  let pendingY = 0
  let absoluteX = 0x4000
  let absoluteY = 0x4000
  let lastScroll = 0
  let activeTouchId: number | null = null
  let lastClientX = 0
  let lastClientY = 0
  let removeListeners = () => undefined

  const hidEnabled = () => enabled?.value !== false

  const coordinates = (clientX: number, clientY: number) => {
    const element = video.value!
    const rect = element.getBoundingClientRect()
    const sourceWidth = element instanceof HTMLVideoElement
      ? element.videoWidth
      : element instanceof HTMLCanvasElement
        ? element.width
        : element.naturalWidth
    const sourceHeight = element instanceof HTMLVideoElement
      ? element.videoHeight
      : element instanceof HTMLCanvasElement
        ? element.height
        : element.naturalHeight
    return mapAbsoluteMouse(
      clientX,
      clientY,
      rect,
      sourceWidth,
      sourceHeight,
      videoFit.value,
      rotation?.value,
    )
  }

  const flushMove = () => {
    moveTimer = 0
    lastMoveSent = performance.now()
    if (mode.value === 'absolute') {
      onekvm.sendAbsoluteMouse(buttons, absoluteX, absoluteY)
    } else if (pendingX || pendingY) {
      sendRelativeMotion(buttons, pendingX, pendingY)
      pendingX = 0
      pendingY = 0
    }
  }

  const scheduleMove = () => {
    if (moveTimer) return
    const mouseReportIntervalMs = 1000 / Math.max(1, reportRate.value)
    const delay = Math.max(0, mouseReportIntervalMs - (performance.now() - lastMoveSent))
    moveTimer = window.setTimeout(flushMove, delay)
  }

  const eventTarget = () => surface?.value ?? video.value

  const buttonBit = (event: PointerEvent) => (
    event.pointerType === 'mouse' ? buttonBits[event.button] : 1
  )

  const pointerMove = (event: PointerEvent) => {
    if (!hidEnabled()) return
    if (event.pointerType !== 'mouse' && event.pointerId !== activeTouchId) return
    if (event.pointerType !== 'mouse') event.preventDefault()
    if (mode.value === 'absolute') {
      if (!video.value) return
      const point = coordinates(event.clientX, event.clientY)
      if (!point.inside) return
      if (point.x === absoluteX && point.y === absoluteY) return
      absoluteX = point.x
      absoluteY = point.y
    } else {
      let dx = 0
      let dy = 0
      if (document.pointerLockElement === eventTarget()) {
        dx = event.movementX
        dy = event.movementY
      } else {
        if (event.pointerType === 'mouse' && event.buttons === 0) return
        dx = event.clientX - lastClientX
        dy = event.clientY - lastClientY
        lastClientX = event.clientX
        lastClientY = event.clientY
      }
      if (!dx && !dy) return
      const movement = unrotateMouseDelta(dx, dy, rotation?.value ?? 0)
      pendingX += movement.x
      pendingY += movement.y
    }
    scheduleMove()
  }

  const pointerDown = (event: PointerEvent) => {
    if (!hidEnabled()) return
    if (event.pointerType !== 'mouse') {
      if (activeTouchId !== null) return
      activeTouchId = event.pointerId
    }
    const bit = buttonBit(event)
    if (!bit) return
    event.preventDefault()
    const target = eventTarget()
    target?.focus({ preventScroll: true })
    lastClientX = event.clientX
    lastClientY = event.clientY
    try {
      target?.setPointerCapture(event.pointerId)
    } catch {
      // Capture is best-effort; touch still tracks on the surface.
    }
    if (mode.value === 'relative' && event.pointerType === 'mouse' && document.pointerLockElement !== target) {
      void target?.requestPointerLock()
      return
    }
    buttons |= bit
    if (mode.value === 'absolute') {
      const point = coordinates(event.clientX, event.clientY)
      if (!point.inside) {
        buttons &= ~bit
        return
      }
      absoluteX = point.x
      absoluteY = point.y
      onekvm.sendAbsoluteMouse(buttons, absoluteX, absoluteY)
    } else {
      onekvm.sendRelativeMouse(buttons)
    }
  }

  const pointerUp = (event: PointerEvent) => {
    if (!hidEnabled()) return
    if (event.pointerType !== 'mouse' && event.pointerId !== activeTouchId) return
    if (event.pointerType !== 'mouse') activeTouchId = null
    const bit = event.pointerType === 'mouse' ? buttonBits[event.button] || 1 : 1
    if ((buttons & bit) === 0) return
    event.preventDefault()
    buttons &= ~bit
    if (mode.value === 'absolute' && video.value) {
      const point = coordinates(event.clientX, event.clientY)
      if (point.inside) {
        absoluteX = point.x
        absoluteY = point.y
      }
      onekvm.sendAbsoluteMouse(buttons, absoluteX, absoluteY)
    } else {
      onekvm.sendRelativeMouse(buttons)
    }
  }

  const wheel = (event: WheelEvent) => {
    if (!hidEnabled()) return
    event.preventDefault()
    const now = performance.now()
    if (now - lastScroll < scrollInterval.value) return
    lastScroll = now
    onekvm.sendRelativeMouse(mode.value === 'relative' ? buttons : 0, 0, 0, -Math.sign(event.deltaY))
  }

  const releaseButtons = () => {
    if (moveTimer) window.clearTimeout(moveTimer)
    moveTimer = 0
    pendingX = pendingY = 0
    activeTouchId = null
    if (buttons === 0) return
    buttons = 0
    onekvm.sendRelativeMouse(0)
    onekvm.sendAbsoluteMouse(0, absoluteX, absoluteY)
  }

  const blockBrowserAction = (event: Event) => event.preventDefault()

  const bind = () => {
    removeListeners()
    removeListeners = () => undefined
    const target = eventTarget()
    if (!target || !hidEnabled()) return
    target.addEventListener('pointerdown', pointerDown)
    target.addEventListener('pointermove', pointerMove)
    target.addEventListener('pointerup', pointerUp)
    target.addEventListener('pointercancel', pointerUp)
    window.addEventListener('blur', releaseButtons)
    window.addEventListener('pagehide', releaseButtons)
    document.addEventListener('visibilitychange', releaseButtons)
    target.addEventListener('wheel', wheel, { passive: false })
    target.addEventListener('click', blockBrowserAction)
    target.addEventListener('auxclick', blockBrowserAction)
    target.addEventListener('dblclick', blockBrowserAction)
    target.addEventListener('contextmenu', blockBrowserAction)
    removeListeners = () => {
      target.removeEventListener('pointerdown', pointerDown)
      target.removeEventListener('pointermove', pointerMove)
      target.removeEventListener('pointerup', pointerUp)
      target.removeEventListener('pointercancel', pointerUp)
      window.removeEventListener('blur', releaseButtons)
      window.removeEventListener('pagehide', releaseButtons)
      document.removeEventListener('visibilitychange', releaseButtons)
      target.removeEventListener('wheel', wheel)
      target.removeEventListener('click', blockBrowserAction)
      target.removeEventListener('auxclick', blockBrowserAction)
      target.removeEventListener('dblclick', blockBrowserAction)
      target.removeEventListener('contextmenu', blockBrowserAction)
    }
  }

  watch([mode, () => rotation?.value], () => {
    releaseButtons()
    if (document.pointerLockElement) void document.exitPointerLock()
  })

  watch([video, () => surface?.value, () => hidEnabled()], (current) => {
    if (!current[2]) releaseButtons()
    bind()
  }, { immediate: true, flush: 'post' })
  onBeforeUnmount(() => {
    removeListeners()
    if (moveTimer) window.clearTimeout(moveTimer)
    releaseButtons()
  })
}
