import assert from 'node:assert/strict'

import {
  assertShellMethods,
  assertShellRegistrationId,
  SHELL_METHOD_PATTERN,
} from '../src/lib/extension-shell.ts'

assert.equal(SHELL_METHOD_PATTERN.test('listPackages'), true)
assert.equal(SHELL_METHOD_PATTERN.test('install_package'), false)
assertShellRegistrationId('plugin-marketplace', 'plugin-marketplace')
assert.throws(() => assertShellRegistrationId('plugin-marketplace', null), /only allowed while the host is loading/)
assert.throws(() => assertShellRegistrationId('other', 'plugin-marketplace'), /does not match/)
assertShellMethods({ listPackages: () => undefined })
assert.throws(() => assertShellMethods({}), /at least one method/)
assert.throws(() => assertShellMethods({ bad_method: () => undefined }), /Invalid extension shell method/)
assert.throws(() => assertShellMethods({ installPackage: 'install_package' }), /must be a function/)

console.log('extension-shell tests passed')
