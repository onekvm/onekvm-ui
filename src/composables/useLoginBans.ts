import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import { api, type LoginBan } from '@/api/client'

export function useLoginBans(revision: () => number) {
  const bans = shallowRef<LoginBan[]>([])
  const now = shallowRef(Date.now())
  const loading = shallowRef(true)
  const refreshing = shallowRef(false)
  const loaded = shallowRef(false)
  const removing = shallowRef('')
  const error = shallowRef('')
  const activeBans = computed(() => bans.value.filter(ban => ban.expires_at === null || ban.expires_at * 1000 > now.value))
  let generation = 0
  let refreshTimer: number | undefined
  let clockTimer: number | undefined

  function acceptBans(value: LoginBan[]) {
    generation++
    bans.value = value
    now.value = Date.now()
    loaded.value = true
    error.value = ''
  }

  async function refresh() {
    if (refreshing.value) return
    const requestGeneration = generation
    refreshing.value = true
    try {
      const value = await api.getLoginBans()
      if (requestGeneration !== generation) return
      bans.value = value
      now.value = Date.now()
      loaded.value = true
      error.value = ''
    } catch (reason) {
      if (requestGeneration === generation) error.value = reason instanceof Error ? reason.message : String(reason)
    } finally {
      loading.value = false
      refreshing.value = false
    }
  }

  async function remove(id: string) {
    if (removing.value) return
    removing.value = id
    try {
      await api.removeLoginBan(id)
      acceptBans(bans.value.filter(ban => ban.id !== id))
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason)
    } finally {
      removing.value = ''
    }
  }

  watch(revision, refresh)
  onMounted(() => {
    void refresh()
    refreshTimer = window.setInterval(() => { if (!document.hidden) void refresh() }, 5000)
    clockTimer = window.setInterval(() => { now.value = Date.now() }, 1000)
  })
  onBeforeUnmount(() => {
    generation++
    window.clearInterval(refreshTimer)
    window.clearInterval(clockTimer)
  })

  return { activeBans, now, loading, refreshing, loaded, removing, error, acceptBans, refresh, remove }
}
