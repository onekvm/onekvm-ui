export type NotificationLevel = 'error' | 'warning' | 'success' | 'info'

export interface NotificationEntry {
  id: string
  level: NotificationLevel
  text: string
  /** Time of the latest occurrence, in milliseconds since the epoch. */
  at: number
  /** How many times the same text arrived in a row. */
  count: number
}

export const NOTIFICATION_LEVELS: readonly NotificationLevel[] = ['error', 'warning', 'success', 'info']
/** Entries kept per browser; the oldest drop off first. */
export const NOTIFICATION_LIMIT = 100
/** The same text again within this window updates the latest entry instead of adding one. */
export const NOTIFICATION_MERGE_MS = 10_000

/** Newest first. */
export function appendNotification(
  list: readonly NotificationEntry[],
  next: { level: NotificationLevel; text: string },
  now: number,
  id: string,
): NotificationEntry[] {
  const text = next.text.trim()
  if (!text) return [...list]
  const latest = list[0]
  if (latest && latest.level === next.level && latest.text === text && now - latest.at <= NOTIFICATION_MERGE_MS) {
    return [{ ...latest, at: now, count: latest.count + 1 }, ...list.slice(1)]
  }
  return [{ id, level: next.level, text, at: now, count: 1 }, ...list].slice(0, NOTIFICATION_LIMIT)
}

export function unreadNotificationCount(list: readonly NotificationEntry[], seenAt: number) {
  return list.filter((entry) => entry.at > seenAt).length
}

export function parseStoredNotifications(value: unknown): { entries: NotificationEntry[]; seenAt: number } {
  const record = value && typeof value === 'object' ? value as { entries?: unknown; seenAt?: unknown } : {}
  const entries = Array.isArray(record.entries)
    ? record.entries.filter(isNotificationEntry).slice(0, NOTIFICATION_LIMIT)
    : []
  const seenAt = typeof record.seenAt === 'number' && Number.isFinite(record.seenAt) ? record.seenAt : 0
  return { entries, seenAt }
}

function isNotificationEntry(value: unknown): value is NotificationEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Partial<NotificationEntry>
  return typeof entry.id === 'string'
    && NOTIFICATION_LEVELS.includes(entry.level as NotificationLevel)
    && typeof entry.text === 'string' && entry.text.length > 0
    && typeof entry.at === 'number' && Number.isFinite(entry.at)
    && typeof entry.count === 'number' && entry.count >= 1
}
