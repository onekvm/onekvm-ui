// Fingers on the picture become contacts of the controlled device's USB
// touchscreen. Every report lists each finger still touching (flags 1) and,
// once, each finger that has lifted (flags 0); after that its id is free.

import { COARSE_POINTER_QUERY } from './mobile-viewport.ts'

export type MouseMode = 'absolute' | 'relative' | 'touchscreen'

/** Phones and tablets, where a finger is the primary pointer. */
export function primaryTouchDevice() {
  return typeof window !== 'undefined' && window.matchMedia?.(COARSE_POINTER_QUERY)?.matches === true
}

/**
 * On a touch device the second mouse mode is Touchscreen instead of Relative;
 * a stored choice of either one maps to the mode this device offers.
 */
export function mouseModesFor(touchDevice: boolean): readonly MouseMode[] {
  return touchDevice ? ['absolute', 'touchscreen'] : ['absolute', 'relative']
}

export function parseMouseMode(stored: string | null, touchDevice: boolean): MouseMode {
  if (stored !== 'relative' && stored !== 'touchscreen') return 'absolute'
  return touchDevice ? 'touchscreen' : 'relative'
}

export const TOUCHSCREEN_MAX_CONTACTS = 10
/** A held contact is sent again at this interval; OneKVM lifts it after 1 s without one. */
export const TOUCHSCREEN_KEEPALIVE_MS = 200
export const TOUCH_REPORT_TYPE = 5
export const TOUCH_CONTACT_TOUCHING = 1
const TOUCH_CONTACT_BYTES = 6
const TOUCH_ABSOLUTE_MAX = 0x7fff

export interface TouchContact {
  /** Contact id, 0..9. */
  id: number
  /** 1 while touching, 0 when lifted. */
  flags: number
  /** Absolute position, 0..32767 across the picture. */
  x: number
  y: number
}

interface ContactState {
  x: number
  y: number
  touching: boolean
}

export class TouchscreenContacts {
  private readonly ids = new Map<number, number>()
  private readonly contacts = new Map<number, ContactState>()

  /** At least one finger is still touching. */
  get active() {
    return this.ids.size > 0
  }

  /** The next report would carry at least one contact. */
  get pending() {
    return this.contacts.size > 0
  }

  has(pointerId: number) {
    return this.ids.has(pointerId)
  }

  /** Takes the lowest free id; false when the pointer is known or all ids are used. */
  down(pointerId: number, x: number, y: number) {
    if (this.ids.has(pointerId)) return false
    const id = this.freeId()
    if (id < 0) return false
    this.ids.set(pointerId, id)
    this.contacts.set(id, { x, y, touching: true })
    return true
  }

  /** Records the latest position; true when it changed. */
  move(pointerId: number, x: number, y: number) {
    const contact = this.contactOf(pointerId)
    if (!contact || (contact.x === x && contact.y === y)) return false
    contact.x = x
    contact.y = y
    return true
  }

  up(pointerId: number) {
    const contact = this.contactOf(pointerId)
    if (!contact) return false
    contact.touching = false
    this.ids.delete(pointerId)
    return true
  }

  /** Lifts every finger; true when a report is due. */
  cancel() {
    for (const id of this.ids.values()) {
      const contact = this.contacts.get(id)
      if (contact) contact.touching = false
    }
    this.ids.clear()
    return this.pending
  }

  /** Contacts for the next report, ordered by id. Lifted ids become free. */
  report(): TouchContact[] {
    const ids = [...this.contacts.keys()].sort((a, b) => a - b)
    const contacts: TouchContact[] = []
    for (const id of ids) {
      const contact = this.contacts.get(id)!
      contacts.push({ id, flags: contact.touching ? TOUCH_CONTACT_TOUCHING : 0, x: contact.x, y: contact.y })
      if (!contact.touching) this.contacts.delete(id)
    }
    return contacts
  }

  private contactOf(pointerId: number) {
    const id = this.ids.get(pointerId)
    return id === undefined ? undefined : this.contacts.get(id)
  }

  private freeId() {
    for (let id = 0; id < TOUCHSCREEN_MAX_CONTACTS; id += 1) {
      if (!this.contacts.has(id)) return id
    }
    return -1
  }
}

const clampTouchAxis = (value: number) =>
  Number.isFinite(value) ? Math.max(0, Math.min(TOUCH_ABSOLUTE_MAX, Math.round(value))) : 0

/**
 * Binary report: [5, n, n × (id u8, flags u8, x u16 LE, y u16 LE)], 1 ≤ n ≤ 10.
 * Returns null for an empty list; an empty report is never sent.
 */
export function encodeTouchReport(contacts: readonly TouchContact[]): Uint8Array | null {
  const count = Math.min(contacts.length, TOUCHSCREEN_MAX_CONTACTS)
  if (count < 1) return null
  const report = new Uint8Array(2 + count * TOUCH_CONTACT_BYTES)
  const view = new DataView(report.buffer)
  report[0] = TOUCH_REPORT_TYPE
  report[1] = count
  for (let index = 0; index < count; index += 1) {
    const contact = contacts[index]
    const offset = 2 + index * TOUCH_CONTACT_BYTES
    report[offset] = contact.id & 0xff
    report[offset + 1] = contact.flags & 0xff
    view.setUint16(offset + 2, clampTouchAxis(contact.x), true)
    view.setUint16(offset + 4, clampTouchAxis(contact.y), true)
  }
  return report
}
