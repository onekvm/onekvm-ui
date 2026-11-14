import assert from 'node:assert/strict'
import { createServer } from 'vite'

class Element extends EventTarget {
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
const scripts: Script[] = []
const appended: Element[] = []
const timers = new Map<number, () => void>()
const registry = new Map<string, typeof Element>()
let timer = 0
const documentMock = {
  currentScript: null as Script | null,
  querySelector: () => null,
  createElement: (tag: string) => tag === 'script' ? new Script() : new Element(),
  head: { append: (el: Element) => { appended.push(el); if (el instanceof Script) scripts.push(el) } },
}
Object.assign(globalThis, {
  HTMLElement: Element, HTMLScriptElement: Script,
  customElements: { get: (tag: string) => registry.get(tag), define: (tag: string, ctor: typeof Element) => registry.set(tag, ctor) },
  document: documentMock,
  window: {
    location: new URL('https://device.test/'),
    setTimeout: (fn: () => void) => { timers.set(++timer, fn); return timer },
    clearTimeout: (id: number) => timers.delete(id),
  },
})
const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } })
const settle = () => new Promise<void>(resolve => setImmediate(resolve))
try {
  const pages = await server.ssrLoadModule('/src/extensions/pageRuntime.ts')
  const tools = await server.ssrLoadModule('/src/extensions/toolboxRuntime.ts')
  const extension = { id: 'native-example', name: 'Native example', installed: true, enabled: true, version: '1.0', page: { renderer: 'web-component', entrypoint: 'web/page.js' } }
  const definition = () => ({ apiVersion: 1, element: class extends Element {}, styles: ['.fixture {}'] })
  const execute = (script: Script, register: () => void) => {
    documentMock.currentScript = script
    try { register() } finally { documentMock.currentScript = null }
    script.dispatchEvent(new Event('load'))
    script.onload?.()
  }
  const load = pages.loadVueExtensionPage(extension)
  await settle()
  const script = scripts.at(-1)!
  assert.throws(() => pages.registerPage(extension.id, definition()), /only allowed/)
  execute(script, () => {
    assert.throws(() => pages.registerPage('wrong-id', definition()), /does not match/)
    pages.registerPage(extension.id, definition())
    assert.throws(() => pages.registerPage(extension.id, definition()), /Duplicate/)
  })
  const page = await load
  page.dispose()
  const count = scripts.length
  const reopened = await pages.loadVueExtensionPage(extension)
  assert.equal(scripts.length, count, 'Native pages must reuse their definition when reopened')
  assert.equal(reopened.component, page.component)
  reopened.dispose()
  const upgraded = pages.loadVueExtensionPage({ ...extension, version: '2.0' })
  await settle()
  execute(scripts.at(-1)!, () => pages.registerPage(extension.id, definition()))
  const next = await upgraded
  assert.notEqual(next.component, page.component)
  next.dispose()
  const missing = pages.loadVueExtensionPage({ ...extension, version: '3.0' })
  await settle()
  scripts.at(-1)!.dispatchEvent(new Event('load'))
  await assert.rejects(missing, /did not register/)
  const timeout = pages.loadVueExtensionPage({ ...extension, version: '4.0' })
  await settle()
  for (const callback of [...timers.values()]) callback()
  await assert.rejects(timeout, /timed out/)
  const vue = pages.loadVueExtensionPage({ ...extension, page: { ...extension.page, renderer: 'vue' } })
  await settle()
  execute(scripts.at(-1)!, () => pages.registerPage(extension.id, { apiVersion: 1, component: { name: 'Vue page' } }))
  const original = await vue
  original.dispose()

  const tool = { id: 'native', title: 'Native', presentation: 'window', view: { renderer: 'web-component', entrypoint: 'web/tool.js' } }
  const catalog = { ...extension, toolbox: { items: [tool] } }
  tools.invalidateToolResources([catalog])
  const toolLoad = tools.loadExtensionTool(catalog, tool)
  await settle()
  execute(scripts.at(-1)!, () => {
    assert.throws(() => tools.registerTool(extension.id, 'wrong-tool', definition()), /currently executing/)
    assert.throws(() => tools.registerTool(extension.id, tool.id, { apiVersion: 1, component: {} }), /HTMLElement/)
    tools.registerTool(extension.id, tool.id, definition())
  })
  const loaded = await toolLoad
  loaded.dispose()
  const toolCount = scripts.length
  const opened = await tools.loadExtensionTool(catalog, tool)
  assert.equal(scripts.length, toolCount)
  assert.equal(opened.component, loaded.component)
  const newCatalog = { ...catalog, version: '2.0' }
  tools.invalidateToolResources([newCatalog])
  const newLoad = tools.loadExtensionTool(newCatalog, tool)
  await settle()
  execute(scripts.at(-1)!, () => tools.registerTool(extension.id, tool.id, definition()))
  const newTool = await newLoad
  assert.notEqual(newTool.component, opened.component)
  opened.dispose(); newTool.dispose()
  tools.invalidateToolResources([])
  assert.equal(appended.filter(el => !(el instanceof Script) && !el.removed).length, 0)
  console.log('extension Web Components: Vue compatibility, strict registration, reopen, upgrade, timeout and cleanup passed')
} finally { await server.close() }
