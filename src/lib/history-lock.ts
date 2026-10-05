export const CONSOLE_HISTORY_GUARD = 'onekvm-console'

export type ConsoleBackOverlays = {
  trackpad: boolean
  account: boolean
  keyboard: boolean
  shortcuts: boolean
  toolbar: boolean
}

export type ConsoleBackAction =
  | { type: 'navigate-settings' }
  | { type: 'close'; overlay: keyof ConsoleBackOverlays }
  | { type: 'stay' }

export function consumeConsoleBack(inSettings: boolean, overlays: ConsoleBackOverlays): ConsoleBackAction {
  if (inSettings) return { type: 'navigate-settings' }
  if (overlays.trackpad) return { type: 'close', overlay: 'trackpad' }
  if (overlays.keyboard) return { type: 'close', overlay: 'keyboard' }
  if (overlays.account) return { type: 'close', overlay: 'account' }
  if (overlays.shortcuts) return { type: 'close', overlay: 'shortcuts' }
  if (overlays.toolbar) return { type: 'close', overlay: 'toolbar' }
  return { type: 'stay' }
}

export function lockConsoleHistory(win: Pick<Window, 'history' | 'location'> = window) {
  const url = `${win.location.pathname}${win.location.search}${win.location.hash}`
  win.history.pushState({ onekvmGuard: CONSOLE_HISTORY_GUARD }, '', url)
}
