import { reactive, readonly } from 'vue'

import { api, type AuthStatus, type NetworkConfig, type SetupSystemSettings } from '@/api/client'
import { isCloudHosted } from '@/api/service-url'

const state = reactive<AuthStatus & { loading: boolean }>({
  configured: false,
  required: false,
  authenticated: false,
  username: '',
  hostname: 'onekvm',
  language: 'en',
  edition: '',
  permissions: [],
  mfa_required: false,
  pending_token: '',
  factors: [],
  mfa: { totp: false, passkeys: [], backup_codes: 0, plugins: [] },
  loading: true,
})

let initialized = false
let refreshInFlight: Promise<void> | null = null
let refreshRetryTimer: number | null = null
let statusKnown = false

function assign(status: AuthStatus) {
  state.mfa_required = false
  state.pending_token = ''
  state.factors = []
  const mfa = status.mfa ?? { totp: false, passkeys: [], backup_codes: 0, plugins: [] }
  Object.assign(state, status, { loading: false, mfa })
}

function scheduleRefreshRetry() {
  if (refreshRetryTimer !== null) return
  refreshRetryTimer = window.setTimeout(() => {
    refreshRetryTimer = null
    void refresh()
  }, 750)
}

async function refresh() {
  if (refreshInFlight) return refreshInFlight
  if (!statusKnown) state.loading = true
  refreshInFlight = (async () => {
    try {
      assign(await api.authStatus())
      statusKnown = true
      if (refreshRetryTimer !== null) {
        window.clearTimeout(refreshRetryTimer)
        refreshRetryTimer = null
      }
    } catch {
      // Changing the management address briefly makes the API unreachable.
      // An unknown auth state must never be presented as an uninitialized
      // device; retain the last known state and retry until Core is reachable.
      if (!statusKnown) state.loading = true
      scheduleRefreshRetry()
    } finally {
      refreshInFlight = null
    }
  })()
  return refreshInFlight
}

async function login(username: string, password: string) {
  const status = await api.authLogin(username, password)
  assign(status)
  return status
}

async function completeMfa(body: {
  pending_token?: string
  type: string
  code?: string
  plugin_id?: string
  response?: unknown
}) {
  assign(await api.authMfaComplete(body))
}

async function cancelMfa(pendingToken?: string) {
  await api.authMfaCancel(pendingToken)
  state.authenticated = false
  state.mfa_required = false
  state.pending_token = ''
  state.factors = []
  state.mfa = { totp: false, passkeys: [], backup_codes: 0, plugins: [] }
}

async function setup(
  hostname: string,
  username: string,
  password: string,
  network: NetworkConfig,
  system: SetupSystemSettings,
) {
  assign(await api.authSetup(hostname, username, password, network, system))
}

async function updateAccount(username: string, currentPassword: string, newPassword: string) {
  assign(await api.authUpdateAccount(username, currentPassword, newPassword))
}

async function logout() {
  if (isCloudHosted()) {
    window.parent.postMessage({ type: 'onekvm-cloud-logout' }, window.location.origin)
    return
  }
  await api.authLogout()
  state.authenticated = false
  state.required = true
  state.mfa_required = false
  state.pending_token = ''
  state.factors = []
  state.mfa = { totp: false, passkeys: [], backup_codes: 0, plugins: [] }
}

export function useAuth() {
  if (!initialized) {
    initialized = true
    window.addEventListener('onekvm:permissions-changed', () => { void refresh() })
    window.addEventListener('onekvm:unauthorized', () => {
      if (isCloudHosted()) {
        window.parent.postMessage({ type: 'onekvm-cloud-expired' }, window.location.origin)
        return
      }
      state.authenticated = false
      state.required = true
      state.mfa_required = false
      state.pending_token = ''
      state.factors = []
      state.mfa = { totp: false, passkeys: [], backup_codes: 0, plugins: [] }
      state.loading = false
    })
    void refresh()
  }

  return {
    auth: readonly(state),
    refresh,
    login,
    completeMfa,
    cancelMfa,
    logout,
    setup,
    updateAccount,
  }
}
