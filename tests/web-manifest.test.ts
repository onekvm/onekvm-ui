import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
const html = readFileSync(new URL('index.html', root), 'utf8')
const manifest = JSON.parse(readFileSync(new URL('public/site.webmanifest', root), 'utf8')) as {
  id?: string
  name?: string
  short_name?: string
  start_url?: string
  scope?: string
  display?: string
  display_override?: string[]
  prefer_related_applications?: boolean
  launch_handler?: { client_mode?: string | string[] }
  icons?: { src: string; sizes: string; type: string }[]
}

assert.match(html, /rel="manifest" href="\/site.webmanifest"/, 'HTML links the web app manifest')
assert.match(html, /name="apple-mobile-web-app-title" content="OneKVM"/, 'iOS home-screen title is declared')
assert.match(html, /name="application-name" content="OneKVM"/, 'application name is declared')
assert.match(html, /name="mobile-web-app-capable" content="yes"/, 'web app install capability is declared')

assert.equal(manifest.name, 'OneKVM')
assert.equal(manifest.short_name, 'OneKVM')
assert.equal(manifest.id, '/')
assert.equal(manifest.start_url, '/', 'Chromium installability requires start_url')
assert.equal(manifest.scope, '/')
assert.equal(manifest.display, 'standalone')
assert.equal(manifest.prefer_related_applications, false)
assert.ok(manifest.display_override?.includes('standalone'), 'display_override keeps standalone first')

const launchMode = manifest.launch_handler?.client_mode
const modes = Array.isArray(launchMode) ? launchMode : [launchMode]
assert.ok(modes.includes('focus-existing'), 'installed launches reuse an existing window')

const sizes = new Set((manifest.icons ?? []).map((icon) => icon.sizes))
assert.ok(sizes.has('192x192'), '192px icon is required for Chromium install')
assert.ok(sizes.has('512x512'), '512px icon is required for Chromium install')

for (const icon of manifest.icons ?? []) {
  assert.ok(icon.src.startsWith('/'), `icon path is origin-absolute: ${icon.src}`)
  const file = fileURLToPath(new URL(`public${icon.src}`, root))
  assert.ok(existsSync(file), `icon file exists: ${icon.src}`)
}
