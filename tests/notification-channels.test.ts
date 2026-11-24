import assert from 'node:assert/strict'

import type { NotificationChannelSchema } from '../src/api/client.ts'
import {
  WEBHOOK_CHANNEL,
  invalidFields,
  newChannel,
  normalizedChannel,
  schemaFields,
  webhookHeadersValid,
} from '../src/lib/notification-channels.ts'

const schema: NotificationChannelSchema = {
  required: ['token', 'chat'],
  order: ['token', 'chat'],
  properties: {
    silent: { type: 'boolean', title: 'Silent' },
    chat: { type: 'string', title: 'Chat', maxLength: 4 },
    token: { type: 'string', title: 'Token', format: 'password' },
    retries: { type: 'integer', title: 'Retries', minimum: 0, maximum: 3 },
    topic: { type: 'string', title: 'Topic', enum: ['a', 'b'], required_when: { field: 'silent', equals: true } },
  },
}

// Declared fields come first, the rest by name.
assert.deepEqual(schemaFields(schema).map(([name]) => name), ['token', 'chat', 'retries', 'silent', 'topic'])

// A new channel starts enabled with the form defaults; secrets stay empty until typed.
const added = newChannel('telegram/main', schema)
assert.deepEqual(added, {
  id: '', type: 'telegram/main', name: '', enabled: true, min_level: 'warning',
  settings: { chat: '', retries: null, silent: false, topic: null }, secrets: {},
})
assert.deepEqual(invalidFields(added, schema, []), ['token', 'chat'])
assert.deepEqual(invalidFields({ ...added, enabled: false }, schema, []), [], 'an unfinished channel can be saved off')
assert.deepEqual(invalidFields({ ...added, enabled: false }, schema, [], true), ['token', 'chat'], 'a test needs every required field')

const filled = { ...added, settings: { ...added.settings, chat: 'ops' }, secrets: { token: 'abc' } }
assert.deepEqual(invalidFields(filled, schema, []), [])
assert.deepEqual(invalidFields({ ...filled, settings: { ...filled.settings, chat: 'too long' } }, schema, []), ['chat'])
assert.deepEqual(invalidFields({ ...filled, settings: { ...filled.settings, retries: 1.5 } }, schema, []), ['retries'])
assert.deepEqual(invalidFields({ ...filled, settings: { ...filled.settings, silent: true } }, schema, []), ['topic'])

// A saved secret reads back blank and still counts; removing it clears it.
const saved = { ...filled, id: '2', secrets: { token: '' } }
assert.deepEqual(invalidFields(saved, schema, ['token']), [])
assert.deepEqual(invalidFields(saved, schema, []), ['token'])
assert.deepEqual(invalidFields({ ...saved, secrets: {} }, schema, ['token']), ['token'])

// Without its form a channel is kept as it is.
assert.deepEqual(invalidFields(saved, undefined, []), [])

const hook = newChannel(WEBHOOK_CHANNEL)
assert.deepEqual(hook.settings, { url: '' })
assert.deepEqual(invalidFields(hook, undefined, []), ['url'])
assert.deepEqual(invalidFields({ ...hook, enabled: false }, undefined, []), [])
const named = normalizedChannel({
  ...hook,
  name: '  Home ',
  settings: { url: ' https://example.com/hook ' },
  headers: [{ name: ' Authorization ', value: ' Bearer x ' }],
})
assert.deepEqual(named, {
  ...hook,
  name: 'Home',
  settings: { url: 'https://example.com/hook' },
  headers: [{ name: 'Authorization', value: 'Bearer x' }],
})
assert.deepEqual(invalidFields(named, undefined, []), [])
assert.deepEqual(invalidFields({ ...named, settings: { url: 'ftp://example.com' } }, undefined, []), ['url'])
assert.equal(webhookHeadersValid([{ name: 'Host', value: 'x' }]), false)
assert.equal(webhookHeadersValid([{ name: 'X-A', value: '1' }, { name: 'x-a', value: '2' }]), false)

console.log('notification channel tests passed')
