export type ConsoleKeyboardLock = {
  lock: () => Promise<void>
  unlock: () => void
}

export type ConsoleFullscreenOptions = FullscreenOptions & { keyboardLock?: boolean }

/** Firefox and Safari take the lock with fullscreen. Chrome ignores this field. */
export function consoleFullscreenOptions(): ConsoleFullscreenOptions {
  return { navigationUI: 'hide', keyboardLock: true }
}

// Chrome resolves lock() and then drops it when the browser window is not yet
// fullscreen. fullscreenchange can run before that, so a single call is lost.
// Later calls must wait, or a rejected request is left holding the keyboard.
export const consoleKeyboardLockRetryDelaysMs = [0, 50, 250, 1000]

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

export function scheduleConsoleKeyboardLock(
  active: () => boolean,
  keyboard: ConsoleKeyboardLock | undefined,
  schedule: (callback: () => void, delayMs: number) => () => void = (callback, delayMs) => {
    const id = setTimeout(callback, delayMs)
    return () => clearTimeout(id)
  },
): () => void {
  let stopped = false
  const cancelScheduled: Array<() => void> = []
  const attempt = () => {
    if (stopped || !active()) return
    void syncConsoleKeyboardLock(true, keyboard).catch(() => undefined)
  }
  for (const delayMs of consoleKeyboardLockRetryDelaysMs) {
    cancelScheduled.push(schedule(attempt, delayMs))
  }
  return () => {
    if (stopped) return
    stopped = true
    for (const cancel of cancelScheduled) cancel()
    void syncConsoleKeyboardLock(false, keyboard).catch(() => undefined)
  }
}
