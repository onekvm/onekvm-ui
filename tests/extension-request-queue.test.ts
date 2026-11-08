import assert from 'node:assert/strict'
import { createServer } from 'vite'

const events: string[] = []
let releaseFirst!: () => void
const firstResponse = new Promise<void>((resolve) => { releaseFirst = resolve })

Object.assign(globalThis, {
  document: { querySelector: () => null, createElement: () => ({}) },
  window: {
    location: new URL('https://device.test/'),
    dispatchEvent: () => true,
  },
  fetch: async (url: string) => {
    const path = new URL(url).pathname
    events.push(`start:${path}`)
    if (path === '/api/extensions/first') await firstResponse
    if (path === '/api/extensions/fail') {
      events.push(`end:${path}`)
      return new Response(JSON.stringify({ error: 'failed' }), { status: 500 })
    }
    events.push(`end:${path}`)
    return new Response(JSON.stringify({ ok: true }))
  },
})

const server = await createServer({
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true, include: [] },
})

try {
  const { request } = await server.ssrLoadModule('/src/api/client.ts')
  const first = request('/api/extensions/first')
  const second = request('/api/extensions/second')
  await new Promise<void>((resolve) => setTimeout(resolve, 20))
  assert.deepEqual(events, ['start:/api/extensions/first'])
  releaseFirst()
  await Promise.all([first, second])
  assert.deepEqual(events, [
    'start:/api/extensions/first', 'end:/api/extensions/first',
    'start:/api/extensions/second', 'end:/api/extensions/second',
  ])

  const failed = request('/api/extensions/fail')
  const afterFailure = request('/api/extensions/after-failure')
  await assert.rejects(failed, (error: unknown) => (
    typeof error === 'object' && error !== null && 'status' in error && error.status === 500
  ))
  await afterFailure
  assert.deepEqual(events.slice(-4), [
    'start:/api/extensions/fail', 'end:/api/extensions/fail',
    'start:/api/extensions/after-failure', 'end:/api/extensions/after-failure',
  ])
  console.log('extension request queue: FIFO ordering and failure recovery passed')
} finally {
  await server.close()
}
