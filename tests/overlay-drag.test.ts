import assert from 'node:assert/strict'

import {
  clampOverlayPosition,
  overlayDragHostRect,
  overlayGrabOffset,
  overlayPointerPosition,
} from '../src/lib/overlay-drag.ts'

const workspace = { left: 0, top: 0, width: 1280, height: 800 }
const stage = { left: 0, top: 42, width: 1280, height: 758 }
const panel = { left: 24, top: 100, width: 380, height: 240 }
const pointer = { x: 80, y: 118 }

const grab = overlayGrabOffset(pointer.x, pointer.y, panel)
assert.equal(grab.x, 56)
assert.equal(grab.y, 18)

const wrongHost = overlayDragHostRect(workspace, null, { width: 1280, height: 800 })
const jumped = overlayPointerPosition(pointer.x, pointer.y, wrongHost, grab)
assert.equal(jumped.x, 24)
assert.equal(jumped.y, 100)

const host = overlayDragHostRect(workspace, stage, { width: 1280, height: 800 })
assert.equal(host.top, 42)
const pinned = overlayPointerPosition(pointer.x, pointer.y, host, grab)
assert.equal(pinned.x, 24)
assert.equal(pinned.y, 58)

const clamped = clampOverlayPosition({ x: -40, y: 900 }, panel, host)
assert.equal(clamped.x, 8)
assert.equal(clamped.y, 510)

const leftStage = { left: 80, top: 0, width: 1200, height: 800 }
const leftHost = overlayDragHostRect(workspace, leftStage, { width: 1280, height: 800 })
const leftPanel = { left: 104, top: 18, width: 380, height: 240 }
const leftGrab = overlayGrabOffset(160, 36, leftPanel)
const leftPinned = overlayPointerPosition(160, 36, leftHost, leftGrab)
assert.equal(leftPinned.x, 24)
assert.equal(leftPinned.y, 18)

console.log('overlay-drag tests passed')
