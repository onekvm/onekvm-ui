import assert from 'node:assert/strict'
import { toolbarPinCapacity } from '../src/lib/toolbar-pin-capacity.ts'

assert.equal(toolbarPinCapacity(5, 166), 5, 'Five pins fit without reserving a needless overflow button')
assert.equal(toolbarPinCapacity(5, 165), 3, 'Reserve room for overflow at the fitting boundary')
assert.equal(toolbarPinCapacity(5, 98), 2)
assert.equal(toolbarPinCapacity(5, 30), 0, 'Only overflow fits')
assert.equal(toolbarPinCapacity(5, -10), 0)
assert.equal(toolbarPinCapacity(5, 98, 2), 5, 'Vertical toolbar uses both columns')
assert.equal(toolbarPinCapacity(7, 98, 2), 5)
assert.equal(toolbarPinCapacity(0, 100), 0)
console.log('toolbar pin capacity tests passed')
