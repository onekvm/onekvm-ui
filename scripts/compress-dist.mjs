// Write Brotli and gzip variants next to the built text assets. Core serves a
// variant the browser accepts instead of the original, so the device sends
// and caches about a fifth of the bytes. Originals stay for clients that do
// not accept either encoding.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

const COMPRESSIBLE = /\.(?:css|html|ico|js|json|mjs|svg|txt|wasm|webmanifest|xml)$/
const MIN_BYTES = 1024
// A variant that saves less than this is not worth the extra storage.
const MAX_RATIO = 0.9

function* files(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* files(file)
    else if (entry.isFile()) yield file
  }
}

const dir = process.argv[2]
if (!dir) {
  console.error('usage: compress-dist.mjs <dist directory>')
  process.exit(2)
}

let original = 0
let brotli = 0
for (const file of files(dir)) {
  if (!COMPRESSIBLE.test(file)) continue
  const bytes = readFileSync(file)
  if (bytes.length < MIN_BYTES) continue
  const variants = [
    [
      '.br',
      brotliCompressSync(bytes, {
        params: {
          [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
          [constants.BROTLI_PARAM_SIZE_HINT]: bytes.length,
        },
      }),
    ],
    ['.gz', gzipSync(bytes, { level: 9 })],
  ]
  for (const [suffix, compressed] of variants) {
    if (compressed.length > bytes.length * MAX_RATIO) continue
    writeFileSync(file + suffix, compressed)
    if (suffix === '.br') {
      original += bytes.length
      brotli += compressed.length
    }
  }
}
console.log(`compressed ${original} bytes to ${brotli} bytes (Brotli) in ${dir}`)
