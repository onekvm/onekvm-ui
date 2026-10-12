import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { DialogApi, DialogOptions, DialogReactive } from 'naive-ui'
import { createAsyncConfirmation, createAsyncDialogApi } from '../src/lib/async-confirmation.ts'

const event = {} as MouseEvent
function deferred() {
  let resolve!: (value: unknown) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function dialogApi(): DialogApi {
  const create = (options: DialogOptions): DialogReactive => ({ ...options, key: 'test', destroy() {} })
  return { create, warning: create, error: create, info: create, success: create, destroyAll() {} }
}

test('synchronous confirmations preserve their return value without showing loading', () => {
  const changes: boolean[] = []
  const handler = createAsyncConfirmation(() => false, (value) => changes.push(value), assert.fail)
  assert.equal(handler(event), false)
  assert.equal(handler(event), false)
  assert.deepEqual(changes, [])
})

test('async confirmations block duplicate requests and can retry after false or rejection', async () => {
  let request = deferred()
  let calls = 0
  const changes: boolean[] = []
  const errors: unknown[] = []
  const handler = createAsyncConfirmation(() => { calls++; return request.promise },
    (value) => changes.push(value), (reason) => errors.push(reason))
  const first = handler(event)
  assert.equal(handler(event), false)
  assert.equal(calls, 1)
  assert.deepEqual(changes, [true])
  request.resolve(false)
  assert.equal(await first, false)
  assert.deepEqual(changes, [true, false])
  request = deferred()
  const retry = handler(event)
  const failure = new Error('Request failed')
  request.reject(failure)
  assert.equal(await retry, false)
  assert.deepEqual(errors, [failure])
  request = deferred()
  const success = handler(event)
  request.resolve(true)
  assert.equal(await success, true)
  assert.equal(calls, 3)
  assert.deepEqual(changes, [true, false, true, false, true, false])
})

test('thenables and synchronous exceptions use the same error handling', async () => {
  const changes: boolean[] = []
  const thenable = createAsyncConfirmation(() => ({ then: (resolve: (value: boolean) => void) => resolve(true) }),
    (value) => changes.push(value), assert.fail)
  assert.equal(await thenable(event), true)
  assert.deepEqual(changes, [true, false])
  const failure = new Error('Immediate failure')
  const errors: unknown[] = []
  const throwing = createAsyncConfirmation(() => { throw failure }, assert.fail, (reason) => errors.push(reason))
  assert.equal(throwing(event), false)
  assert.deepEqual(errors, [failure])
})

for (const method of ['create', 'warning', 'error', 'info', 'success'] as const) {
  test(`${method} locks dismissal while saving and restores caller options on failure`, async () => {
    const request = deferred()
    let dismissalCalls = 0
    const negativeButtonProps = { size: 'small' as const }
    const api = createAsyncDialogApi(dialogApi(), assert.fail)
    const prompt = api[method]({
      maskClosable: false,
      negativeButtonProps,
      onPositiveClick: () => request.promise,
      onNegativeClick: () => { dismissalCalls++ },
      onClose: () => { dismissalCalls++ },
      onMaskClick: () => { dismissalCalls++ },
      onEsc: () => { dismissalCalls++ },
    })
    const saving = prompt.onPositiveClick!(event)
    assert.equal(prompt.loading, true)
    assert.equal(prompt.negativeButtonProps?.disabled, true)
    assert.equal(prompt.negativeButtonProps?.size, 'small')
    assert.equal(prompt.closable, false)
    assert.equal(prompt.maskClosable, false)
    assert.equal(prompt.closeOnEsc, false)
    assert.equal(prompt.onNegativeClick!(event), false)
    assert.equal(prompt.onClose!(), false)
    prompt.onMaskClick!(event)
    prompt.onEsc!()
    assert.equal(dismissalCalls, 0)
    request.resolve(false)
    assert.equal(await saving, false)
    assert.equal(prompt.loading, undefined)
    assert.equal(prompt.negativeButtonProps, negativeButtonProps)
    assert.equal(prompt.closable, undefined)
    assert.equal(prompt.maskClosable, false)
    assert.equal(prompt.closeOnEsc, undefined)
    prompt.onNegativeClick!(event)
    prompt.onClose!()
    prompt.onMaskClick!(event)
    prompt.onEsc!()
    assert.equal(dismissalCalls, 4)
  })
}

test('existing manual loading callbacks still execute once and settle normally', async () => {
  const request = deferred()
  const api = createAsyncDialogApi(dialogApi(), assert.fail)
  const prompt = api.warning({
    onPositiveClick: async () => {
      if (prompt.loading) return false
      prompt.loading = true
      try { return await request.promise } finally { prompt.loading = false }
    },
  })
  const result = prompt.onPositiveClick!(event)
  assert.equal(prompt.loading, true)
  request.resolve(true)
  assert.equal(await result, true)
  assert.equal(prompt.loading, undefined)
})

test('informational dialogs and destroyAll retain the original API behavior', () => {
  let destroyed = false
  const original = dialogApi()
  original.destroyAll = () => { destroyed = true }
  const api = createAsyncDialogApi(original, assert.fail)
  assert.equal(api.info({ title: 'Info' }).onPositiveClick, undefined)
  api.destroyAll()
  assert.equal(destroyed, true)
})
