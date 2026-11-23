import { getCurrentScope, onScopeDispose, shallowReadonly, shallowRef } from 'vue'

import { api, type OneKVMStatus } from '@/api/client'
import { hasPermission } from '@/build'
import { useAuth } from '@/composables/useAuth'
import { statusEvents } from '@/lib/status-events'
import { parseNotificationList, type NotificationEntry, type NotificationLevel } from '@/lib/notifications'

// Core keeps the list in memory for the device; every console shares it.
const entries = shallowRef<NotificationEntry[]>([])
const unread = shallowRef(0)
const loading = shallowRef(false)
let revision: number | null = null
let loadedRevision: number | null = null
let summaryUsers = 0
let listUsers = 0
let unsubscribeStatus: (() => void) | null = null
let loadInFlight: Promise<void> | null = null
let reloadQueued = false

async function load() {
  if (loadInFlight) {
    reloadQueued = true
    return loadInFlight
  }
  loading.value = true
  loadInFlight = (async () => {
    try {
      do {
        reloadQueued = false
        const list = parseNotificationList(await api.getNotifications())
        entries.value = list.entries
        unread.value = list.unread
        loadedRevision = list.revision
        revision = Math.max(revision ?? 0, list.revision)
      } while (reloadQueued)
    } catch {
      // The next status update retries.
    } finally {
      loading.value = false
      loadInFlight = null
    }
  })()
  return loadInFlight
}

function applyStatus(status: OneKVMStatus) {
  const summary = status.notifications
  if (!summary) return
  unread.value = summary.unread
  revision = summary.revision
  if (listUsers > 0 && summary.revision !== loadedRevision) void load()
}

function retainSummary() {
  summaryUsers++
  if (!unsubscribeStatus) unsubscribeStatus = statusEvents.subscribe(applyStatus)
  return () => {
    summaryUsers--
    if (summaryUsers === 0 && unsubscribeStatus) {
      unsubscribeStatus()
      unsubscribeStatus = null
    }
  }
}

/** Record a prompt shown in this console in the device's notification list. */
export function notify(level: NotificationLevel, text: string) {
  const { auth } = useAuth()
  if (!text.trim() || !hasPermission(auth, 'console.control')) return
  void api.recordNotification(level, text).catch(() => {
    // Prompts still show when the list cannot be reached.
  })
}

function changed(summary: { revision: number; unread: number }) {
  unread.value = summary.unread
  revision = summary.revision
}

async function markRead() {
  if (!entries.value.some((entry) => !entry.read) && unread.value === 0) return
  entries.value = entries.value.map((entry) => (entry.read ? entry : { ...entry, read: true }))
  unread.value = 0
  try {
    changed(await api.markNotificationsRead())
  } catch {
    void load()
  }
}

async function clear() {
  entries.value = []
  unread.value = 0
  try {
    changed(await api.clearNotifications())
  } catch {
    void load()
  }
}

async function remove(id: number) {
  entries.value = entries.value.filter((entry) => entry.id !== id)
  try {
    changed(await api.removeNotification(id))
  } catch {
    void load()
  }
}

/**
 * Unread count for the toolbar. Components that show the list call `watchList`
 * while it is visible so it follows changes without fetching in the background.
 */
export function useNotifications() {
  if (getCurrentScope()) onScopeDispose(retainSummary())
  function watchList() {
    listUsers++
    const releaseSummary = retainSummary()
    if (revision === null || revision !== loadedRevision || !entries.value.length) void load()
    let released = false
    return () => {
      if (released) return
      released = true
      listUsers--
      releaseSummary()
    }
  }
  return {
    entries: shallowReadonly(entries),
    unread: shallowReadonly(unread),
    loading: shallowReadonly(loading),
    load,
    watchList,
    markRead,
    clear,
    remove,
  }
}
