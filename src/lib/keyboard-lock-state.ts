export const KEYBOARD_LOCKS = ['capsLock', 'numLock', 'scrollLock'] as const

export type KeyboardLock = typeof KEYBOARD_LOCKS[number]
export type KeyboardLockState = Partial<Record<KeyboardLock, boolean>>
export interface KeyboardLockChange {
  lock: KeyboardLock
  on: boolean
}

export class KeyboardLockTracker {
  private previous: KeyboardLockState = {}

  update(next: KeyboardLockState | null): KeyboardLockChange[] {
    const changes: KeyboardLockChange[] = []
    for (const lock of KEYBOARD_LOCKS) {
      const on = next?.[lock]
      if (typeof on === 'boolean' && typeof this.previous[lock] === 'boolean' && on !== this.previous[lock]) {
        changes.push({ lock, on })
      }
    }
    this.previous = { ...next }
    return changes
  }
}
