import assert from 'node:assert/strict'

import {
  clampOverlayPosition,
  overlayDragHostRect,
  overlayGrabOffset,
  overlayMountHostRect,
  overlayPercentToPosition,
  overlayPlaceBottomCenter,
  overlayPointerPosition,
  overlayPositionToPercent,
  resizeAnchoredBox,
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

const oversized = clampOverlayPosition(
  { x: 720, y: 200 },
  { width: 1400, height: 587 },
  { left: 0, top: 42, width: 1280, height: 535 },
)
assert.equal(oversized.x, 720)
assert.equal(oversized.y, 200)
const oversizedAtBottom = clampOverlayPosition(
  { x: 720, y: 900 },
  { width: 1400, height: 587 },
  { left: 0, top: 42, width: 1280, height: 535 },
)
assert.equal(oversizedAtBottom.y, 491)

const start = { x: 100, y: 100, width: 200, height: 150 }
const se = resizeAnchoredBox('se', 400, 300, start, 80, 80, host)
assert.equal(se.x, 100)
assert.equal(se.y, 100)
assert.equal(se.width, 300)
assert.equal(se.height, 200)

const nw = resizeAnchoredBox('nw', 50, 50, start, 80, 80, host)
assert.equal(nw.x, 50)
assert.equal(nw.y, 50)
assert.equal(nw.width, 250)
assert.equal(nw.height, 200)

const tooSmall = resizeAnchoredBox('se', 120, 110, start, 80, 80, host)
assert.equal(tooSmall.width, 80)
assert.equal(tooSmall.height, 80)

const percent = overlayPositionToPercent({ x: 8, y: 8 }, panel, host)
assert.equal(Math.round(percent.x), 0)
assert.equal(Math.round(percent.y), 0)
const restored = overlayPercentToPosition({ x: 100, y: 100 }, panel, host)
assert.equal(restored.x, 892)
assert.equal(restored.y, 510)

const leftStage = { left: 80, top: 0, width: 1200, height: 800 }
const leftHost = overlayDragHostRect(workspace, leftStage, { width: 1280, height: 800 })
const leftPanel = { left: 104, top: 18, width: 380, height: 240 }
const leftGrab = overlayGrabOffset(160, 36, leftPanel)
const leftPinned = overlayPointerPosition(160, 36, leftHost, leftGrab)
assert.equal(leftPinned.x, 24)
assert.equal(leftPinned.y, 18)

const bodyHost = overlayMountHostRect('body', { width: 390, height: 844 })
assert.equal(bodyHost.left, 0)
assert.equal(bodyHost.top, 0)
assert.equal(bodyHost.width, 390)
assert.equal(bodyHost.height, 844)

const docked = overlayPlaceBottomCenter({ width: 374, height: 280 }, bodyHost)
assert.equal(docked.x, 8)
assert.equal(docked.y, 556)

console.log('overlay-drag tests passed')
