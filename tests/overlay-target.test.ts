import assert from 'node:assert/strict'

import {
  DISMISS_CONTROL_OVERLAY_EVENT,
  dismissControlOverlays,
  overlayMountTarget,
} from '../src/lib/overlay-target.ts'

assert.equal(overlayMountTarget(null), 'body')
assert.equal(overlayMountTarget(undefined as unknown as null), 'body')

const seen: string[] = []
Object.defineProperty(globalThis, 'window', {
  value: {
    dispatchEvent(event: Event) {
      seen.push(event.type)
      return true
    },
  },
  configurable: true,
})
dismissControlOverlays()
assert.deepEqual(seen, [DISMISS_CONTROL_OVERLAY_EVENT])

console.log('overlay-target tests passed')
