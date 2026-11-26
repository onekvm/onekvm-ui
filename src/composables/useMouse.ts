import { onBeforeUnmount, watch, type Ref } from 'vue'

import { sendRelativeMotion } from '@/lib/hid-mouse'
import { onekvm } from '@/lib/onekvm'
import {
  TOUCHPAD_HOLD_MS,
  TouchpadGesture,
  touchpadHidDelta,
  type TouchpadAction,
} from '@/lib/touchpad-gestures'
import { TOUCHSCREEN_KEEPALIVE_MS, TouchscreenContacts, pointerRole, type MouseMode } from '@/lib/touchscreen'
import { mapAbsoluteMouse, unrotateMouseDelta, type VideoFit, type VideoRotation } from '@/lib/video-fit'

export type { MouseMode }

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
  // Buttons held down on the floating Left/Right buttons.
  let floatingHeld = 0
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
  const gesture = new TouchpadGesture()
  let holdTimer = 0
  let touchX = absoluteX
  let touchY = absoluteY
  const contacts = new TouchscreenContacts()
  let contactTimer = 0
  let keepaliveTimer = 0
  let lastContactSent = 0

  const hidEnabled = () => enabled?.value !== false
  // A mouse in Touchscreen mode moves the pointer as in Absolute mode.
  const absolute = () => mode.value !== 'relative'

  const sourceSize = (element: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement) => ({
    sourceWidth: element instanceof HTMLVideoElement
      ? element.videoWidth
      : element instanceof HTMLCanvasElement
        ? element.width
        : element.naturalWidth,
    sourceHeight: element instanceof HTMLVideoElement
      ? element.videoHeight
      : element instanceof HTMLCanvasElement
        ? element.height
        : element.naturalHeight,
  })

  const coordinates = (clientX: number, clientY: number) => {
    const element = video.value!
    const rect = element.getBoundingClientRect()
    const { sourceWidth, sourceHeight } = sourceSize(element)
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
    if (absolute()) {
      onekvm.sendAbsoluteMouse(buttons, absoluteX, absoluteY)
    } else if (pendingX || pendingY) {
      // Keep fractions so slow touchpad slides still add up.
      const x = Math.round(pendingX)
      const y = Math.round(pendingY)
      pendingX -= x
      pendingY -= y
      sendRelativeMotion(buttons, x, y)
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

  const usesTouchscreen = (event: PointerEvent) => pointerRole(mode.value, event.pointerType) === 'contacts'

  const usesTouchpad = (event: PointerEvent) => pointerRole(mode.value, event.pointerType) === 'touchpad'

  const flushContacts = () => {
    if (contactTimer) window.clearTimeout(contactTimer)
    contactTimer = 0
    if (keepaliveTimer) window.clearTimeout(keepaliveTimer)
    keepaliveTimer = 0
    const report = contacts.report()
    if (report.length) {
      lastContactSent = performance.now()
      onekvm.sendTouch(report)
    }
    // OneKVM lifts held contacts when the browser goes quiet for a second.
    if (contacts.active) keepaliveTimer = window.setTimeout(flushContacts, TOUCHSCREEN_KEEPALIVE_MS)
  }

  const scheduleContacts = () => {
    if (contactTimer) return
    const reportIntervalMs = 1000 / Math.max(1, reportRate.value)
    const delay = Math.max(0, reportIntervalMs - (performance.now() - lastContactSent))
    contactTimer = window.setTimeout(flushContacts, delay)
  }

  // Sends coalesced motion first so the host sees it before a finger change.
  const flushPendingContacts = () => {
    if (contactTimer) flushContacts()
  }

  const releaseContacts = () => {
    if (contactTimer) window.clearTimeout(contactTimer)
    contactTimer = 0
    if (keepaliveTimer) window.clearTimeout(keepaliveTimer)
    keepaliveTimer = 0
    if (contacts.cancel()) flushContacts()
  }

  const touchscreenDown = (event: PointerEvent) => {
    event.preventDefault()
    if (contacts.has(event.pointerId) || !video.value) return
    // A finger that lands outside the picture is not a contact.
    const point = coordinates(event.clientX, event.clientY)
    if (!point.inside) return
    const target = eventTarget()
    target?.focus({ preventScroll: true })
    try {
      target?.setPointerCapture(event.pointerId)
    } catch {
      // Capture is best-effort; touch still tracks on the surface.
    }
    flushPendingContacts()
    if (contacts.down(event.pointerId, point.x, point.y)) flushContacts()
  }

  const touchscreenMove = (event: PointerEvent) => {
    if (!contacts.has(event.pointerId)) return
    event.preventDefault()
    if (!video.value) return
    // Outside the picture the contact stays on the nearest edge.
    const point = coordinates(event.clientX, event.clientY)
    if (contacts.move(event.pointerId, point.x, point.y)) scheduleContacts()
  }

  const touchscreenUp = (event: PointerEvent) => {
    if (!contacts.has(event.pointerId)) return
    event.preventDefault()
    let moved = false
    if (event.type !== 'pointercancel' && video.value) {
      const point = coordinates(event.clientX, event.clientY)
      moved = contacts.move(event.pointerId, point.x, point.y)
    }
    // The last position goes out while still touching, then the lift.
    if (moved) flushContacts()
    else flushPendingContacts()
    contacts.up(event.pointerId)
    flushContacts()
  }

  const clearHoldTimer = () => {
    if (!holdTimer) return
    window.clearTimeout(holdTimer)
    holdTimer = 0
  }

  const armHoldTimer = () => {
    clearHoldTimer()
    if (!gesture.waitingForHold) return
    holdTimer = window.setTimeout(() => {
      holdTimer = 0
      runTouchpad(gesture.hold())
    }, TOUCHPAD_HOLD_MS)
  }

  // Sends any pending movement with the old buttons first, so a drag keeps
  // its last stretch before the button lifts.
  const setButtons = (next: number) => {
    if (moveTimer) {
      window.clearTimeout(moveTimer)
      flushMove()
    }
    buttons = next
    if (absolute()) onekvm.sendAbsoluteMouse(buttons, absoluteX, absoluteY)
    else onekvm.sendRelativeMouse(buttons)
  }

  const moveTouchpadCursor = (dx: number, dy: number) => {
    const element = video.value
    if (!element) return
    const { sourceWidth, sourceHeight } = sourceSize(element)
    const delta = touchpadHidDelta(
      dx,
      dy,
      element.getBoundingClientRect(),
      sourceWidth,
      sourceHeight,
      videoFit.value,
      rotation?.value,
    )
    if (absolute()) {
      touchX = Math.max(1, Math.min(0x7fff, touchX + delta.x))
      touchY = Math.max(1, Math.min(0x7fff, touchY + delta.y))
      absoluteX = Math.round(touchX)
      absoluteY = Math.round(touchY)
    } else if (sourceWidth > 0 && sourceHeight > 0) {
      pendingX += delta.x * sourceWidth / 0x7ffe
      pendingY += delta.y * sourceHeight / 0x7ffe
    }
    scheduleMove()
  }

  function runTouchpad(actions: TouchpadAction[]) {
    for (const action of actions) {
      switch (action.kind) {
        case 'move':
          moveTouchpadCursor(action.dx, action.dy)
          break
        case 'click': {
          const bit = action.button === 'left' ? 1 : 2
          // A floating button already holds it: a tap must not let it go.
          if (floatingHeld & bit) break
          setButtons(buttons | bit)
          setButtons(buttons & ~bit)
          break
        }
        case 'press':
          setButtons(buttons | 1)
          break
        case 'release':
          setButtons(buttons & ~(1 & ~floatingHeld))
          break
        case 'wheel':
          onekvm.sendRelativeMouse(mode.value === 'relative' ? buttons : 0, 0, 0, action.delta)
          break
        case 'held':
          navigator.vibrate?.(12)
          break
      }
    }
  }

  const touchpadDown = (event: PointerEvent) => {
    event.preventDefault()
    const target = eventTarget()
    target?.focus({ preventScroll: true })
    try {
      target?.setPointerCapture(event.pointerId)
    } catch {
      // Capture is best-effort; touch still tracks on the surface.
    }
    if (!gesture.active) {
      touchX = absoluteX
      touchY = absoluteY
    }
    runTouchpad(gesture.down(event.pointerId, event.clientX, event.clientY))
    armHoldTimer()
  }

  const touchpadMove = (event: PointerEvent) => {
    event.preventDefault()
    const actions = gesture.move(event.pointerId, event.clientX, event.clientY)
    if (!gesture.waitingForHold) clearHoldTimer()
    runTouchpad(actions)
  }

  const touchpadUp = (event: PointerEvent) => {
    event.preventDefault()
    const actions = event.type === 'pointercancel' ? gesture.cancel() : gesture.up(event.pointerId)
    if (!gesture.waitingForHold) clearHoldTimer()
    runTouchpad(actions)
  }

  const pointerMove = (event: PointerEvent) => {
    if (!hidEnabled()) return
    if (usesTouchscreen(event)) {
      touchscreenMove(event)
      return
    }
    if (usesTouchpad(event)) {
      touchpadMove(event)
      return
    }
    if (event.pointerType !== 'mouse' && event.pointerId !== activeTouchId) return
    if (event.pointerType !== 'mouse') event.preventDefault()
    if (absolute()) {
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
    if (usesTouchscreen(event)) {
      touchscreenDown(event)
      return
    }
    if (usesTouchpad(event)) {
      touchpadDown(event)
      return
    }
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
    if (absolute()) {
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
    if (usesTouchscreen(event)) {
      touchscreenUp(event)
      return
    }
    if (usesTouchpad(event)) {
      touchpadUp(event)
      return
    }
    if (event.pointerType !== 'mouse' && event.pointerId !== activeTouchId) return
    if (event.pointerType !== 'mouse') activeTouchId = null
    const bit = event.pointerType === 'mouse' ? buttonBits[event.button] || 1 : 1
    if ((buttons & bit) === 0) return
    event.preventDefault()
    buttons &= ~bit
    if (absolute() && video.value) {
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
    floatingHeld = 0
    clearHoldTimer()
    gesture.cancel()
    releaseContacts()
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
    if (!current[2]) {
      releaseButtons()
      if (document.pointerLockElement === eventTarget()) void document.exitPointerLock()
    }
    bind()
  }, { immediate: true, flush: 'post' })
  onBeforeUnmount(() => {
    removeListeners()
    if (moveTimer) window.clearTimeout(moveTimer)
    releaseButtons()
  })

  /** A floating Left/Right button went down or up (Relative mode). */
  const floatingButton = (bit: number, down: boolean) => {
    if (!hidEnabled()) return
    floatingHeld = down ? floatingHeld | bit : floatingHeld & ~bit
    setButtons(down ? buttons | bit : buttons & ~bit)
  }

  /** A finger slid on a held floating button: move like the touchpad. */
  const floatingMove = (dx: number, dy: number) => {
    if (!hidEnabled() || (!dx && !dy)) return
    moveTouchpadCursor(dx, dy)
  }

  return { floatingButton, floatingMove }
}
