export const REMEMBER_LOGIN_KEY = 'onekvm-remember-login'

function cloudHosted() {
  return typeof document !== 'undefined'
    && Boolean(document.querySelector('meta[name="onekvm-service-base"]'))
}

function rememberLoginKey() {
  const base = typeof document === 'undefined' ? undefined
    : document.querySelector<HTMLMetaElement>('meta[name="onekvm-service-base"]')?.content
  if (!base) return REMEMBER_LOGIN_KEY
  const device = /^\/device-ui\/(dev_[A-Za-z0-9._-]+)\//.exec(base)?.[1]
  if (!device) throw new Error('Invalid OneKVM device storage scope')
  // Cloud devices share an origin, so a remembered login needs a device key.
  return `${REMEMBER_LOGIN_KEY}:${device}`
}

// Only the username is kept. Page storage is readable by every script on this
// origin, extension pages included, so passwords are left to the browser's
// password manager.
export type RememberedLogin = {
  username: string
}

export function readRememberedLogin(): RememberedLogin | null {
  try {
    const key = rememberLoginKey()
    const raw = localStorage.getItem(key)
    if (!raw) return null
    // Earlier versions stored the password too; drop anything that may hold one.
    if (cloudHosted()) {
      localStorage.removeItem(key)
      return null
    }
    const parsed = JSON.parse(raw) as { username?: unknown; password?: unknown }
    if (typeof parsed.username !== 'string' || !parsed.username) {
      localStorage.removeItem(key)
      return null
    }
    if ('password' in parsed) localStorage.setItem(key, JSON.stringify({ username: parsed.username }))
    return { username: parsed.username }
  } catch {
    try {
      localStorage.removeItem(rememberLoginKey())
    } catch {
      // Storage is unavailable; nothing is remembered.
    }
    return null
  }
}

export function writeRememberedLogin(login: RememberedLogin) {
  if (cloudHosted()) return
  localStorage.setItem(rememberLoginKey(), JSON.stringify({ username: login.username }))
}

export function clearRememberedLogin() {
  localStorage.removeItem(rememberLoginKey())
}
