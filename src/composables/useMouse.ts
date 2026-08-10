import { onBeforeUnmount, watch, type Ref } from 'vue'

import { onekvm } from '@/lib/onekvm'

export type MouseMode = 'absolute' | 'relative'

const buttonBits = [1, 4, 2, 8, 16]

export function useMouse(
  video: Readonly<Ref<HTMLVideoElement | HTMLImageElement | HTMLCanvasElement | null>>,
  mode: Ref<MouseMode>,
  scrollInterval: Ref<number>,
  reportRate: Ref<number>,
) {
  let buttons = 0
  let moveTimer = 0
  let lastMoveSent = 0
  let pendingX = 0
  let pendingY = 0
  let absoluteX = 0x4000
  let absoluteY = 0x4000
  let lastScroll = 0
  let removeListeners = () => undefined

  const coordinates = (event: MouseEvent) => {
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
    const sourceRatio = sourceWidth && sourceHeight
      ? sourceWidth / sourceHeight
      : rect.width / rect.height
    const boxRatio = rect.width / rect.height
    const renderedWidth = sourceRatio > boxRatio ? rect.width : rect.height * sourceRatio
    const renderedHeight = sourceRatio > boxRatio ? rect.width / sourceRatio : rect.height
    const left = rect.left + (rect.width - renderedWidth) / 2
    const top = rect.top + (rect.height - renderedHeight) / 2
    const normalizedX = (event.clientX - left) / renderedWidth
    const normalizedY = (event.clientY - top) / renderedHeight
    const inside = normalizedX >= 0 && normalizedX <= 1 && normalizedY >= 0 && normalizedY <= 1
    return {
      inside,
      x: 1 + Math.round(Math.max(0, Math.min(1, normalizedX)) * 0x7ffe),
      y: 1 + Math.round(Math.max(0, Math.min(1, normalizedY)) * 0x7ffe),
    }
  }

  const flushMove = () => {
    moveTimer = 0
    lastMoveSent = performance.now()
    if (mode.value === 'absolute') {
      onekvm.sendAbsoluteMouse(buttons, absoluteX, absoluteY)
    } else if (pendingX || pendingY) {
      while (pendingX || pendingY) {
        const x = Math.max(-127, Math.min(127, pendingX))
        const y = Math.max(-127, Math.min(127, pendingY))
        onekvm.sendRelativeMouse(buttons, x, y)
        pendingX -= x
        pendingY -= y
      }
    }
  }

  const scheduleMove = () => {
    if (moveTimer) return
    const mouseReportIntervalMs = 1000 / Math.max(1, reportRate.value)
    const delay = Math.max(0, mouseReportIntervalMs - (performance.now() - lastMoveSent))
    moveTimer = window.setTimeout(flushMove, delay)
  }

  const mouseMove = (event: MouseEvent) => {
    event.preventDefault()
    if (mode.value === 'absolute') {
      const point = coordinates(event)
      if (!point.inside) return
      if (point.x === absoluteX && point.y === absoluteY) return
      absoluteX = point.x
      absoluteY = point.y
    } else {
      if (document.pointerLockElement !== video.value) return
      if (!event.movementX && !event.movementY) return
      pendingX += event.movementX
      pendingY += event.movementY
    }
    scheduleMove()
  }

  const mouseDown = (event: MouseEvent) => {
    const bit = buttonBits[event.button]
    if (!bit) return
    event.preventDefault()
    video.value?.focus({ preventScroll: true })
    if (mode.value === 'relative' && document.pointerLockElement !== video.value) {
      void video.value?.requestPointerLock()
      return
    }
    buttons |= bit
    if (mode.value === 'absolute') {
      const point = coordinates(event)
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

  const mouseUp = (event: MouseEvent) => {
    const bit = buttonBits[event.button]
    if (!bit || (buttons & bit) === 0) return
    event.preventDefault()
    buttons &= ~bit
    if (mode.value === 'absolute' && video.value) {
      const point = coordinates(event)
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
    event.preventDefault()
    const now = performance.now()
    if (now - lastScroll < scrollInterval.value) return
    lastScroll = now
    onekvm.sendRelativeMouse(mode.value === 'relative' ? buttons : 0, 0, 0, -Math.sign(event.deltaY))
  }

  const releaseButtons = () => {
    if (buttons === 0) return
    buttons = 0
    onekvm.sendRelativeMouse(0)
    onekvm.sendAbsoluteMouse(0, absoluteX, absoluteY)
  }

  const blockBrowserAction = (event: Event) => event.preventDefault()

  const bind = () => {
    removeListeners()
    removeListeners = () => undefined
    const element = video.value
    if (!element) return
    const eventTarget: HTMLElement = element
    eventTarget.addEventListener('mousemove', mouseMove)
    eventTarget.addEventListener('mousedown', mouseDown)
    window.addEventListener('mouseup', mouseUp)
    window.addEventListener('blur', releaseButtons)
    eventTarget.addEventListener('wheel', wheel, { passive: false })
    eventTarget.addEventListener('click', blockBrowserAction)
    eventTarget.addEventListener('auxclick', blockBrowserAction)
    eventTarget.addEventListener('contextmenu', blockBrowserAction)
    removeListeners = () => {
      eventTarget.removeEventListener('mousemove', mouseMove)
      eventTarget.removeEventListener('mousedown', mouseDown)
      window.removeEventListener('mouseup', mouseUp)
      window.removeEventListener('blur', releaseButtons)
      eventTarget.removeEventListener('wheel', wheel)
      eventTarget.removeEventListener('click', blockBrowserAction)
      eventTarget.removeEventListener('auxclick', blockBrowserAction)
      eventTarget.removeEventListener('contextmenu', blockBrowserAction)
    }
  }

  watch(mode, () => {
    releaseButtons()
    if (document.pointerLockElement) void document.exitPointerLock()
  })

  watch(video, bind, { immediate: true, flush: 'post' })
  onBeforeUnmount(() => {
    removeListeners()
    if (moveTimer) window.clearTimeout(moveTimer)
    releaseButtons()
  })
}
