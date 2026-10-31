import { createRequire } from 'node:module'
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const vitePackage = realpathSync(fileURLToPath(new URL('../node_modules/vite/package.json', import.meta.url)))
const require = createRequire(vitePackage)
const esbuild = require('esbuild')

export const builtinLanguages = [
  { code: 'en', name: 'English' },
  { code: 'zh', name: '简体中文' },
  { code: 'zh_tw', name: '繁體中文' },
]

export async function loadTranslation(root, code) {
  const directory = mkdtempSync(path.join(tmpdir(), 'onekvm-l10n-'))
  const outfile = path.join(directory, `${code}.mjs`)
  try {
    await esbuild.build({
      entryPoints: [path.join(root, 'src/i18n/locales', `${code}.ts`)],
      bundle: true,
      format: 'esm',
      platform: 'node',
      outfile,
      logLevel: 'silent',
    })
    const loaded = await import(pathToFileURL(outfile).href)
    const translation = loaded.default?.translation
    if (!translation || typeof translation !== 'object') {
      throw new Error(`locale ${code} has no translation object`)
    }
    return translation
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

export function readPack(root, code) {
  const file = path.join(root, 'l10n-out', code, 'messages.json')
  return JSON.parse(readFileSync(file, 'utf8'))
}

export function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value)}\n`)
}
