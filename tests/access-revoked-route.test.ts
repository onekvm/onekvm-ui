import assert from 'node:assert/strict'

import { accessRevokedHomeURL, accessRevokedRoute, accessRevokedURL, isAccessRevoked, resolveAccessRevokedRoute } from '../src/lib/access-revoked-route.ts'

for (const [path, requested, preview] of [
  ['/#/banned', true, false],
  ['/#/banned/', true, false],
  ['/?preview=true#/banned', true, true],
  ['/#/banned?preview=true', true, true],
  ['/?preview=false#/banned', true, false],
  ['/#/banned?preview=false', true, false],
  ['/?preview=1#/banned', true, false],
  ['/?preview=TRUE#/banned', true, false],
  ['/?preview=true#/banned?preview=false', true, false],
  ['/?preview=true#/settings/advanced/system', false, false],
  ['/?preview=true', false, false],
] as const) {
  assert.deepEqual(accessRevokedRoute(new URL(path, 'https://device.local')), { requested, preview }, path)
}

let reads = 0
const locked = Object.assign(new Error('HTTP 423'), { status: 423 })
const blockedStatus = async () => { reads++; throw locked }
assert.equal(await resolveAccessRevokedRoute({ requested: false, preview: false }, blockedStatus), 'home')
assert.equal(await resolveAccessRevokedRoute({ requested: true, preview: true }, blockedStatus), 'banned')
assert.equal(reads, 0, 'Preview and ordinary routes do not query ban state')

const route = { requested: true, preview: false }
assert.equal(await resolveAccessRevokedRoute(route, blockedStatus), 'banned')
assert.equal(await resolveAccessRevokedRoute(route, async () => ({ authenticated: false })), 'home')
assert.equal(isAccessRevoked(locked), true)
for (const error of [null, undefined, 423, { status: '423' }, { status: 401 }, { status: 403 }, { status: 429 }, new Error('offline')]) {
  assert.equal(isAccessRevoked(error), false)
}
for (const status of [401, 403, 429, 503]) {
  await assert.rejects(resolveAccessRevokedRoute(route, async () => { throw Object.assign(new Error('HTTP ' + status), { status }) }))
}
assert.equal(accessRevokedURL(new URL('https://cloud.local/device-ui/123/?preview=true&keep=1#/settings')), '/device-ui/123/?keep=1#/banned')
assert.equal(await resolveAccessRevokedRoute(route, async () => ({})), 'home', 'Older Core is not mistaken for a ban')
await assert.rejects(resolveAccessRevokedRoute(route, async () => { throw new Error('offline') }), /offline/)

assert.equal(accessRevokedHomeURL(new URL('https://device.local/?preview=false&network-confirm=token#/banned')), '/?network-confirm=token')
assert.equal(accessRevokedHomeURL(new URL('https://cloud.local/device-ui/123/?preview=false#/banned')), '/device-ui/123/')

console.log('access-revoked-route tests passed')
