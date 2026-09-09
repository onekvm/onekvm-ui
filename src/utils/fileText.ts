export type FileLineEnding = 'lf' | 'crlf'
export type FileTextErrorCode = 'too-large' | 'binary' | 'invalid-utf8'

export class FileTextError extends Error {
  readonly code: FileTextErrorCode

  constructor(code: FileTextErrorCode) {
    super(code)
    this.name = 'FileTextError'
    this.code = code
  }
}

export interface DecodedTextFile {
  text: string
  lineEnding: FileLineEnding
  byteOrderMark: boolean
}

const UTF8_BOM = new Uint8Array([0xef, 0xbb, 0xbf])

export function decodeTextFile(bytes: Uint8Array, maxBytes: number): DecodedTextFile {
  if (bytes.byteLength > maxBytes) throw new FileTextError('too-large')
  if (bytes.includes(0)) throw new FileTextError('binary')

  const byteOrderMark = bytes.length >= 3
    && bytes[0] === UTF8_BOM[0]
    && bytes[1] === UTF8_BOM[1]
    && bytes[2] === UTF8_BOM[2]
  const source = byteOrderMark ? bytes.subarray(3) : bytes
  let decoded: string
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(source)
  } catch {
    throw new FileTextError('invalid-utf8')
  }

  const lineFeedCount = decoded.split('\n').length - 1
  const crlfCount = decoded.split('\r\n').length - 1
  const lineEnding: FileLineEnding = crlfCount > 0 && crlfCount * 2 >= lineFeedCount
    ? 'crlf'
    : 'lf'
  return {
    text: decoded.replace(/\r\n/g, '\n').replace(/\r/g, '\n'),
    lineEnding,
    byteOrderMark,
  }
}

export function encodeTextFile(
  text: string,
  lineEnding: FileLineEnding,
  byteOrderMark: boolean,
) {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const serialized = lineEnding === 'crlf' ? normalized.replace(/\n/g, '\r\n') : normalized
  const content = new TextEncoder().encode(serialized)
  if (!byteOrderMark) return content
  const result = new Uint8Array(UTF8_BOM.length + content.length)
  result.set(UTF8_BOM)
  result.set(content, UTF8_BOM.length)
  return result
}
