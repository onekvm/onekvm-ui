export type HIDIndicatorState = 'ready' | 'waiting' | 'error'

export function hidIndicatorState(hid?: { available: boolean; connected: boolean } | null): HIDIndicatorState {
  if (!hid) return 'waiting'
  if (!hid.available) return 'error'
  if (hid.connected) return 'ready'
  return 'error'
}
