import assert from 'node:assert/strict'
import { createServer } from 'vite'

// A small DOM transport lets the production loader execute with controlled
// resource completion, while retaining its real Vue runtime and API URL code.
class Element {
  dataset: Record<string, string> = {}
  textContent = ''
  removed = false
  remove() { this.removed = true }
}
class Script extends Element {
  src = ''
  async = false
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
}
const appended: Element[] = []
const scripts: Script[] = []
const timers = new Map<number, () => void>()
let timerId = 0
const documentMock = {
  currentScript: null as Script | null,
  createElement: (tag: string) => tag === 'script' ? new Script() : new Element(),
  head: { append: (element: Element) => { appended.push(element); if (element instanceof Script) scripts.push(element) } },
}
Object.assign(globalThis, {
  HTMLScriptElement: Script,
  document: documentMock,
  window: {
    location: new URL('https://device.test/'),
    setTimeout: (fn: () => void) => { const id = ++timerId; timers.set(id, fn); return id },
    clearTimeout: (id: number) => timers.delete(id),
  },
})
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const runtime = await server.ssrLoadModule('/src/extensions/toolboxRuntime.ts')
  const tool = (id: string) => ({ id, title: id, presentation: 'window', view: { renderer: 'vue', entrypoint: `web/${id}.js` } })
  const one = tool('first'), two = tool('second')
  const extension = { id: 'fixture-tools', version: '1.0', installed: true, enabled: true, toolbox: { items: [one, two] } }
  const settle = () => new Promise<void>(resolve => setImmediate(resolve))
  const styles = () => appended.filter(e => !(e instanceof Script) && !e.removed)
  function register(script: Script, id: string, component = { name: id }) {
    documentMock.currentScript = script
    try { runtime.registerTool(extension.id, id, { apiVersion: 1, component, styles: ['.shared { color: red }'] }) }
    finally { documentMock.currentScript = null }
    script.onload?.()
  }
  runtime.invalidateToolResources([extension])
  const a = runtime.loadExtensionTool(extension, one), b = runtime.loadExtensionTool(extension, one)
  await settle()
  assert.equal(scripts.length, 1, 'same key must share a single network load')
  assert.throws(() => runtime.registerTool(extension.id, one.id, { apiVersion: 1, component: {} }), /currently executing/)
  documentMock.currentScript = scripts[0]
  assert.throws(() => runtime.registerTool('wrong-extension', one.id, { apiVersion: 1, component: {} }), /currently executing/)
  documentMock.currentScript = null
  register(scripts[0], one.id)
  const [first, second] = await Promise.all([a, b])
  assert.equal(first.component, second.component)
  assert.equal(styles().length, 1)
  first.dispose(); first.dispose()
  assert.equal(styles().length, 1, 'disposing one consumer must retain the other stylesheet')
  second.dispose()
  assert.equal(styles().length, 0)
  const reopened = await runtime.loadExtensionTool(extension, one)
  assert.equal(scripts.length, 1, 'reopening may reuse the definition')
  assert.equal(styles().length, 1, 'reopening restores styles')
  const queued = runtime.loadExtensionTool(extension, two)
  await settle()
  const oldScript = scripts.at(-1)!
  runtime.invalidateToolResources([])
  await assert.rejects(queued, /invalidated/)
  assert.equal(oldScript.removed, true)
  assert.equal(styles().length, 1, 'mounted retiring consumer keeps CSS through leave')
  reopened.dispose()
  assert.equal(styles().length, 0)
  runtime.invalidateToolResources([extension])
  const retry = runtime.loadExtensionTool(extension, two)
  await settle()
  scripts.at(-1)!.onerror?.()
  await assert.rejects(retry, /Failed to load/)
  const timeout = runtime.loadExtensionTool(extension, two)
  await settle()
  for (const fire of [...timers.values()]) fire()
  await assert.rejects(timeout, /timed out/)
  const retrySuccess = runtime.loadExtensionTool(extension, two)
  await settle()
  register(scripts.at(-1)!, two.id)
  const loaded = await retrySuccess
  loaded.dispose()
  runtime.invalidateToolResources([])
  runtime.invalidateToolResources([extension])
  const distinctA = runtime.loadExtensionTool(extension, one)
  const distinctB = runtime.loadExtensionTool(extension, two)
  await settle()
  const before = scripts.length
  register(scripts.at(-1)!, one.id)
  const loadedA = await distinctA
  await settle()
  assert.equal(scripts.length, before + 1, 'different tools load in a safe registration queue')
  register(scripts.at(-1)!, two.id)
  const loadedB = await distinctB
  assert.notEqual(loadedA.component, loadedB.component)
  assert.equal(styles().length, 2)
  loadedA.dispose()
  assert.equal(styles().length, 1)
  loadedB.dispose()
  const old = await runtime.loadExtensionTool(extension, one)
  const upgrade = { ...extension, version: '2.0' }
  runtime.invalidateToolResources([upgrade])
  const next = runtime.loadExtensionTool(upgrade, one)
  await settle()
  assert.match(scripts.at(-1)!.src, /2\.0/)
  register(scripts.at(-1)!, one.id, { name: 'upgraded' })
  const upgraded = await next
  assert.notEqual(old.component, upgraded.component, 'new versions must not reuse stale definitions')
  assert.equal(styles().length, 2, 'upgrade retains retiring CSS until its consumer leaves')
  old.dispose()
  assert.equal(styles().length, 1)
  upgraded.dispose()
  await assert.rejects(runtime.loadExtensionTool({ ...upgrade, enabled: false }, one), /unavailable/)
  console.log('toolbox loader: concurrency, refcounts, retirement, retry and timeout passed')
} finally {
  await server.close()
}
