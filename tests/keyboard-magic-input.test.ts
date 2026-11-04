import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createRenderer, nextTick, shallowRef } from 'vue'
import { createServer } from 'vite'
import { KeyboardReportState } from '../src/lib/keyboard-report-state.ts'

const surface = { tagName: 'DIV', getAttribute: () => null }
const documentMock = Object.assign(new EventTarget(), { activeElement: surface })
const scheduled = new Map<number, () => void>()
let timerId = 0
const windowMock = Object.assign(new EventTarget(), {
  setTimeout(callback: () => void) { scheduled.set(++timerId, callback); return timerId },
  clearTimeout(id: number) { scheduled.delete(id) },
})
const reports: { keys: number[]; modifiers: number }[] = []
const hid = { keyboardState: new KeyboardReportState((keys, modifiers) => reports.push({ keys, modifiers })) }
const globals = { window: windowMock, document: documentMock, __magicHID: hid }
const original = Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const)
for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, value })
const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  root: fileURLToPath(new URL('..', import.meta.url)),
  resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
  plugins: [{
    name: 'mock-magic-hid', enforce: 'pre',
    resolveId(id) {
      if (id === '@/lib/onekvm' || id.replace(/\.ts$/, '') === fileURLToPath(new URL('../src/lib/onekvm', import.meta.url))) return '\0magic-hid'
    },
    load(id) { if (id === '\0magic-hid') return 'export const onekvm = globalThis.__magicHID' },
  }],
  server: { middlewareMode: true, hmr: false, watch: null },
})
const renderer = createRenderer({
  insert() {}, remove() {}, patchProp() {},
  createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
  setText() {}, setElementText() {}, parentNode: () => null, nextSibling: () => null,
})
let app: ReturnType<typeof renderer.createApp> | undefined
try {
  const { useKeyboard } = await server.ssrLoadModule('/src/composables/useKeyboard.ts')
  const { magicHint } = await server.ssrLoadModule('/src/lib/keyboard-magic.ts')
  const blocked = shallowRef(false)
  const magic = shallowRef('ControlRight')
  app = renderer.createApp({ setup() {
    useKeyboard(blocked, shallowRef(surface), shallowRef(false), shallowRef(false), magic)
    return () => null
  } })
  app.mount({})
  const key = (code: string, down: boolean, repeat = false) => windowMock.dispatchEvent(Object.assign(new Event(down ? 'keydown' : 'keyup', { cancelable: true }), { code, repeat }))
  const tap = (code: string) => { key(code, true); key(code, false) }
  const flush = () => {
    while (scheduled.size) {
      const [id, callback] = [...scheduled][0]!
      scheduled.delete(id)
      callback()
    }
  }
  const record = () => { tap('ControlRight'); tap('AltLeft'); tap('Tab'); tap('Tab') }
  record()
  assert.deepEqual(reports, [], 'Tapping Magic and entering the shortcut must not reach the host')
  assert.equal(magicHint.value.sequence.length, 2)
  tap('ControlRight')
  assert.deepEqual(reports, [{ keys: [], modifiers: 4 }])
  assert.equal(magicHint.value.playing, true)
  flush()
  assert.deepEqual(reports, [
    { keys: [], modifiers: 4 },
    { keys: [43], modifiers: 4 }, { keys: [], modifiers: 4 },
    { keys: [43], modifiers: 4 }, { keys: [], modifiers: 4 },
    { keys: [], modifiers: 0 },
  ])
  assert.equal(magicHint.value.active, false)
  tap('KeyA')
  assert.deepEqual(reports.slice(-2), [{ keys: [4], modifiers: 0 }, { keys: [], modifiers: 0 }], 'Sending once must restore normal input')

  const beforeCancel = reports.length
  record()
  tap('Escape')
  flush()
  assert.equal(reports.length, beforeCancel, 'Esc must discard recording without sending it')
  record()
  windowMock.dispatchEvent(new Event('blur'))
  flush()
  assert.equal(reports.length, beforeCancel, 'Losing focus must discard recording')

  for (const confirm of [false, true]) {
    tap('ControlRight')
    key('KeyB', true)
    tap(confirm ? 'ControlRight' : 'Escape')
    flush()
    const count = reports.length
    key('KeyB', true, true)
    key('KeyB', false)
    assert.equal(reports.length, count, 'A key held through confirmation/cancellation must not leak browser repeats')
    tap('KeyB')
    assert.deepEqual(reports.slice(-2), [{ keys: [5], modifiers: 0 }, { keys: [], modifiers: 0 }])
  }

  // Cancel queued playback and preserve another keyboard source's held keys.
  hid.keyboardState.set('virtual', [], 8)
  for (const cancel of [
    async () => { tap('Escape') },
    async () => { windowMock.dispatchEvent(new Event('blur')) },
    async () => { blocked.value = true; await nextTick(); blocked.value = false; await nextTick() },
    async () => { magic.value = ''; await nextTick(); magic.value = 'ControlRight'; await nextTick() },
    async () => { app!.unmount(); app = undefined },
  ]) {
    record()
    tap('ControlRight')
    assert.equal(scheduled.size, 1)
    assert.deepEqual(reports.at(-1), { keys: [], modifiers: 12 })
    await cancel()
    assert.equal(scheduled.size, 0, 'Cancellation must remove pending sends')
    assert.deepEqual(reports.at(-1), { keys: [], modifiers: 8 })
    assert.equal(magicHint.value.active, false)
    const count = reports.length
    flush()
    assert.equal(reports.length, count, 'Cancelled playback must not send later frames')
  }
  console.log('keyboard-magic-input tests passed')
} finally {
  app?.unmount()
  await server.close()
  for (const [name, descriptor] of original) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else Reflect.deleteProperty(globalThis, name)
  }
}
