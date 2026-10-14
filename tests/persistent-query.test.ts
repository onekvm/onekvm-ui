import assert from 'node:assert/strict'
import { createPersistentQuery } from '../src/lib/persistent-query.ts'

const cache = createPersistentQuery<number>()
let calls = 0
const fetcher = async () => ++calls
assert.deepEqual(await Promise.all([cache.get('device', fetcher), cache.get('device', fetcher)]), [1, 1])
assert.equal(await cache.get('device', fetcher), 1)
assert.equal(calls, 1)
assert.equal(await cache.get('other-device', fetcher), 2)
cache.invalidate()
assert.equal(await cache.get('device', fetcher), 3)
assert.equal(await cache.get('device', fetcher, true), 4)
let rejectOld!: (error: Error) => void
const old = cache.get('pending', () => new Promise<number>((_, reject) => { rejectOld = reject }))
await Promise.resolve()
cache.invalidate()
const next = cache.get('pending', fetcher)
rejectOld(new Error('old request failed'))
await assert.rejects(old)
assert.equal(await cache.get('pending', fetcher), await next)
assert.equal(calls, 5)
let resolveOld!: (value: number) => void
const stale = cache.get('stale', () => new Promise<number>(resolve => { resolveOld = resolve }))
await Promise.resolve()
cache.invalidate()
const fresh = cache.get('stale', fetcher)
resolveOld(-1)
assert.equal(await stale, -1)
assert.equal(await cache.get('stale', fetcher), await fresh)
await assert.rejects(cache.get('failure', async () => { throw new Error('retry me') }))
assert.equal(await cache.get('failure', fetcher), 7)
console.log('Persistent query: deduplication, explicit refresh, device scope, retries and stale requests passed')
