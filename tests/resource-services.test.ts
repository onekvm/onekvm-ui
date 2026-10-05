import assert from 'node:assert/strict'

import {
  defaultResourceServiceSortDir,
  visibleResourceServices,
  type ResourceServiceView,
} from '../src/lib/resource-services.ts'

const rows: ResourceServiceView[] = [
  { id: 'vnc', name: 'Plugin: VNC', running: false, cpu_percent: 0, memory_bytes: 0 },
  { id: 'plugin-host', name: 'Plugin host', running: true, cpu_percent: 1.2, memory_bytes: 12_000_000 },
  { id: 'onekvm-server', name: 'onekvm-server', running: true, cpu_percent: 8.4, memory_bytes: 40_000_000 },
  { id: 'zerotier', name: 'Plugin: ZeroTier', running: true, cpu_percent: 0.4, memory_bytes: 6_000_000 },
]

const running = visibleResourceServices(rows, '', 'running', 'memory', 'desc')
assert.deepEqual(running.map((row) => row.id), ['onekvm-server', 'plugin-host', 'zerotier'])

const searched = visibleResourceServices(rows, 'plugin', 'all', 'name', 'asc')
assert.deepEqual(searched.map((row) => row.id), ['plugin-host', 'vnc', 'zerotier'])

const stopped = visibleResourceServices(rows, '', 'stopped', 'name', 'asc')
assert.deepEqual(stopped.map((row) => row.id), ['vnc'])

assert.equal(defaultResourceServiceSortDir('memory'), 'desc')
assert.equal(defaultResourceServiceSortDir('name'), 'asc')

const cpu = visibleResourceServices(rows, '', 'running', 'cpu', 'desc')
assert.equal(cpu[0]?.id, 'onekvm-server')

console.log('resource-services tests passed')
