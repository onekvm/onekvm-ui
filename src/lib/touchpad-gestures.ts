import { rotatedVideoSize, type VideoFit, type VideoRotation } from './video-fit.ts'

// Touching the picture works like a laptop touchpad: slide to move the
// cursor, tap for a left click, long-press for a right click (or keep holding
// and slide to drag with the left button), two fingers up or down to scroll.

export type TouchInput = 'touchpad' | 'direct'

export const TOUCH_INPUT_KEY = 'onekvm-touch-input'
export const TOUCHPAD_TAP_SLOP = 12
export const TOUCHPAD_HOLD_MS = 450
export const TOUCHPAD_SCROLL_STEP = 24

export function parseTouchInput(stored: string | null, coarsePointer: boolean): TouchInput {
  if (stored === 'touchpad' || stored === 'direct') return stored
  return coarsePointer ? 'touchpad' : 'direct'
}

export type TouchpadAction =
  | { kind: 'move'; dx: number; dy: number }
  | { kind: 'click'; button: 'left' | 'right' }
  | { kind: 'press' }
  | { kind: 'release' }
  | { kind: 'wheel'; delta: number }
  | { kind: 'held' }

interface Point { x: number; y: number }

export class TouchpadGesture {
  private fingers = new Map<number, Point>()
  private primary: number | null = null
  private origin: Point = { x: 0, y: 0 }
  private last: Point = { x: 0, y: 0 }
  private moved = false
  private held = false
  private dragging = false
  private scrolling = false
  private scrollAnchor = 0

  private readonly slop: number
  private readonly scrollStep: number

  constructor(slop = TOUCHPAD_TAP_SLOP, scrollStep = TOUCHPAD_SCROLL_STEP) {
    this.slop = slop
    this.scrollStep = scrollStep
  }

  /** A long-press timer should run while one finger rests without moving. */
  get waitingForHold() {
    return this.primary !== null && !this.moved && !this.held && !this.scrolling && this.fingers.size === 1
  }

  get active() {
    return this.fingers.size > 0
  }

  down(id: number, x: number, y: number): TouchpadAction[] {
    this.fingers.set(id, { x, y })
    if (this.fingers.size === 1 && !this.scrolling) {
      this.primary = id
      this.origin = { x, y }
      this.last = { x, y }
      this.moved = false
      this.held = false
      this.dragging = false
      return []
    }
    // A second finger turns the touch into scrolling, unless a drag has begun.
    if (this.fingers.size === 2 && !this.scrolling && !this.held && !this.dragging) {
      this.scrolling = true
      this.scrollAnchor = this.averageY()
    }
    return []
  }

  move(id: number, x: number, y: number): TouchpadAction[] {
    if (!this.fingers.has(id)) return []
    this.fingers.set(id, { x, y })
    if (this.scrolling) return this.scroll()
    if (id !== this.primary) return []
    const dx = x - this.last.x
    const dy = y - this.last.y
    this.last = { x, y }
    const actions: TouchpadAction[] = []
    if (!this.moved && Math.hypot(x - this.origin.x, y - this.origin.y) >= this.slop) {
      this.moved = true
      if (this.held) {
        this.dragging = true
        actions.push({ kind: 'press' })
      }
    }
    if (this.moved && (dx || dy)) actions.push({ kind: 'move', dx, dy })
    return actions
  }

  up(id: number): TouchpadAction[] {
    if (!this.fingers.delete(id)) return []
    if (this.scrolling) {
      if (this.fingers.size === 0) this.reset()
      return []
    }
    if (id !== this.primary) return []
    const actions: TouchpadAction[] = this.dragging
      ? [{ kind: 'release' }]
      : this.held
        ? [{ kind: 'click', button: 'right' }]
        : this.moved
          ? []
          : [{ kind: 'click', button: 'left' }]
    this.primary = null
    if (this.fingers.size === 0) this.reset()
    return actions
  }

  /** The touch was taken away (pointercancel, page hidden): never click. */
  cancel(): TouchpadAction[] {
    const actions: TouchpadAction[] = this.dragging ? [{ kind: 'release' }] : []
    this.fingers.clear()
    this.reset()
    return actions
  }

  hold(): TouchpadAction[] {
    if (!this.waitingForHold) return []
    this.held = true
    return [{ kind: 'held' }]
  }

  private scroll(): TouchpadAction[] {
    if (this.fingers.size < 2) return []
    const actions: TouchpadAction[] = []
    let offset = this.averageY() - this.scrollAnchor
    // Natural scrolling: the content follows the fingers.
    while (Math.abs(offset) >= this.scrollStep) {
      const direction = Math.sign(offset)
      actions.push({ kind: 'wheel', delta: direction })
      this.scrollAnchor += direction * this.scrollStep
      offset -= direction * this.scrollStep
    }
    return actions
  }

  private averageY() {
    const points = [...this.fingers.values()].slice(0, 2)
    return points.reduce((sum, point) => sum + point.y, 0) / points.length
  }

  private reset() {
    this.primary = null
    this.moved = false
    this.held = false
    this.dragging = false
    this.scrolling = false
    this.scrollAnchor = 0
  }
}

/**
 * Converts a finger movement in CSS pixels into absolute HID units (0..0x7ffe
 * across the picture), so the remote cursor moves as far as the finger did.
 */
export function touchpadHidDelta(
  dx: number,
  dy: number,
  rect: { width: number; height: number },
  sourceWidth: number,
  sourceHeight: number,
  fit: VideoFit,
  rotation: VideoRotation = 0,
) {
  let width = rect.width
  let height = rect.height
  if (fit === 'stretch' && sourceWidth > 0 && sourceHeight > 0 && width > 0 && height > 0) {
    const rotated = rotatedVideoSize(sourceWidth, sourceHeight, rotation)
    const sourceRatio = rotated.width / rotated.height
    const boxRatio = width / height
    if (sourceRatio > boxRatio) height = width / sourceRatio
    else width = height * sourceRatio
  }
  if (width <= 0 || height <= 0) return { x: 0, y: 0 }
  let nx = dx / width
  let ny = dy / height
  switch (rotation) {
    case 90: [nx, ny] = [ny, -nx]; break
    case 180: [nx, ny] = [-nx, -ny]; break
    case 270: [nx, ny] = [-ny, nx]; break
  }
  return { x: nx * 0x7ffe, y: ny * 0x7ffe }
}
