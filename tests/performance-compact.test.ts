import assert from 'node:assert/strict'

import { formatCompactBitrate } from '../src/lib/performance-compact.ts'

assert.equal(formatCompactBitrate(0), '0')
assert.equal(formatCompactBitrate(96), '96k')
assert.equal(formatCompactBitrate(4200), '4.2M')
assert.equal(formatCompactBitrate(18500), '19M')

console.log('performance-compact tests passed')
