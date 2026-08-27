import assert from 'node:assert/strict'

import {
  clampToolbarPosition,
  parseToolbarDock,
  snapToolbarDock,
  toolbarHandleVisible,
  toolbarMenuPlacement,
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

const right = snapToolbarDock(860, 120, 400, 42, 1280, 800)
assert.equal(right.dock, 'right')

const floating = snapToolbarDock(200, 200, 400, 42, 1280, 800)
assert.equal(floating.dock, 'float')
assert.equal(floating.x, 200)
assert.equal(floating.y, 200)

const restoreTop = snapToolbarDock(200, 120, 400, 42, 1280, 800, undefined, 640, 24)
assert.equal(restoreTop.dock, 'top')

const keepFloat = snapToolbarDock(200, 120, 400, 42, 1280, 800, undefined, 640, 300)
assert.equal(keepFloat.dock, 'float')

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

assert.equal(toolbarHandleVisible('top', false), false)
assert.equal(toolbarHandleVisible('left', false), false)
assert.equal(toolbarHandleVisible('top', true), true)
assert.equal(toolbarHandleVisible('left', true), true)
assert.equal(toolbarHandleVisible('float', false), true)

console.log('toolbar-dock tests passed')
