import assert from 'node:assert/strict'
import { toolbarSlotAt, type ToolbarSlotRect } from '../src/lib/toolbar-drag-target.ts'

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
console.log('toolbar drag target tests passed')
