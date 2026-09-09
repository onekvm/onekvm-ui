import assert from 'node:assert/strict'

import {
  decodeTextFile,
  encodeTextFile,
  FileTextError,
} from '../src/utils/fileText.ts'

const encoder = new TextEncoder()

const lf = decodeTextFile(encoder.encode('first\nsecond\n'), 1024)
assert.equal(lf.text, 'first\nsecond\n')
assert.equal(lf.lineEnding, 'lf')
assert.equal(lf.byteOrderMark, false)

const windowsSource = new Uint8Array([
  0xef, 0xbb, 0xbf,
  ...encoder.encode('first\r\nsecond\r\n'),
])
const windows = decodeTextFile(windowsSource, 1024)
assert.equal(windows.text, 'first\nsecond\n')
assert.equal(windows.lineEnding, 'crlf')
assert.equal(windows.byteOrderMark, true)
assert.deepEqual(
  encodeTextFile(windows.text, windows.lineEnding, windows.byteOrderMark),
  windowsSource,
)

assert.throws(
  () => decodeTextFile(new Uint8Array([0x61, 0, 0x62]), 1024),
  (error: unknown) => error instanceof FileTextError && error.code === 'binary',
)
assert.throws(
  () => decodeTextFile(new Uint8Array([0xc3, 0x28]), 1024),
  (error: unknown) => error instanceof FileTextError && error.code === 'invalid-utf8',
)
assert.throws(
  () => decodeTextFile(encoder.encode('large'), 2),
  (error: unknown) => error instanceof FileTextError && error.code === 'too-large',
)

console.log('file editor tests passed')
