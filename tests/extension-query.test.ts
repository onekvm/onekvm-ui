import assert from 'node:assert/strict'
import { createExtensionQuery } from '../src/lib/extension-query.ts'

const events = new EventTarget()
const catalog = createExtensionQuery<string[]>(events)
const media = createExtensionQuery<string[]>(events)
let tools = ['old-tool']
let catalogCalls = 0
let mediaCalls = 0
const fetchTools = async () => { catalogCalls++; return [...tools] }
const fetchMedia = async () => { mediaCalls++; return ['media'] }
await Promise.all([catalog.get('device', fetchTools), media.get('device', fetchMedia)])
assert.deepEqual(await catalog.get('device', fetchTools), ['old-tool'])
assert.equal(catalogCalls, 1)
tools.push('newly-installed-tool')
events.dispatchEvent(new Event('onekvm:extensions-changed'))
assert.deepEqual(await catalog.get('device', fetchTools), ['old-tool', 'newly-installed-tool'])
await media.get('device', fetchMedia)
assert.equal(mediaCalls, 2)
assert.equal(catalogCalls, 2)

let resolveOld!: (value: string[]) => void
let calls = 0
const pendingFetch = () => {
  calls++
  return calls === 1 ? new Promise<string[]>(resolve => { resolveOld = resolve }) : Promise.resolve(['installed-tool'])
}
const pending = catalog.get('pending', pendingFetch)
await Promise.resolve()
events.dispatchEvent(new Event('onekvm:extensions-changed'))
const refreshed = catalog.get('pending', pendingFetch)
resolveOld([])
assert.deepEqual(await pending, ['installed-tool'])
assert.deepEqual(await refreshed, ['installed-tool'])
assert.equal(calls, 2)

let rejectOld!: (error: Error) => void
let attempts = 0
const retryFetch = () => ++attempts === 1
  ? new Promise<string[]>((_, reject) => { rejectOld = reject }) : Promise.resolve(['restored-after-rollback'])
const obsolete = catalog.get('rollback', retryFetch)
await Promise.resolve()
events.dispatchEvent(new Event('onekvm:extensions-changed'))
rejectOld(new Error('obsolete query'))
assert.deepEqual(await obsolete, ['restored-after-rollback'])
assert.equal(attempts, 2)
assert.deepEqual(await catalog.get('device', fetchTools, true), tools)
await assert.rejects(catalog.get('failure', async () => { throw new Error('current failure') }), /current failure/)
console.log('Extension queries refresh installed tools and media, including in-flight and rollback queries')
