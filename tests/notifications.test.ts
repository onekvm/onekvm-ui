import assert from 'node:assert/strict'

import { notificationText, parseNotification, parseNotificationList } from '../src/lib/notifications.ts'

const server = (fields: Record<string, unknown>) => ({
  id: 1,
  level: 'warning',
  category: 'sign_in',
  event: 'auth.login.failed',
  text: 'Sign-in failed: admin (192.0.2.7)',
  data: { username: 'admin', reason: 'invalid_credentials', address: '192.0.2.7' },
  count: 1,
  created_at_unix_ms: 10,
  updated_at_unix_ms: 20,
  read: false,
  ...fields,
})

// Entries are checked one by one; the latest occurrence is the entry time.
const list = parseNotificationList({
  revision: 7,
  unread: 1,
  entries: [
    server({}),
    server({ id: 2, level: 'bogus' }),
    server({ id: 3, text: '' }),
    server({ id: 4, count: 0 }),
    'junk',
    server({ id: 5, level: 'success', category: 'web', event: 'web.message', text: 'Saved', data: undefined, read: true }),
  ],
})
assert.equal(list.revision, 7)
assert.equal(list.unread, 1)
assert.deepEqual(list.entries.map((entry) => entry.id), [1, 5])
assert.equal(list.entries[0]?.at, 20)
assert.deepEqual(list.entries[1]?.data, {})
assert.deepEqual(parseNotificationList(null), { revision: 0, unread: 0, entries: [] })

// Core events follow the browser language; other entries keep their text.
const messages: Record<string, string> = {
  'notifications.events.signInFailed': '登录失败',
  'notifications.events.signInBlocked': '登录已被阻止',
  'notifications.events.signedIn': '已登录',
  'notifications.events.withUser': '{{subject}}：{{username}}',
  'notifications.events.withAddress': '{{subject}}（{{address}}）',
  'notifications.events.videoLost': '视频信号已断开',
  'notifications.events.networkChanged': '网络已变化',
}
const zh = (path: string, fallback?: string) => messages[path] ?? fallback ?? path
const english = (_path: string, fallback?: string) => fallback ?? _path

const failed = list.entries[0]!
assert.equal(notificationText(failed, zh), '登录失败：admin（192.0.2.7）')
assert.equal(notificationText(failed, english), 'Sign-in failed: admin (192.0.2.7)')
assert.equal(
  notificationText({ ...failed, data: { username: 'root', reason: 'blocked' } }, zh),
  '登录已被阻止：root',
)
assert.equal(notificationText({ ...failed, event: 'auth.login.succeeded', data: {} }, zh), '已登录')
assert.equal(
  notificationText({ ...failed, event: 'video.signal.changed', data: { connected: false } }, zh),
  '视频信号已断开',
)
assert.equal(
  notificationText({ ...failed, event: 'network.state.changed', data: { wifi_connected: true, ip: '192.0.2.9' } }, zh),
  '网络已变化：192.0.2.9',
)
assert.equal(
  notificationText({ ...failed, event: 'network.state.changed', data: { ethernet_connected: false } }, english),
  'Network disconnected',
)
assert.equal(notificationText(list.entries[1]!, zh), 'Saved')
assert.equal(notificationText(parseNotification(server({ event: 'future.event', text: 'From Core' }))!, zh), 'From Core')

console.log('notifications tests passed')
