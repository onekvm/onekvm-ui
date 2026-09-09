import assert from 'node:assert/strict'

import {
  nextUploadSpeed,
  uploadPercentage,
  uploadRemainingSeconds,
} from '../src/lib/upload-speed.ts'

assert.equal(uploadPercentage(0, 0), 0)
assert.equal(uploadPercentage(50, 100), 50)
assert.equal(uploadPercentage(1, 3), 33.3)
assert.equal(uploadPercentage(100, 100), 100)

assert.equal(nextUploadSpeed(0, 10, 10, 50), null)
assert.equal(nextUploadSpeed(0, 9, 10, 200), null)
assert.equal(nextUploadSpeed(0, 1000, 0, 200), 5000)
assert.equal(nextUploadSpeed(5000, 2000, 1000, 200), 5000 * 0.7 + 5000 * 0.3)

assert.equal(uploadRemainingSeconds(100, 40, 0, true), 0)
assert.equal(uploadRemainingSeconds(100, 100, 10, true), 0)
assert.equal(uploadRemainingSeconds(100, 40, 10, false), 0)
assert.equal(uploadRemainingSeconds(100, 40, 10, true), 6)

console.log('upload speed tests passed')
