import assert from 'node:assert/strict'

import { httpsDownloadURL } from '../src/lib/download-url.ts'

assert.equal(httpsDownloadURL('http://example.com/image.iso'), 'https://example.com/image.iso')
assert.equal(httpsDownloadURL('http://example.com:80/image.iso'), 'https://example.com/image.iso')
assert.equal(httpsDownloadURL('https://example.com/image.iso'), 'https://example.com/image.iso')
assert.equal(httpsDownloadURL('not a URL'), 'not a URL')

console.log('download URL tests passed')
