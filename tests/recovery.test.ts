import assert from 'node:assert/strict'

import {
  errorMessage,
  isRecoveryPath,
  parseRecoveryStatus,
  postRecovery,
  RECOVERY_PATHS,
  recoveryErrorMessage,
} from '../src/recovery/api.ts'
import {
  detectRecoveryLocale,
  isRecoveryLocale,
  recoveryDocumentLang,
  recoveryLocales,
  recoveryMessages,
} from '../src/recovery/messages.ts'

assert.equal(isRecoveryPath('/firmware'), true)
assert.equal(isRecoveryPath('/reset-user'), true)
assert.equal(isRecoveryPath('/reboot'), true)
assert.equal(isRecoveryPath('/api/system/reboot'), false)
assert.deepEqual(RECOVERY_PATHS, {
  firmware: '/firmware',
  resetUser: '/reset-user',
  reboot: '/reboot',
})

assert.equal(recoveryErrorMessage(500, ' cannot reset user\n'), 'cannot reset user')
assert.equal(recoveryErrorMessage(404, '   '), '404')
assert.equal(errorMessage(new Error('firmware install failed')), 'firmware install failed')
assert.equal(errorMessage('boom'), 'boom')
assert.deepEqual(parseRecoveryStatus('{"addresses":["10.100.99.107","10.0.0.5"]}'), [
  '10.100.99.107',
  '10.0.0.5',
])
assert.deepEqual(parseRecoveryStatus('{"addresses":[1,""]}'), [])
assert.deepEqual(parseRecoveryStatus('not-json'), [])

assert.equal(detectRecoveryLocale(['zh-CN', 'en']), 'zh')
assert.equal(detectRecoveryLocale(['zh-TW']), 'zh_tw')
assert.equal(detectRecoveryLocale(['en-US']), 'en')
assert.equal(detectRecoveryLocale([]), 'en')
assert.equal(recoveryDocumentLang('zh'), 'zh-CN')
assert.equal(isRecoveryLocale('zh'), true)
assert.equal(isRecoveryLocale('ja'), false)

for (const locale of recoveryLocales) {
  for (const key of Object.keys(recoveryMessages.en)) {
    const value = recoveryMessages[locale][key as keyof typeof recoveryMessages.en]
    assert.equal(typeof value, 'string', `${locale}.${key}`)
    assert.ok(value.length > 0, `${locale}.${key} empty`)
  }
}

const calls: Array<{ path: string; init: RequestInit }> = []
const originalFetch = globalThis.fetch
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  calls.push({ path: String(input), init: init || {} })
  return new Response('firmware installed\n', { status: 200 })
}) as typeof fetch

try {
  await assert.rejects(() => postRecovery('/not-allowed'), /unknown recovery path/)
  const body = await postRecovery('/firmware', new Blob(['fwup']))
  assert.equal(body, 'firmware installed\n')
  assert.equal(calls[0].path, '/firmware')
  assert.equal(calls[0].init.method, 'POST')
} finally {
  globalThis.fetch = originalFetch
}

globalThis.fetch = (async () => new Response('cannot reset user\n', { status: 500 })) as typeof fetch
try {
  await assert.rejects(() => postRecovery('/reset-user'), /cannot reset user/)
} finally {
  globalThis.fetch = originalFetch
}

console.log('recovery tests passed')
