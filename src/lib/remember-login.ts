export const REMEMBER_LOGIN_KEY = 'onekvm-remember-login'

function rememberLoginKey() {
  const base = typeof document === 'undefined' ? undefined
    : document.querySelector<HTMLMetaElement>('meta[name="onekvm-service-base"]')?.content
  if (!base) return REMEMBER_LOGIN_KEY
  const device = /^\/device-ui\/(dev_[A-Za-z0-9._-]+)\//.exec(base)?.[1]
  if (!device) throw new Error('Invalid OneKVM device storage scope')
  // Cloud devices share an origin, so remembered passwords need a device key.
  // Keep it stable across UI/OS upgrades without reusing another device's login.
  return `${REMEMBER_LOGIN_KEY}:${device}`
}

export type RememberedLogin = {
  username: string
  password: string
}

export function readRememberedLogin(): RememberedLogin | null {
  try {
    const raw = localStorage.getItem(rememberLoginKey())
    if (!raw) return null
    const parsed = JSON.parse(raw) as { username?: unknown; password?: unknown }
    if (typeof parsed.username !== 'string' || typeof parsed.password !== 'string') return null
    if (!parsed.username) return null
    return { username: parsed.username, password: parsed.password }
  } catch {
    return null
  }
}

export function writeRememberedLogin(login: RememberedLogin) {
  localStorage.setItem(rememberLoginKey(), JSON.stringify({
    username: login.username,
    password: login.password,
  }))
}

export function clearRememberedLogin() {
  localStorage.removeItem(rememberLoginKey())
}
