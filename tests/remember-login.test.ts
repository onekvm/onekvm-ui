import assert from 'node:assert/strict'

import {
  REMEMBER_LOGIN_KEY,
  clearRememberedLogin,
  readRememberedLogin,
  writeRememberedLogin,
} from '../src/lib/remember-login.ts'

const store = new Map<string, string>()
const localStorage = {
  getItem(key: string) {
    return store.has(key) ? store.get(key)! : null
  },
  setItem(key: string, value: string) {
    store.set(key, value)
  },
  removeItem(key: string) {
    store.delete(key)
  },
}
Object.defineProperty(globalThis, 'localStorage', { value: localStorage, configurable: true })

assert.equal(readRememberedLogin(), null)

writeRememberedLogin({ username: 'admin', password: 'secret' })
assert.deepEqual(readRememberedLogin(), { username: 'admin', password: 'secret' })
assert.equal(store.get(REMEMBER_LOGIN_KEY), JSON.stringify({ username: 'admin', password: 'secret' }))

store.set(REMEMBER_LOGIN_KEY, '{')
assert.equal(readRememberedLogin(), null)

store.set(REMEMBER_LOGIN_KEY, JSON.stringify({ username: 'admin' }))
assert.equal(readRememberedLogin(), null)

store.set(REMEMBER_LOGIN_KEY, JSON.stringify({ username: '', password: 'secret' }))
assert.equal(readRememberedLogin(), null)

writeRememberedLogin({ username: 'admin', password: 'secret' })
clearRememberedLogin()
assert.equal(readRememberedLogin(), null)

let base = '/device-ui/dev_a/0.1.0/ui-one/'
Object.defineProperty(globalThis, 'document', { value: { querySelector: () => ({ content: base }) }, configurable: true })
writeRememberedLogin({ username: 'device-a', password: 'first' })
base = '/device-ui/dev_b/0.1.0/ui-one/'
assert.equal(readRememberedLogin(), null)
writeRememberedLogin({ username: 'device-b', password: 'second' })
base = '/device-ui/dev_a/0.2.0/ui-two/'
assert.deepEqual(readRememberedLogin(), { username: 'device-a', password: 'first' })
clearRememberedLogin()
assert.equal(readRememberedLogin(), null)
base = '/device-ui/dev_b/0.1.0/ui-one/'
assert.deepEqual(readRememberedLogin(), { username: 'device-b', password: 'second' })

console.log('remember-login tests passed')
