import assert from 'node:assert/strict'

import {
  NOTIFICATION_LIMIT,
  NOTIFICATION_MERGE_MS,
  appendNotification,
  parseStoredNotifications,
  unreadNotificationCount,
} from '../src/lib/notifications.ts'

// Newest first; blank text is ignored.
let list = appendNotification([], { level: 'error', text: ' Save failed ' }, 1000, 'a')
assert.deepEqual(list, [{ id: 'a', level: 'error', text: 'Save failed', at: 1000, count: 1 }])
assert.equal(appendNotification(list, { level: 'info', text: '  ' }, 1100, 'b').length, 1)
list = appendNotification(list, { level: 'success', text: 'Saved' }, 2000, 'b')
assert.deepEqual(list.map((entry) => entry.id), ['b', 'a'])

// The same prompt again soon after updates the latest entry.
list = appendNotification(list, { level: 'success', text: 'Saved' }, 2000 + NOTIFICATION_MERGE_MS, 'c')
assert.equal(list.length, 2)
assert.deepEqual(list[0], { id: 'b', level: 'success', text: 'Saved', at: 2000 + NOTIFICATION_MERGE_MS, count: 2 })
// Later, or with another level, it is a new entry.
list = appendNotification(list, { level: 'success', text: 'Saved' }, 3000 + 2 * NOTIFICATION_MERGE_MS, 'd')
list = appendNotification(list, { level: 'error', text: 'Saved' }, 3001 + 2 * NOTIFICATION_MERGE_MS, 'e')
assert.deepEqual(list.map((entry) => entry.id), ['e', 'd', 'b', 'a'])

// Unread entries are the ones newer than the last time the list was opened.
assert.equal(unreadNotificationCount(list, 0), 4)
assert.equal(unreadNotificationCount(list, 2000 + NOTIFICATION_MERGE_MS), 2)

// The oldest drop off past the limit.
let many = list
for (let index = 0; index < NOTIFICATION_LIMIT + 5; index++) {
  many = appendNotification(many, { level: 'info', text: `n${index}` }, 10_000_000 + index, `n${index}`)
}
assert.equal(many.length, NOTIFICATION_LIMIT)
assert.equal(many[0]?.id, `n${NOTIFICATION_LIMIT + 4}`)

// Stored data is checked entry by entry.
assert.deepEqual(parseStoredNotifications(null), { entries: [], seenAt: 0 })
assert.deepEqual(parseStoredNotifications({
  seenAt: 5,
  entries: [
    { id: 'x', level: 'warning', text: 'HDMI', at: 4, count: 1 },
    { id: 'y', level: 'bogus', text: 'bad', at: 4, count: 1 },
    { id: 'z', level: 'info', text: '', at: 4, count: 1 },
    'junk',
  ],
}), { entries: [{ id: 'x', level: 'warning', text: 'HDMI', at: 4, count: 1 }], seenAt: 5 })

console.log('notifications tests passed')
