export type HIDIndicatorState = 'ready' | 'waiting' | 'error'
export type HIDHostAlert = 'disconnected' | 'unavailable'

export function hidIndicatorState(hid?: { available: boolean; connected: boolean } | null): HIDIndicatorState {
  if (!hid) return 'waiting'
  if (!hid.available) return 'error'
  if (hid.connected) return 'ready'
  return 'error'
}

export function hidHostAlert(hid?: { available: boolean; connected: boolean } | null): HIDHostAlert | null {
  if (!hid) return null
  if (!hid.available) return 'unavailable'
  if (!hid.connected) return 'disconnected'
  return null
}
