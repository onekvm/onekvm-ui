import { onBeforeUnmount, shallowRef } from 'vue'

import type { OneKVMStatus } from '@/api/client'
import type { KeyboardLEDState } from '@/lib/onekvm'
import { KeyboardLockTracker, type KeyboardLockChange, type KeyboardLockState } from '@/lib/keyboard-lock-state'

type HIDStatus = OneKVMStatus['hid']
type LockFlags = Pick<HIDStatus, 'caps_lock' | 'num_lock' | 'scroll_lock'>

export function useKeyboardLockOverlay() {
  const changes = shallowRef<readonly KeyboardLockChange[]>([])
  const tracker = new KeyboardLockTracker()
  let hostConnected = false
  let controlLED: KeyboardLEDState | null = null
  let hideTimer = 0

  function dismiss() {
    window.clearTimeout(hideTimer)
    hideTimer = 0
    changes.value = []
  }

  function update(locks: KeyboardLockState | null) {
    const next = tracker.update(locks)
    if (!next.length) return
    dismiss()
    changes.value = next
    hideTimer = window.setTimeout(dismiss, 2000)
  }

  function reset() {
    controlLED = null
    tracker.update(null)
    dismiss()
  }

  function controlFlags(led: KeyboardLEDState): LockFlags {
    return {
      caps_lock: led.known ? led.capsLock : undefined,
      num_lock: led.known ? led.numLock : undefined,
      scroll_lock: led.known ? led.scrollLock : undefined,
    }
  }

  function applyStatus(hid: HIDStatus): HIDStatus {
    hostConnected = hid.available && hid.connected
    if (!hostConnected) {
      reset()
      return { ...hid, caps_lock: undefined, num_lock: undefined, scroll_lock: undefined }
    }
    // WebSocket reports arrive sooner than SSE snapshots. Once available,
    // keep them authoritative so a delayed snapshot cannot revert a lock.
    const next = controlLED ? { ...hid, ...controlFlags(controlLED) } : hid
    update({ capsLock: next.caps_lock, numLock: next.num_lock, scrollLock: next.scroll_lock })
    return next
  }

  function applyLED(led: KeyboardLEDState): LockFlags {
    // Retain the first report even if it arrives before the initial status.
    if (!controlLED || !led.known) {
      tracker.update(null)
      dismiss()
    }
    controlLED = { ...led }
    if (hostConnected) update(led.known ? led : null)
    return controlFlags(led)
  }

  onBeforeUnmount(reset)

  return { changes, applyStatus, applyLED }
}
