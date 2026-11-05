import assert from 'node:assert/strict'
import { createRenderer, nextTick, shallowRef } from 'vue'
import { createServer } from 'vite'

const registry = new Map<string, typeof FakeElement>()
const observers: FakeObserver[] = []
class FakeElement extends EventTarget {
  isConnected = false
  host: any
  connectedCallback?(): void
  disconnectedCallback?(): void
}
class FakeObserver {
  stopped = false
  notify: () => void
  constructor(notify: () => void) { this.notify = notify; observers.push(this) }
  observe() {}
  disconnect() { this.stopped = true }
}
Object.assign(globalThis, {
  HTMLElement: FakeElement,
  MutationObserver: FakeObserver,
  customElements: {
    get: (tag: string) => registry.get(tag),
    define: (tag: string, element: typeof FakeElement) => {
      assert(!registry.has(tag) && ![...registry.values()].includes(element), 'Custom elements cannot be defined twice')
      registry.set(tag, element)
    },
  },
  window: { OneKVMTheme: { v1: { current: () => ({ id: 'graphite', appearance: 'dark' }) } } },
  document: { documentElement: {} },
})
const server = await createServer({ server: { middlewareMode: true, watch: null, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } })
let element: FakeElement
let updates = 0
let disconnected = 0
let unregistered = 0
let settings: any
const calls: string[] = []
const extension = shallowRef({ id: 'native-example', version: '1', settings: { message: 'hello' } })
const host = {
  apiVersion: 1,
  extension,
  getStatus: async () => ({ model: 'fixture' }),
  assetURL: (path: string) => '/fixture/' + path,
  invoke: async (method: string) => { calls.push(extension.value.id + '/' + method); return 'ok' },
  saveSettings: async () => true,
  registerSettings: (adapter: any) => { settings = adapter; return () => { unregistered++ } },
}
class Probe extends FakeElement {
  connectedCallback() {
    assert.equal(this.host.extension.id, 'native-example', 'Host must be a DOM property before connectedCallback')
    assert.equal(this.host.extension.value, undefined, 'Native consumers receive snapshots, not Vue refs')
    this.host.registerSettings({ collect: () => ({ message: 'updated' }), reset: () => {} })
    this.addEventListener('onekvm-host-change', () => { updates++ })
  }
  disconnectedCallback() { disconnected++ }
}
registry.set('already-registered', Probe)
const renderer = createRenderer({
  createElement(tag) { element = new (registry.get(tag)!)(); return element },
  insert(el) { el.isConnected = true; el.connectedCallback?.() },
  remove(el) { el.isConnected = false; el.disconnectedCallback?.() },
  patchProp(el, key, _prev, value) { if (key.startsWith('.')) (el as any)[key.slice(1)] = value },
  createText: () => new FakeElement(), createComment: () => new FakeElement(),
  setText() {}, setElementText() {}, parentNode: () => null, nextSibling: () => null,
})
try {
  const { normalizeExtensionView } = await server.ssrLoadModule('/src/extensions/webComponentView.ts')
  const { currentLanguage } = await server.ssrLoadModule('/src/i18n/runtime.ts')
  const definition = { apiVersion: 1, element: Probe }
  const view = normalizeExtensionView(definition, 'web-component')
  assert.equal(normalizeExtensionView(definition, 'web-component').component, view.component)
  assert.throws(() => normalizeExtensionView({ apiVersion: 1, component: {} }, 'web-component'), /HTMLElement/)
  assert.throws(() => normalizeExtensionView(definition, 'vue'), /Vue component/)
  assert.throws(() => normalizeExtensionView({ ...definition, styles: [42] }, 'web-component'), /Incompatible/)
  const app = renderer.createApp(view.component, { host })
  app.mount(new FakeElement())
  await element!.host.invoke('echo')
  assert.deepEqual(calls, ['native-example/echo'])
  const registration = element!.host.registerSettings({ dirty: false, valid: true, collect: () => ({ message: 'saved' }), reset: () => {} })
  registration.update({ dirty: true, valid: false })
  assert.equal(settings.dirty.value, true)
  assert.equal(settings.valid.value, false)
  assert.deepEqual(settings.collect(), { message: 'saved' })
  extension.value = { ...extension.value, version: '2' }
  currentLanguage.value = 'zh'
  await nextTick()
  assert.equal(element!.host.language, 'zh')
  assert.equal(element!.host.extension.version, '2')
  assert(updates > 0)
  const beforeTheme = updates
  observers[0]!.notify()
  assert.equal(updates, beforeTheme + 1)
  app.unmount()
  assert.equal(disconnected, 1)
  assert.equal(unregistered, 2)
  assert(observers[0]!.stopped)
  assert.throws(() => element!.host.invoke('echo'), /no longer active/)
  assert.throws(() => registration.update({ dirty: false }), /no longer active/)
  registration.dispose()
  assert.equal(unregistered, 2)
  const next = normalizeExtensionView({ apiVersion: 1, element: class extends Probe {} }, 'web-component')
  assert.notEqual(next.component, view.component, 'Upgraded definitions must get a distinct custom element')
  console.log('web component host: connection, snapshots, settings, notifications and teardown passed')
} finally { await server.close() }
