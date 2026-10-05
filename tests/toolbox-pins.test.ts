import assert from 'node:assert/strict'
import { parseToolboxPins, reorderToolboxPins, toolboxPinStorageKey } from '../src/lib/toolbox-pins.ts'

const items = [{ toolId: 'hid-macro/scripts', order: 2 }, { toolId: 'example-toolbox/scripts', order: 1 }]
const legacy = JSON.stringify({ schemaVersion: 1, items: items.map(pin => ({ ...pin, edge: 'right', offset: 99 })) })
assert.deepEqual(parseToolboxPins(legacy), items)
const migrated = JSON.stringify({ schemaVersion: 2, items: parseToolboxPins(legacy) })
assert.deepEqual(parseToolboxPins(migrated), items)
assert.deepEqual(Object.keys(parseToolboxPins(migrated)[0]), ['toolId', 'order'])
for (const raw of [null, '', '{', '{"schemaVersion":3,"items":[]}', '{"schemaVersion":2,"items":null}']) {
  assert.deepEqual(parseToolboxPins(raw), [])
}
assert.deepEqual(parseToolboxPins(JSON.stringify({ schemaVersion: 2, items: [
  ...items, items[0], null, { toolId: '../bad/scripts', order: 0 },
  { toolId: 'example-toolbox/settings', order: 1.5 },
  { toolId: 'example-toolbox/settings', order: Number.MAX_SAFE_INTEGER + 1 },
] })), items)
assert.notEqual(toolboxPinStorageKey('https://107', 'alice'), toolboxPinStorageKey('https://137', 'alice'))
assert.notEqual(toolboxPinStorageKey('https://107', 'alice'), toolboxPinStorageKey('https://107', 'bob'))
assert.notEqual(toolboxPinStorageKey('a:b', 'c'), toolboxPinStorageKey('a', 'b:c'))
const ordered = [
  { toolId: 'example-toolbox/first', order: 1 },
  { toolId: 'example-toolbox/hidden', order: 2 },
  { toolId: 'example-toolbox/second', order: 3 },
  { toolId: 'example-toolbox/third', order: 4 },
]
const reordered = reorderToolboxPins(ordered, 'example-toolbox/first', 'example-toolbox/third')
assert.deepEqual(reordered.map(pin => pin.toolId), [
  'example-toolbox/hidden', 'example-toolbox/second', 'example-toolbox/third', 'example-toolbox/first',
])
assert.deepEqual(parseToolboxPins(JSON.stringify({ schemaVersion: 2, items: reordered })), reordered)
assert.deepEqual(reorderToolboxPins(reordered, 'example-toolbox/first', 'example-toolbox/hidden').map(pin => pin.toolId), [
  'example-toolbox/first', 'example-toolbox/hidden', 'example-toolbox/second', 'example-toolbox/third',
])
assert.equal(reorderToolboxPins(ordered, 'missing/tool', 'example-toolbox/first'), ordered)
console.log('toolbox pins: migration, persistence, isolation and corrupt records passed')
