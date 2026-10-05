import assert from 'node:assert/strict'

import { resolveServiceURL } from '../src/api/service-url.ts'

const base = 'https://10.100.99.107'
const page = '/api/extension-pages/cloud/0.1.0/web/page.json'
const absolute = `${base}${page}`

assert.equal(resolveServiceURL(base, page), absolute)
assert.equal(resolveServiceURL(base, absolute), absolute)
assert.equal(new URL(resolveServiceURL(base, absolute)).href, absolute)
assert.equal(
  resolveServiceURL(`${base}/device-ui/dev_a/0.1.0/ui`, page),
  `${base}/device-ui/dev_a/0.1.0/ui${page}`,
)
assert.equal(resolveServiceURL(`${base}/`, 'api/status'), `${base}/api/status`)

console.log('service-url tests passed')
