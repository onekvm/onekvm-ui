import assert from 'node:assert/strict'
import { toolbarDropBefore, toolbarSlotAt, type ToolbarSlotRect } from '../src/lib/toolbar-drag-target.ts'

const rect = (left: number, width: number): ToolbarSlotRect => ({ left, right: left + width, top: 5, bottom: 35 })
// The keyboard starts at the far right. A pointer in the 4px gap after
// Display must insert there, rather than append to the whole toolbar.
const slots = [rect(602, 30), rect(636, 30), rect(670, 30), rect(704, 8), rect(716, 81), rect(801, 30)]
assert.equal(toolbarSlotAt(slots, 633, 20), 0)
assert.equal(toolbarSlotAt(slots, 635, 20), 1)
assert.equal(toolbarSlotAt(slots, 634, 20), 0)
assert.equal(toolbarSlotAt(slots, 650, 20), 1)
// Surface padding, narrow separators and the wider account button.
assert.equal(toolbarSlotAt(slots, 590, 20), 0)
assert.equal(toolbarSlotAt(slots, 850, 20), 5)
assert.equal(toolbarSlotAt(slots, 706, 20), 3)
assert.equal(toolbarSlotAt(slots, 750, 20), 4)
// DOM order need not match CSS flex order.
assert.equal(toolbarSlotAt([slots[3]!, slots[1]!, slots[5]!, slots[0]!], 634, 20), 3)
// Vertical toolbar / folder list use the same gap behavior on the Y axis.
const vertical = slots.map(r => ({ left: 5, right: 105, top: r.left, bottom: r.right }))
assert.equal(toolbarSlotAt(vertical, 50, 633, 'vertical'), 0)
assert.equal(toolbarSlotAt(vertical, 50, 635, 'vertical'), 1)
assert.equal(toolbarSlotAt(vertical, 50, 850, 'vertical'), 5)
// Side docks have two columns. The right cell must remain reachable, and
// full-row separators/account controls must not mask the cells above them.
const grid = [rect(6, 31), rect(41, 31),
  { left: 6, right: 37, top: 39, bottom: 69 },
  { left: 41, right: 72, top: 39, bottom: 69 },
  { left: 6, right: 72, top: 73, bottom: 85 }]
assert.equal(toolbarSlotAt(grid, 56, 20, 'grid'), 1)
assert.equal(toolbarSlotAt(grid, 56, 54, 'grid'), 3)
assert.equal(toolbarSlotAt(grid, 38, 20, 'grid'), 0)
assert.equal(toolbarSlotAt(grid, 40, 20, 'grid'), 1)
assert.equal(toolbarSlotAt(grid, 56, 37, 'grid'), 1)
assert.equal(toolbarSlotAt(grid, 56, 79, 'grid'), 4)
assert.equal(toolbarSlotAt([], 0, 0), -1)
// Leaving Keyboard's merge zone toward its LED inserts after Keyboard. The
// dragged Power icon and unavailable Audio/Gamepad must not become anchors:
// an invisible anchor would make the preview append at the far right.
const order = ['mouse', 'keyboard', 'gamepad', 'power', 'audio', 'virtual_media', 'settings']
const visible = new Set(['mouse', 'keyboard', 'power', 'virtual_media', 'settings'])
assert.equal(toolbarDropBefore(order, visible, 'power', 'keyboard', true), 'virtual_media')
assert.equal(toolbarDropBefore(order, visible, 'mouse', 'keyboard', false), 'keyboard')
assert.equal(toolbarDropBefore(order, visible, 'power', 'settings', true), undefined)
// Closed folder members and hidden separators also cannot anchor root drops.
assert.equal(toolbarDropBefore(['keyboard', 'mouse', 'separator:controls', 'folder:input', 'settings'],
  new Set(['keyboard', 'folder:input', 'settings']), 'settings', 'keyboard', true), 'folder:input')
// Folder lists use their own visible members and skip the dragged member.
assert.equal(toolbarDropBefore(['keyboard', 'mouse', 'audio', 'power'],
  new Set(['keyboard', 'mouse', 'power']), 'mouse', 'keyboard', true), 'power')
console.log('toolbar drag target tests passed')
