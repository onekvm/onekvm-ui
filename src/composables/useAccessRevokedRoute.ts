import { onMounted, onUnmounted, shallowRef } from 'vue'

import { api } from '@/api/client'
import { accessRevokedHomeURL, accessRevokedRoute, resolveAccessRevokedRoute } from '@/lib/access-revoked-route'

const RECHECK_INTERVAL = 5000

export function useAccessRevokedRoute() {
  const initial = accessRevokedRoute(new URL(window.location.href))
  const noticeVisible = shallowRef(initial.preview)
  const checking = shallowRef(initial.requested && !initial.preview)
  let generation = 0
  let confirmedBan = false
  let recheckTimer: number | null = null

  function clearRecheck() {
    if (recheckTimer === null) return
    window.clearTimeout(recheckTimer)
    recheckTimer = null
  }

  function returnHome() {
    window.history.replaceState(window.history.state, '', accessRevokedHomeURL(new URL(window.location.href)))
    confirmedBan = false
    noticeVisible.value = false
    checking.value = false
    window.dispatchEvent(new Event('onekvm:access-check'))
  }

  function scheduleRecheck() {
    recheckTimer = window.setTimeout(() => { void syncRoute() }, RECHECK_INTERVAL)
  }

  async function syncRoute() {
    const requestGeneration = ++generation
    clearRecheck()
    const route = accessRevokedRoute(new URL(window.location.href))
    if (!route.requested) {
      confirmedBan = false
      noticeVisible.value = false
      checking.value = false
      return
    }
    if (route.preview) {
      confirmedBan = false
      noticeVisible.value = true
      checking.value = false
      return
    }

    noticeVisible.value = confirmedBan
    checking.value = !confirmedBan
    try {
      const destination = await resolveAccessRevokedRoute(route, api.authStatus)
      if (requestGeneration !== generation) return
      if (destination === 'home') {
        returnHome()
        return
      }
      confirmedBan = true
      noticeVisible.value = true
      checking.value = false
      scheduleRecheck()
    } catch {
      if (requestGeneration !== generation) return
      // Keep a confirmed ban during a temporary outage. Otherwise let the
      // normal auth gate handle the unavailable API instead of claiming a ban.
      if (confirmedBan) {
        checking.value = false
        scheduleRecheck()
      } else {
        returnHome()
      }
    }
  }

  onMounted(() => {
    window.addEventListener('hashchange', syncRoute)
    window.addEventListener('popstate', syncRoute)
    void syncRoute()
  })

  onUnmounted(() => {
    ++generation
    clearRecheck()
    window.removeEventListener('hashchange', syncRoute)
    window.removeEventListener('popstate', syncRoute)
  })

  return { noticeVisible, checking }
}
