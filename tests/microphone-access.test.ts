import assert from 'node:assert/strict'

import {
  activateBrowserMicrophone,
  microphoneAccessErrorKind,
} from '../src/lib/microphone-access.ts'

async function testPermissionComesBeforeDeviceAndSessionChanges() {
  const calls: string[] = []
  const stream = { id: 'stream' }
  const result = await activateBrowserMicrophone({
    requestPermission: async () => {
      calls.push('permission')
      return stream
    },
    enableDevice: async () => { calls.push('device') },
    claimSession: async () => {
      calls.push('claim')
      return true
    },
    attach: async (value) => {
      assert.equal(value, stream)
      calls.push('attach')
    },
    releaseSession: async () => { calls.push('release') },
    stop: () => { calls.push('stop') },
  })

  assert.equal(result, stream)
  assert.deepEqual(calls, ['permission', 'device', 'claim', 'attach'])
}

async function testDeniedPermissionHasNoDeviceSideEffects() {
  const calls: string[] = []
  const denied = Object.assign(new Error('denied'), { name: 'NotAllowedError' })
  await assert.rejects(() => activateBrowserMicrophone({
    requestPermission: async () => {
      calls.push('permission')
      throw denied
    },
    enableDevice: async () => { calls.push('device') },
    claimSession: async () => {
      calls.push('claim')
      return true
    },
    attach: async () => { calls.push('attach') },
    releaseSession: async () => { calls.push('release') },
    stop: () => { calls.push('stop') },
  }), denied)

  assert.deepEqual(calls, ['permission'])
  assert.equal(microphoneAccessErrorKind(denied), 'permission')
}

async function testBusySessionStopsCapture() {
  const calls: string[] = []
  const result = await activateBrowserMicrophone({
    requestPermission: async () => {
      calls.push('permission')
      return { id: 'stream' }
    },
    claimSession: async () => {
      calls.push('claim')
      return false
    },
    attach: async () => { calls.push('attach') },
    releaseSession: async () => { calls.push('release') },
    stop: () => { calls.push('stop') },
  })

  assert.equal(result, null)
  assert.deepEqual(calls, ['permission', 'claim', 'stop'])
}

async function testAttachFailureReleasesClaim() {
  const calls: string[] = []
  const failure = new Error('attach failed')
  await assert.rejects(() => activateBrowserMicrophone({
    requestPermission: async () => {
      calls.push('permission')
      return { id: 'stream' }
    },
    claimSession: async () => {
      calls.push('claim')
      return true
    },
    attach: async () => {
      calls.push('attach')
      throw failure
    },
    releaseSession: async () => { calls.push('release') },
    stop: () => { calls.push('stop') },
  }), failure)

  assert.deepEqual(calls, ['permission', 'claim', 'attach', 'stop', 'release'])
}

assert.equal(microphoneAccessErrorKind({ name: 'NotFoundError' }), 'unavailable')
assert.equal(microphoneAccessErrorKind(new Error('other')), 'other')

await testPermissionComesBeforeDeviceAndSessionChanges()
await testDeniedPermissionHasNoDeviceSideEffects()
await testBusySessionStopsCapture()
await testAttachFailureReleasesClaim()

console.log('microphone access tests passed')
