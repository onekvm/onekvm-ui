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

type HIDInputState = { available: boolean; connected: boolean; write_stalled?: boolean }

/** Key presses, clicks, wheel turns and gamepad buttons; not pointer motion. */
export function hidReportIsPress(report: Uint8Array): boolean {
  switch (report[0]) {
    case 1: return report.subarray(1, 8).some(Boolean)
    case 2: return Boolean(report[1] || report[4])
    case 3: return Boolean(report[1])
    case 4: return Boolean(report[1] || report[2])
    default: return false
  }
}

/** The host has not connected the USB keyboard and mouse. */
export function usbInputDisconnected(hid?: HIDInputState | null): boolean {
  return Boolean(hid?.available && !hid.connected)
}

/** The host is connected but has stopped reading keyboard and mouse reports. */
export function usbInputStalled(hid?: HIDInputState | null): boolean {
  return Boolean(hid?.available && hid.connected && hid.write_stalled)
}
