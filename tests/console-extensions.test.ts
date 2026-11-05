import assert from 'node:assert/strict'
import { createServer } from 'vite'

class Script extends EventTarget {
  src = ''
  removed = false
  remove() { this.removed = true }
}
const scripts: Script[] = []
const timers = new Map<number, () => void>()
let timer = 0
const documentMock = {
  currentScript: null as Script | null,
  querySelector: () => null,
  createElement: () => new Script(),
  head: { append: (script: Script) => scripts.push(script) },
}
const requests: Array<{ url: string; body: unknown }> = []
Object.assign(globalThis, {
  HTMLScriptElement: Script, document: documentMock,
  window: { location: new URL('https://device.test/'), dispatchEvent: () => true,
    setTimeout: (fn: () => void) => { timers.set(++timer, fn); return timer },
    clearTimeout: (id: number) => timers.delete(id),
  },
  fetch: async (url: string, options: RequestInit) => {
    requests.push({ url, body: options.body })
    return new Response(JSON.stringify({ reply: 'ok' }))
  },
})
const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } })
const originalWarn = console.warn
const warnings: unknown[][] = []
console.warn = (...args) => { warnings.push(args) }
try {
  const runtime = await server.ssrLoadModule('/src/extensions/consoleRuntime.ts')
  const extension = { id: 'console-probe', name: 'Probe', version: '1', installed: true, enabled: true, console: { entrypoint: 'web/console.js' } }
  const execute = (script: Script, callback: () => void) => {
    documentMock.currentScript = script
    try { callback() } finally { documentMock.currentScript = null }
    script.dispatchEvent(new Event('load'))
  }
  let loads = 0
  let cleanups = 0
  let host: any
  const definition = { apiVersion: 1, onLoad: (value: any) => { host = value; loads++; return () => { cleanups++ } } }
  assert.throws(() => runtime.registerConsole(extension.id, definition), /currently executing/)
  const initial = runtime.syncExtensionConsoles([extension])
  const script = scripts.at(-1)!
  execute(script, () => {
    assert.throws(() => runtime.registerConsole('wrong-id', definition), /currently executing/)
    assert.throws(() => runtime.registerConsole(extension.id, { apiVersion: 1 }), /onLoad/)
    runtime.registerConsole(extension.id, definition)
    assert.throws(() => runtime.registerConsole(extension.id, definition), /Duplicate/)
  })
  await initial
  assert.equal(loads, 1)
  assert(script.removed)
  assert.equal(host.extension.value, undefined)
  assert.equal(host.assetURL('web/file.js'), 'https://device.test/api/extension-pages/console-probe/1/web/file.js')
  await host.invoke('echo', { value: 1 })
  assert.equal(requests[0]!.url, 'https://device.test/api/extensions/console-probe/invoke/echo')
  assert.equal(requests[0]!.body, '{"value":1}')
  await runtime.syncExtensionConsoles([{ ...extension, name: 'Updated' }])
  assert.equal(host.extension.name, 'Updated')
  assert.equal(loads, 1, 'Catalog refresh must not rerun onLoad')
  const firstHost = host
  await runtime.syncExtensionConsoles([{ ...extension, enabled: false }])
  assert.equal(cleanups, 1)
  assert(firstHost.signal.aborted)
  assert.throws(() => firstHost.assetURL('web/file.js'), /no longer active/)
  assert.throws(() => firstHost.invoke('echo'), /no longer active/)
  await runtime.syncExtensionConsoles([extension])
  assert.equal(scripts.length, 1, 'Reentry reuses the definition')
  assert.equal(loads, 2)
  assert.notEqual(host, firstHost)

  const upgrade = runtime.syncExtensionConsoles([{ ...extension, version: '2' }])
  assert.equal(cleanups, 2, 'Upgrade clears the old run before loading the new script')
  let resolveCleanup: (cleanup: () => void) => void
  let lateHost: any
  execute(scripts.at(-1)!, () => runtime.registerConsole(extension.id, { apiVersion: 1, onLoad: (value: any) => {
    lateHost = value
    return new Promise<() => void>(resolve => { resolveCleanup = resolve })
  } }))
  await new Promise(resolve => setImmediate(resolve))
  runtime.clearExtensionConsoles()
  assert(lateHost.signal.aborted)
  let lateCleanups = 0
  resolveCleanup!(() => { lateCleanups++ })
  await upgrade
  runtime.clearExtensionConsoles()
  assert.equal(lateCleanups, 1, 'Late async initialization is cleaned once after leaving')

  const cancelled = runtime.syncExtensionConsoles([{ ...extension, version: '3' }])
  const cancelledScript = scripts.at(-1)!
  runtime.clearExtensionConsoles()
  execute(cancelledScript, () => assert.throws(() => runtime.registerConsole(extension.id, definition), /currently executing/))
  await cancelled
  assert(cancelledScript.removed)
  const missing = runtime.syncExtensionConsoles([{ ...extension, version: '4' }])
  scripts.at(-1)!.dispatchEvent(new Event('load'))
  await missing
  assert(warnings.some(args => String(args[1]).includes('did not register')))
  runtime.clearExtensionConsoles()
  const timeout = runtime.syncExtensionConsoles([{ ...extension, version: '5' }])
  for (const callback of [...timers.values()]) callback()
  await timeout
  assert.equal(timers.size, 0)
  assert(warnings.some(args => String(args[1]).includes('timed out')))
  runtime.clearExtensionConsoles()

  let goodLoaded = false
  let failingHost: any
  const independent = runtime.syncExtensionConsoles([
    { ...extension, version: '6' }, { ...extension, id: 'good-probe' },
  ])
  execute(scripts.at(-2)!, () => runtime.registerConsole(extension.id, { apiVersion: 1, onLoad: (value: any) => { failingHost = value; throw Error('bad hook') } }))
  execute(scripts.at(-1)!, () => runtime.registerConsole('good-probe', { apiVersion: 1, onLoad: () => { goodLoaded = true } }))
  await independent
  assert(goodLoaded, 'An exception must not block another extension')
  assert(failingHost.signal.aborted)
  runtime.clearExtensionConsoles()
  const count = scripts.length
  await runtime.syncExtensionConsoles([{ ...extension, installed: false }, { ...extension, error: 'invalid manifest' }])
  assert.equal(scripts.length, count)
  console.log('console hooks: once per entry, scoped host, strict registration, reentry, upgrade, cancellation, async teardown and failure isolation passed')
} finally { console.warn = originalWarn; await server.close() }
