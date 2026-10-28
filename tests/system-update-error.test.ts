import assert from 'node:assert/strict'
import { systemUpdateErrorText } from '../src/lib/system-update-error.ts'
const en = (_key: string, fallback: string) => fallback
const raw = "onekvm-extension: extract verified update bundle: Verified inline signature by 'CN = OneKVM'\nVerification failed at position 56430592.\nVerification of data area failed. Failed to extract bundle: bundle payload is corrupted"
assert.match(systemUpdateErrorText(raw, en), /data verification failed/)
assert.doesNotMatch(systemUpdateErrorText(raw, en), /signature verification failed/)
assert.match(systemUpdateErrorText('[update_payload_corrupted] failure', en), /SHA-256/)
assert.match(systemUpdateErrorText('signature verification failed', en), /device date and time/)
assert.match(systemUpdateErrorText('target-kernel-metadata', en), /cannot be fixed by uploading a plugin/)
assert.match(systemUpdateErrorText('extract verified update bundle: unknown failure', en), /available storage/)
assert.equal(systemUpdateErrorText('unrelated error', en), 'unrelated error')
assert.equal(systemUpdateErrorText(raw, (key) => key), 'settings.advancedSettings.systemPage.updateErrors.payloadCorrupted')
console.log('system update errors passed')
