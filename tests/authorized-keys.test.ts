import assert from 'node:assert/strict'

import { splitAuthorizedKeyLines, splitAuthorizedKeyList } from '../src/lib/authorized-keys.ts'

assert.deepEqual(splitAuthorizedKeyLines(''), [])
assert.deepEqual(splitAuthorizedKeyLines('   \n\n  '), [])
assert.deepEqual(
  splitAuthorizedKeyLines('ssh-ed25519 AAAA one\n\nssh-ed25519 BBBB two\n'),
  ['ssh-ed25519 AAAA one', 'ssh-ed25519 BBBB two'],
)
assert.deepEqual(
  splitAuthorizedKeyLines('ssh-ed25519 AAAA one\r\nssh-ed25519 AAAA one\r\nssh-ed25519 CCCC three'),
  ['ssh-ed25519 AAAA one', 'ssh-ed25519 CCCC three'],
)

assert.deepEqual(splitAuthorizedKeyList([]), [])
assert.deepEqual(splitAuthorizedKeyList(['', '  ']), [])
assert.deepEqual(
  splitAuthorizedKeyList([
    'ssh-ed25519 AAAA one\nssh-ed25519 BBBB two',
    ' ssh-ed25519 BBBB two ',
    'ssh-ed25519 CCCC three',
  ]),
  ['ssh-ed25519 AAAA one', 'ssh-ed25519 BBBB two', 'ssh-ed25519 CCCC three'],
)
