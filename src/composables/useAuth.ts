import { reactive, readonly } from 'vue'

import { api, type AuthStatus, type NetworkConfig, type SetupSystemSettings } from '@/api/client'

const state = reactive<AuthStatus & { loading: boolean }>({
  configured: false,
  required: false,
  authenticated: false,
  username: '',
  hostname: 'onekvm',
  language: 'en',
  edition: '',
  permissions: [],
  loading: true,
})

let initialized = false
let refreshInFlight: Promise<void> | null = null
let refreshRetryTimer: number | null = null
let statusKnown = false

function assign(status: AuthStatus) {
  Object.assign(state, status, { loading: false })
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
  assign(await api.authLogin(username, password))
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
  await api.authLogout()
  state.authenticated = false
  state.required = true
}

export function useAuth() {
  if (!initialized) {
    initialized = true
    window.addEventListener('onekvm:unauthorized', () => {
      state.authenticated = false
      state.required = true
      state.loading = false
    })
    void refresh()
  }

  return {
    auth: readonly(state),
    refresh,
    login,
    logout,
    setup,
    updateAccount,
  }
}
