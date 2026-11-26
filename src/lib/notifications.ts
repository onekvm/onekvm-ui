import type { NotificationCategory, NotificationLevel, ServerNotification } from '../api/client.ts'

export type { NotificationLevel }

export interface NotificationEntry {
  id: number
  level: NotificationLevel
  category: NotificationCategory
  /** Core event type, or `web.message` for a console prompt. */
  event: string
  /** Text from Core, in the device language. */
  text: string
  data: Record<string, unknown>
  /** Time of the latest occurrence, in milliseconds since the epoch. */
  at: number
  /** How many times the same notification arrived in a row. */
  count: number
  read: boolean
}

export interface NotificationListState {
  revision: number
  unread: number
  entries: NotificationEntry[]
}

export const NOTIFICATION_LEVELS: readonly NotificationLevel[] = ['error', 'warning', 'success', 'info']
const CATEGORIES: readonly NotificationCategory[] = ['web', 'sign_in', 'video_signal', 'network']

function count(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

export function parseNotification(value: unknown): NotificationEntry | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Partial<ServerNotification>
  const id = count(item.id)
  const at = count(item.updated_at_unix_ms)
  const repeats = count(item.count)
  if (id === null || at === null || repeats === null || repeats < 1) return null
  if (!NOTIFICATION_LEVELS.includes(item.level as NotificationLevel)) return null
  if (typeof item.event !== 'string' || typeof item.text !== 'string' || !item.text) return null
  return {
    id,
    level: item.level as NotificationLevel,
    category: CATEGORIES.includes(item.category as NotificationCategory) ? item.category as NotificationCategory : 'web',
    event: item.event,
    text: item.text,
    data: item.data && typeof item.data === 'object' && !Array.isArray(item.data) ? item.data : {},
    at,
    count: repeats,
    read: item.read === true,
  }
}

export function parseNotificationList(value: unknown): NotificationListState {
  const record = value && typeof value === 'object' ? value as { revision?: unknown; unread?: unknown; entries?: unknown } : {}
  const entries = Array.isArray(record.entries)
    ? record.entries.map(parseNotification).filter((entry): entry is NotificationEntry => entry !== null)
    : []
  return {
    revision: count(record.revision) ?? 0,
    unread: count(record.unread) ?? entries.filter((entry) => !entry.read).length,
    entries,
  }
}

type Translate = (path: string, fallback?: string) => string

function textField(data: Record<string, unknown>, key: string) {
  const value = data[key]
  return typeof value === 'string' && value ? value : ''
}

function fill(template: string, values: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => values[key] ?? match)
}

/** Core events in the browser's language; other entries keep their own text. */
export function notificationText(entry: NotificationEntry, t: Translate) {
  const username = textField(entry.data, 'username')
  const address = textField(entry.data, 'address')
  const who = (subject: string) => {
    let text = subject
    if (username) text = fill(t('notifications.events.withUser', '{{subject}}: {{username}}'), { subject: text, username })
    if (address) text = fill(t('notifications.events.withAddress', '{{subject}} ({{address}})'), { subject: text, address })
    return text
  }
  switch (entry.event) {
    case 'auth.login.succeeded':
      return who(t('notifications.events.signedIn', 'Signed in'))
    case 'auth.login.failed':
      return ['blocked', 'rate_limited', 'weak_credentials'].includes(textField(entry.data, 'reason'))
        ? who(t('notifications.events.signInBlocked', 'Sign-in blocked'))
        : who(t('notifications.events.signInFailed', 'Sign-in failed'))
    case 'video.signal.changed':
      return entry.data.connected === true
        ? t('notifications.events.videoRestored', 'Video signal restored')
        : t('notifications.events.videoLost', 'No video signal')
    case 'network.state.changed': {
      if (entry.data.ethernet_connected !== true && entry.data.wifi_connected !== true) {
        return t('notifications.events.networkDisconnected', 'Network disconnected')
      }
      const ip = textField(entry.data, 'ip')
      const subject = t('notifications.events.networkChanged', 'Network changed')
      return ip ? fill(t('notifications.events.withUser', '{{subject}}: {{username}}'), { subject, username: ip }) : subject
    }
    default:
      return entry.text
  }
}
