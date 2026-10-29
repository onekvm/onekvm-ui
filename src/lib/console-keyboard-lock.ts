export type ConsoleKeyboardLock = {
  lock: () => Promise<void>
  unlock: () => void
}

export type ConsoleFullscreenOptions = FullscreenOptions & { keyboardLock?: boolean }

/** Firefox and Safari take the lock with fullscreen. Chrome ignores this field. */
export function consoleFullscreenOptions(): ConsoleFullscreenOptions {
  return { navigationUI: 'hide', keyboardLock: true }
}

// Chrome resolves lock() and then drops it when the tab is not yet fullscreen.
// Later calls must wait, or a rejected request is left holding the keyboard.
let pending = Promise.resolve()

export function syncConsoleKeyboardLock(
  active: boolean,
  keyboard: ConsoleKeyboardLock | undefined,
): Promise<void> {
  const run = pending.then(async () => {
    if (!keyboard) return
    if (!active) {
      keyboard.unlock()
      return
    }
    await keyboard.lock()
  })
  pending = run.then(() => undefined, () => undefined)
  return run
}
