import { computed, shallowReadonly, shallowRef } from 'vue'

import {
  appendNotification,
  parseStoredNotifications,
  unreadNotificationCount,
  type NotificationEntry,
  type NotificationLevel,
} from '@/lib/notifications'

const STORAGE_KEY = 'onekvm.notifications'

function readStored() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return parseStoredNotifications(raw ? JSON.parse(raw) : null)
  } catch {
    return parseStoredNotifications(null)
  }
}

const initial = typeof window === 'undefined' ? parseStoredNotifications(null) : readStored()
const entries = shallowRef<NotificationEntry[]>(initial.entries)
const seenAt = shallowRef(initial.seenAt)
let sequence = 0

function persist() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ entries: entries.value, seenAt: seenAt.value }))
  } catch {
    // Private windows and blocked storage keep the list for this page only.
  }
}

if (typeof window !== 'undefined') {
  // Another tab of this device recorded or cleared notifications.
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return
    const stored = readStored()
    entries.value = stored.entries
    seenAt.value = stored.seenAt
  })
}

/** Record a prompt or event in this browser's notification list. */
export function notify(level: NotificationLevel, text: string) {
  const now = Date.now()
  const next = appendNotification(entries.value, { level, text }, now, `${now.toString(36)}-${(sequence++).toString(36)}`)
  if (next.length === entries.value.length && next[0] === entries.value[0]) return
  entries.value = next
  persist()
}

export function useNotifications() {
  const unread = computed(() => unreadNotificationCount(entries.value, seenAt.value))
  function markRead() {
    const latest = entries.value[0]?.at ?? 0
    if (latest <= seenAt.value) return
    seenAt.value = latest
    persist()
  }
  function clear() {
    entries.value = []
    seenAt.value = Date.now()
    persist()
  }
  function remove(id: string) {
    entries.value = entries.value.filter((entry) => entry.id !== id)
    persist()
  }
  return { entries: shallowReadonly(entries), seenAt: shallowReadonly(seenAt), unread, markRead, clear, remove }
}
