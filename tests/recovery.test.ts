import assert from 'node:assert/strict'

import {
  bytesPercent,
  errorMessage,
  firmwareProgressPercent,
  formatBytes,
  formatStorageCapacity,
  isRecoveryPath,
  recoveryStorageLabel,
  shouldApplyFirmwareProgress,
  parseFirmwareProgress,
  parseRecoveryStatus,
  postRecovery,
  RECOVERY_PATHS,
  recoveryErrorMessage,
} from '../src/recovery/api.ts'
import {
  detectRecoveryLocale,
  isRecoveryLocale,
  readRecoveryLocale,
  recoveryDocumentLang,
  recoveryLocales,
  recoveryMessages,
} from '../src/recovery/messages.ts'
import {
  isRecoveryTheme,
  readRecoveryTheme,
  resolveRecoveryTheme,
} from '../src/recovery/theme.ts'

assert.equal(isRecoveryPath('/firmware'), true)
assert.equal(isRecoveryPath('/reset-user'), true)
assert.equal(isRecoveryPath('/factory-reset'), true)
assert.equal(isRecoveryPath('/reboot'), true)
assert.equal(isRecoveryPath('/api/system/reboot'), false)
assert.deepEqual(RECOVERY_PATHS, {
  firmware: '/firmware',
  resetUser: '/reset-user',
  factoryReset: '/factory-reset',
  reboot: '/reboot',
})

assert.equal(recoveryErrorMessage(500, ' cannot reset user\n'), 'cannot reset user')
assert.equal(recoveryErrorMessage(404, '   '), '404')
assert.equal(errorMessage(new Error('firmware install failed')), 'firmware install failed')
assert.equal(errorMessage('boom'), 'boom')
assert.deepEqual(parseRecoveryStatus('{"addresses":["10.100.99.107","10.0.0.5"],"firmwareMax":8388608}'), {
  addresses: ['10.100.99.107', '10.0.0.5'],
  firmwareMax: 8388608,
  storageType: '',
  storageBytes: 0,
})
assert.deepEqual(
  parseRecoveryStatus(
    '{"addresses":["10.100.99.107"],"firmwareMax":1,"storageType":"SD Card","storageBytes":32010928128}',
  ),
  {
    addresses: ['10.100.99.107'],
    firmwareMax: 1,
    storageType: 'SD Card',
    storageBytes: 32010928128,
  },
)
assert.deepEqual(parseRecoveryStatus('{"addresses":[1,""]}'), {
  addresses: [],
  firmwareMax: 0,
  storageType: '',
  storageBytes: 0,
})
assert.deepEqual(parseRecoveryStatus('not-json'), {
  addresses: [],
  firmwareMax: 0,
  storageType: '',
  storageBytes: 0,
})
assert.equal(formatBytes(8 * 1024 * 1024), '8 MiB')
assert.equal(formatBytes(512 * 1024), '512 KiB')
assert.equal(formatStorageCapacity(32010928128), '32 GB')
assert.equal(recoveryStorageLabel('SD Card', 32010928128), 'SD Card · 32 GB')
assert.equal(recoveryStorageLabel('', 0), '')

assert.equal(parseFirmwareProgress('not-json').phase, 'idle')
assert.equal(parseFirmwareProgress('{"phase":"upload","received":20,"total":80}').phase, 'upload')
assert.equal(
  parseFirmwareProgress(
    '{"phase":"upload","received":80,"total":80,"sha256":"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"}',
  ).sha256,
  'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
)
assert.equal(firmwareProgressPercent({ phase: 'verify' }), 63)
assert.equal(bytesPercent(20, 80), 25)
assert.equal(firmwareProgressPercent({ phase: 'upload', received: 40, total: 80 }), 28)
assert.equal(firmwareProgressPercent({ phase: 'extract' }), 60)
assert.equal(firmwareProgressPercent({ phase: 'write-rootfs', received: 50, total: 100 }), 78)
assert.equal(firmwareProgressPercent({ phase: 'done' }), 100)
assert.equal(
  shouldApplyFirmwareProgress({ phase: 'upload' }, { phase: 'done' }, true),
  false,
)
assert.equal(
  shouldApplyFirmwareProgress({ phase: 'upload' }, { phase: 'extract' }, true),
  true,
)
assert.equal(
  shouldApplyFirmwareProgress({ phase: 'write-rootfs' }, { phase: 'upload' }, false),
  false,
)
assert.equal(
  shouldApplyFirmwareProgress({ phase: 'switch' }, { phase: 'done' }, false),
  true,
)

assert.equal(detectRecoveryLocale(['zh-CN', 'en']), 'zh')
assert.equal(detectRecoveryLocale(['zh-TW']), 'zh_tw')
assert.equal(detectRecoveryLocale(['en-US']), 'en')
assert.equal(detectRecoveryLocale([]), 'en')
assert.equal(recoveryDocumentLang('zh'), 'zh-CN')
assert.equal(isRecoveryLocale('zh'), true)
assert.equal(isRecoveryLocale('ja'), false)
assert.equal(readRecoveryLocale('zh', ['en']), 'zh')
assert.equal(readRecoveryLocale(null, ['zh-CN']), 'zh')
assert.equal(isRecoveryTheme('system'), true)
assert.equal(isRecoveryTheme('sepia'), false)
assert.equal(readRecoveryTheme(null), 'system')
assert.equal(readRecoveryTheme('light'), 'light')
assert.equal(resolveRecoveryTheme('system', true), 'dark')
assert.equal(resolveRecoveryTheme('system', false), 'light')
assert.equal(resolveRecoveryTheme('light', true), 'light')

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

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  calls.length = 0
  calls.push({ path: String(input), init: init || {} })
  return new Response('factory reset complete\n', { status: 200 })
}) as typeof fetch
try {
  const body = await postRecovery('/factory-reset')
  assert.equal(body, 'factory reset complete\n')
  assert.equal(calls[0].path, '/factory-reset')
  assert.equal(calls[0].init.method, 'POST')
} finally {
  globalThis.fetch = originalFetch
}

console.log('recovery tests passed')
