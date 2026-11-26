import assert from 'node:assert/strict'

import {
  REMEMBER_LOGIN_KEY,
  clearRememberedLogin,
  readRememberedLogin,
  writeRememberedLogin,
  type RememberedLogin,
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

writeRememberedLogin({ username: 'admin' })
assert.deepEqual(readRememberedLogin(), { username: 'admin' })
assert.equal(store.get(REMEMBER_LOGIN_KEY), JSON.stringify({ username: 'admin' }))

// A caller holding a password must not get it into page storage.
writeRememberedLogin({ username: 'admin', password: 'secret' } as RememberedLogin)
assert.equal(store.get(REMEMBER_LOGIN_KEY), JSON.stringify({ username: 'admin' }))

// Logins saved by earlier versions keep the username and lose the password.
store.set(REMEMBER_LOGIN_KEY, JSON.stringify({ username: 'admin', password: 'secret' }))
assert.deepEqual(readRememberedLogin(), { username: 'admin' })
assert.equal(store.get(REMEMBER_LOGIN_KEY), JSON.stringify({ username: 'admin' }))

store.set(REMEMBER_LOGIN_KEY, '{"username":"admin","password":"sec')
assert.equal(readRememberedLogin(), null)
assert.equal(store.has(REMEMBER_LOGIN_KEY), false, 'a damaged entry is removed')

store.set(REMEMBER_LOGIN_KEY, JSON.stringify({ username: '', password: 'secret' }))
assert.equal(readRememberedLogin(), null)
assert.equal(store.has(REMEMBER_LOGIN_KEY), false, 'an entry without a username is removed')

writeRememberedLogin({ username: 'admin' })
clearRememberedLogin()
assert.equal(readRememberedLogin(), null)

let base = '/device-ui/dev_a/0.1.0/ui-one/'
Object.defineProperty(globalThis, 'document', { value: { querySelector: () => ({ content: base }) }, configurable: true })
store.set(`${REMEMBER_LOGIN_KEY}:dev_a`, JSON.stringify({ username: 'device-a', password: 'old-secret' }))
assert.equal(readRememberedLogin(), null, 'cloud login must not restore a saved device login')
assert.equal(store.has(`${REMEMBER_LOGIN_KEY}:dev_a`), false, 'cloud login removes a saved device password')
writeRememberedLogin({ username: 'device-a' })
assert.equal(store.has(`${REMEMBER_LOGIN_KEY}:dev_a`), false)
store.set(`${REMEMBER_LOGIN_KEY}:dev_a`, JSON.stringify({ username: 'device-a' }))
clearRememberedLogin()
assert.equal(store.has(`${REMEMBER_LOGIN_KEY}:dev_a`), false)
base = '/device-ui/dev_b/0.1.0/ui-one/'
writeRememberedLogin({ username: 'device-b' })
assert.equal(store.has(`${REMEMBER_LOGIN_KEY}:dev_b`), false)
assert.equal(readRememberedLogin(), null)

console.log('remember-login tests passed')
