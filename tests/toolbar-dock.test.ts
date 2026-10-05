import assert from 'node:assert/strict'

import {
  clampToolbarPosition,
  parseToolbarDock,
  parseToolbarLauncher,
  previewToolbarSnap,
  toolbarSnapHintI18nKey,
  snapToolbarDock,
  defaultToolbarLauncherPosition,
  resolveToolbarLauncherPosition,
  toolbarLauncherActive,
  toolbarLauncherMenuAlign,
  toolbarLauncherMenuPlacement,
  toolbarHandleVisible,
  floatingToolbarHideEdge,
  launcherHideEdge,
  toolbarHideOffset,
  toolbarRevealHotspot,
  TOOLBAR_HIDE_PEEK_PX,
  TOOLBAR_LAUNCHER_PX,
  TOOLBAR_REVEAL_HIT_PX,
  toolbarMenuPlacement,
  toolbarMorphDuration,
  toolbarMorphFromRects,
  toolbarMorphKeyframes,
  toolbarMorphNeeded,
  toolbarMorphTransform,
  toolbarGrabOffset,
  toolbarMorphOriginInLast,
  dockedToolbarBox,
  toolbarStageDuration,
  toolbarStageEase,
  TOOLBAR_BAR_PX,
  TOOLBAR_FLOAT_RADIUS,
  TOOLBAR_FLOAT_SHADOW,
  TOOLBAR_MORPH_REST_TRANSFORM,
  toolbarWorkspaceClass,
} from '../src/lib/toolbar-dock.ts'

assert.deepEqual(parseToolbarDock(null), { dock: 'top', x: 0, y: 0 })
assert.deepEqual(parseToolbarDock('nope'), { dock: 'top', x: 0, y: 0 })
assert.deepEqual(parseToolbarDock('{"dock":"float","x":12.4,"y":80}'), {
  dock: 'float',
  x: 12.4,
  y: 80,
})

const clamped = clampToolbarPosition(-40, 900, 200, 42, 1000, 800)
assert.equal(clamped.x, 0)
assert.equal(clamped.y, 758)

const top = snapToolbarDock(80, 10, 400, 42, 1280, 800)
assert.equal(top.dock, 'top')

const bottom = snapToolbarDock(80, 770, 400, 42, 1280, 800)
assert.equal(bottom.dock, 'bottom')

const left = snapToolbarDock(8, 120, 420, 42, 1280, 800)
assert.equal(left.dock, 'left')

const right = snapToolbarDock(872, 120, 400, 42, 1280, 800)
assert.equal(right.dock, 'right')

const floating = snapToolbarDock(200, 200, 400, 42, 1280, 800)
assert.equal(floating.dock, 'float')
assert.equal(floating.x, 200)
assert.equal(floating.y, 200)

const nearEdge = snapToolbarDock(80, 40, 400, 42, 1280, 800)
assert.equal(nearEdge.dock, 'float')
assert.equal(nearEdge.y, 40)

const restoreTop = snapToolbarDock(200, 120, 400, 42, 1280, 800, undefined, 640, 8)
assert.equal(restoreTop.dock, 'top')

const keepFloat = snapToolbarDock(200, 120, 400, 42, 1280, 800, undefined, 640, 300)
assert.equal(keepFloat.dock, 'float')

assert.deepEqual(previewToolbarSnap(80, 10, 400, 42, 1280, 800), { dock: 'top', mode: 'snap' })
assert.deepEqual(previewToolbarSnap(80, 40, 400, 42, 1280, 800), { dock: 'top', mode: 'place' })
assert.equal(previewToolbarSnap(200, 200, 400, 42, 1280, 800), null)
assert.equal(toolbarSnapHintI18nKey({ dock: 'top', mode: 'snap' }), 'toolbar.snapHint.snap.top')
assert.equal(toolbarSnapHintI18nKey({ dock: 'right', mode: 'place' }), 'toolbar.snapHint.place.right')

assert.equal(floatingToolbarHideEdge(80, 10, 400, 42, 1280, 800), null)
assert.equal(floatingToolbarHideEdge(80, 40, 400, 42, 1280, 800), 'top')
assert.equal(floatingToolbarHideEdge(200, 200, 400, 42, 1280, 800), null)
assert.equal(floatingToolbarHideEdge(40, 200, 80, 400, 1280, 800), 'left')

assert.equal(launcherHideEdge(200, 200, 390, 844), null)
assert.equal(launcherHideEdge(390 - 48 - 16, 844 - 48 - 16, 390, 844), null)
assert.equal(launcherHideEdge(390 - 48, 400, 390, 844), 'right')
assert.equal(launcherHideEdge(0, 400, 390, 844), 'left')
assert.equal(launcherHideEdge(200, 0, 390, 844), 'top')

const hideTop = toolbarHideOffset('top', 200, 40, 400, 42, 1280, 800)
assert.equal(hideTop.x, 0)
assert.equal(hideTop.y, TOOLBAR_HIDE_PEEK_PX - 42 - 40)

const hideBottom = toolbarHideOffset('bottom', 200, 700, 400, 42, 1280, 800)
assert.equal(hideBottom.x, 0)
assert.equal(hideBottom.y, 800 - TOOLBAR_HIDE_PEEK_PX - 700)

const hideRight = toolbarHideOffset('right', 800, 120, 400, 42, 1280, 800)
assert.equal(hideRight.x, 1280 - TOOLBAR_HIDE_PEEK_PX - 800)
assert.equal(hideRight.y, 0)

const hotspotTop = toolbarRevealHotspot('top', 200, 40, 400, 42, 1280, 800)
assert.equal(hotspotTop.top, 0)
assert.equal(hotspotTop.height, TOOLBAR_REVEAL_HIT_PX)
assert.equal(hotspotTop.left, 200)
assert.equal(hotspotTop.width, 400)

assert.equal(toolbarMenuPlacement('top'), 'bottom-end')
assert.equal(toolbarMenuPlacement('float'), 'bottom-end')
assert.equal(toolbarMenuPlacement('bottom'), 'top-end')
assert.equal(toolbarMenuPlacement('left'), 'right-start')
assert.equal(toolbarMenuPlacement('right'), 'left-start')

assert.equal(toolbarWorkspaceClass('top'), 'toolbar-dock-top')
assert.equal(toolbarWorkspaceClass('bottom'), 'toolbar-dock-bottom')
assert.equal(toolbarWorkspaceClass('left'), 'toolbar-dock-left')
assert.equal(toolbarWorkspaceClass('right'), 'toolbar-dock-right')
assert.equal(toolbarWorkspaceClass('float'), 'toolbar-overlay')
assert.equal(toolbarStageDuration('float'), 280)
assert.equal(toolbarStageDuration('top'), 420)
assert.equal(toolbarStageEase('float'), 'cubic-bezier(0.32, 0.72, 0, 1)')
assert.equal(toolbarStageEase('left'), 'cubic-bezier(0.32, 0.72, 0, 1)')

assert.equal(toolbarHandleVisible('top', false), false)
assert.equal(toolbarHandleVisible('left', false), false)
assert.equal(toolbarHandleVisible('top', true), true)
assert.equal(toolbarHandleVisible('left', true), true)
assert.equal(toolbarHandleVisible('float', false), true)

assert.equal(toolbarLauncherActive(760), true)
assert.equal(toolbarLauncherActive(761), false)
assert.equal(toolbarLauncherActive(390, 844), true)
assert.equal(toolbarLauncherActive(667, 375), true)
assert.equal(toolbarLauncherActive(844, 390), true)
assert.equal(toolbarLauncherActive(760, 360), true)
assert.equal(toolbarLauncherActive(1100, 500), true)
assert.equal(toolbarLauncherActive(1101, 500), false)
assert.equal(toolbarLauncherActive(1024, 768), false)
assert.equal(toolbarLauncherActive(1920, 1080), false)
assert.equal(parseToolbarLauncher(null), null)
assert.equal(parseToolbarLauncher('nope'), null)
assert.deepEqual(parseToolbarLauncher('{"x":24.5,"y":80}'), { x: 24.5, y: 80 })

const launcherDefault = defaultToolbarLauncherPosition(360, 640)
assert.equal(launcherDefault.x, 360 - TOOLBAR_LAUNCHER_PX - 16)
assert.equal(launcherDefault.y, 640 - TOOLBAR_LAUNCHER_PX - 16)

const launcherClamped = resolveToolbarLauncherPosition({ x: -40, y: 900 }, 360, 640)
assert.equal(launcherClamped.x, 0)
assert.equal(launcherClamped.y, 640 - TOOLBAR_LAUNCHER_PX)

const launcherMissing = resolveToolbarLauncherPosition(null, 360, 640)
assert.deepEqual(launcherMissing, launcherDefault)

const launcherLowerRight = toolbarLauncherMenuAlign(296, 576, 360, 640)
assert.equal(launcherLowerRight.above, true)
assert.equal(launcherLowerRight.end, true)
assert.equal(toolbarLauncherMenuPlacement(launcherLowerRight), 'top-end')

const launcherUpperLeft = toolbarLauncherMenuAlign(8, 12, 360, 640)
assert.equal(launcherUpperLeft.above, false)
assert.equal(launcherUpperLeft.end, false)
assert.equal(toolbarLauncherMenuPlacement(launcherUpperLeft), 'bottom-start')

const morph = toolbarMorphFromRects(
  { left: 0, top: 0, width: 1000, height: 42 },
  { left: 120, top: 80, width: 400, height: 42 },
)
assert.equal(morph.x, -120)
assert.equal(morph.y, -80)
assert.equal(morph.scaleX, 2.5)
assert.equal(morph.scaleY, 1)
assert.equal(toolbarMorphTransform(morph), 'translate(-120px, -80px) scale(2.5, 1)')
assert.equal(toolbarMorphNeeded(morph), true)
assert.equal(
  toolbarMorphNeeded({ x: 0, y: 0, scaleX: 1, scaleY: 1 }),
  false,
)
assert.equal(toolbarMorphDuration(true), 420)
assert.equal(toolbarMorphDuration(false), 280)

const railMorph = toolbarMorphFromRects(
  { left: 0, top: 0, width: 80, height: 800 },
  { left: 40, top: 120, width: 400, height: 42 },
)
assert.equal(railMorph.scaleX, 0.2)
assert.equal(railMorph.scaleY, 800 / 42)

const originMorph = toolbarMorphFromRects(
  { left: 0, top: 0, width: 1000, height: 42 },
  { left: 100, top: 10, width: 400, height: 42 },
  { x: 200, y: 21 },
)
assert.equal(originMorph.scaleX, 2.5)
assert.equal(originMorph.x, 200)
assert.equal(originMorph.y, -10)

assert.deepEqual(
  toolbarMorphOriginInLast(
    { left: 80, top: 40, width: 400, height: 42 },
    { left: 0, top: 0, width: 1280, height: 42 },
    { x: 24, y: 12 },
  ),
  { x: 104, y: 52 },
)

assert.deepEqual(
  toolbarGrabOffset(
    { left: 10, top: 20, width: 400, height: 42 },
    { left: 18, top: 26, width: 32, height: 18 },
    0.5,
    0.5,
  ),
  { x: 24, y: 15 },
)

assert.deepEqual(dockedToolbarBox('top', 1280, 800), { left: 0, top: 0, width: 1280, height: TOOLBAR_BAR_PX })
assert.deepEqual(dockedToolbarBox('bottom', 1280, 800), { left: 0, top: 758, width: 1280, height: TOOLBAR_BAR_PX })
assert.deepEqual(dockedToolbarBox('left', 1280, 800), { left: 0, top: 0, width: 80, height: 800 })
assert.deepEqual(dockedToolbarBox('right', 1280, 800), { left: 1200, top: 0, width: 80, height: 800 })

const first = { left: 0, top: 0, width: 1000, height: 42 }
const last = { left: 120, top: 80, width: 400, height: 42 }
const followed = { left: 200, top: 140, width: 400, height: 42 }
const collapse = toolbarMorphKeyframes(first, last, false)
assert.equal(collapse[0].borderRadius, '0px')
assert.equal(collapse[1].borderRadius, TOOLBAR_FLOAT_RADIUS)
assert.equal(collapse[1].boxShadow, TOOLBAR_FLOAT_SHADOW)
assert.equal(collapse[1].transform, TOOLBAR_MORPH_REST_TRANSFORM)
const follow = toolbarMorphKeyframes(first, followed, false)
assert.equal(
  follow[0].transform,
  toolbarMorphTransform(toolbarMorphFromRects(first, followed)),
)
assert.notEqual(follow[0].transform, collapse[0].transform)

console.log('toolbar-dock tests passed')
