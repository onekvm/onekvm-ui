import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const sources: FakeSource[] = []
class FakeSource extends EventTarget {
  onerror: (() => void) | null = null
  closed = false
  constructor(_url: string, _options: unknown) { super(); sources.push(this) }
  close() { this.closed = true }
  emit(type: string, data: unknown) {
    this.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(data) }))
  }
}
const timers = new Map<number, () => void>()
let timerId = 0
const globals = {
  EventSource: FakeSource,
  setTimeout: (callback: () => void) => { timers.set(++timerId, callback); return timerId },
  clearTimeout: (id: number) => { timers.delete(id) },
}
const tick = () => { for (const [id, callback] of [...timers]) { timers.delete(id); callback() } }
const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  root: fileURLToPath(new URL('..', import.meta.url)),
  resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
  server: { middlewareMode: true, hmr: false, watch: null },
})
const originals = Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const)
let unsubscribe: (() => void) | undefined
try {
  const { api } = await server.ssrLoadModule('/src/api/client.ts')
  api.getStatusEventsURL = () => 'https://onekvm.test/api/status'
  const { statusEvents } = await server.ssrLoadModule('/src/lib/status-events.ts')
  for (const [name, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
  }
  const received: { uptime_seconds: number }[] = []
  let errors = 0
  unsubscribe = statusEvents.subscribe((status: typeof received[number]) => received.push(status), () => { errors += 1 })
  const first = sources.at(-1)!
  first.emit('status', { uptime_seconds: 10 })
  first.emit('status.patch', [{ op: 'replace', path: '/uptime_seconds', value: 11 }])
  assert.equal(received.at(-1)?.uptime_seconds, 11)

  first.emit('status.patch', [{ op: 'replace', path: '/missing/field', value: 1 }])
  assert.equal(errors, 1)
  assert.equal(first.closed, true, 'An unusable patch stream must close and request a new full snapshot')
  assert.equal(timers.size, 1, 'Recovery must back off instead of reopening synchronously')
  first.emit('status', { uptime_seconds: 0 })
  assert.equal(received.at(-1)?.uptime_seconds, 11, 'Queued events from an obsolete stream must be ignored')
  tick()
  const second = sources.at(-1)!
  assert.notEqual(second, first)
  second.emit('status', { uptime_seconds: 20 })
  second.emit('status.patch', [{ op: 'replace', path: '/uptime_seconds', value: 21 }])
  assert.equal(received.at(-1)?.uptime_seconds, 21, 'New snapshots must resume patch delivery')

  second.onerror?.()
  assert.equal(errors, 2)
  assert.equal(second.closed, true)
  statusEvents.reconnect()
  assert.equal(timers.size, 0, 'Manual reconnect replaces a pending retry')
  const third = sources.at(-1)!
  third.emit('status', { uptime_seconds: 30 })
  assert.equal(received.at(-1)?.uptime_seconds, 30)
  second.onerror?.()
  assert.equal(errors, 2, 'Obsolete errors must not invalidate the recovered snapshot')

  third.emit('status', null)
  assert.equal(errors, 3, 'Invalid full snapshots must also request resynchronization')
  tick()
  const fourth = sources.at(-1)!
  fourth.emit('status.patch', [])
  assert.equal(errors, 4, 'A patch without its base must request a full snapshot')
  unsubscribe()
  unsubscribe = undefined
  assert.equal(timers.size, 0, 'Unmount cancels scheduled recovery')
  tick()
  assert.equal(sources.at(-1), fourth, 'Unused status streams must not reopen')
  console.log('status events tests passed')
} finally {
  unsubscribe?.()
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else Reflect.deleteProperty(globalThis, name)
  }
  await server.close()
}
