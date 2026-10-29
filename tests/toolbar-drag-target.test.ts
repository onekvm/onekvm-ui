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
assert.equal(toolbarSlotAt(vertical, 50, 633, true), 0)
assert.equal(toolbarSlotAt(vertical, 50, 635, true), 1)
assert.equal(toolbarSlotAt(vertical, 50, 850, true), 5)
assert.equal(toolbarSlotAt([], 0, 0), -1)
console.log('toolbar drag target tests passed')
