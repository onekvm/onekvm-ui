import assert from 'node:assert/strict'

import { APIError, isUnauthorizedError } from '../src/api/client.ts'

assert.equal(isUnauthorizedError(new APIError('authentication required', 401)), true)
assert.equal(isUnauthorizedError(new APIError('permission denied', 403)), false)
assert.equal(isUnauthorizedError(new Error('WebRTC connection failed')), false)
assert.equal(isUnauthorizedError(null), false)

console.log('api-error tests passed')
