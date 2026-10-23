import assert from 'node:assert/strict'

import {
  buildResourceServiceRows,
  defaultResourceServiceSortDir,
  visibleResourceServices,
  type ResourceServiceView,
} from '../src/lib/resource-services.ts'
import type { ExtensionSummary } from '../src/api/client.ts'

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

const labels = { pluginHost: 'Plugin host', pluginPrefix: 'Plugin', extensionName: (extension: ExtensionSummary) => extension.name }
const extensions = [
  { id: 'terminal', name: 'Terminal', installed: true, running: true, services: [{ id: 'main' }] },
  { id: 'ocr', name: 'OCR', installed: true, running: true },
  { id: 'screen-display', name: 'Screen display', installed: true, running: true, system: true, services: [{ id: 'main' }] },
  { id: 'nanokvm-device', name: 'Device backend', installed: true, running: true, system: true, services: [{ id: 'main', unit: 'onekvm.service' }] },
] as ExtensionSummary[]
const joined = buildResourceServiceRows([
  { id: 'terminal', kind: 'extension', cpu_percent: 2, memory_bytes: 1500, helper_memory_bytes: 500, process_memory_bytes: 1000 },
  { id: 'screen-display', kind: 'system', cpu_percent: 1, memory_bytes: 2800 },
], extensions, labels)
assert.equal(joined.filter(row => row.id === 'terminal').length, 1)
const terminal = joined.find(row => row.id === 'terminal')!
assert.equal(terminal.helper_memory_bytes, 500)
assert.equal(terminal.process_memory_bytes, 1000)
assert.equal(terminal.sampled, true)
const ocr = joined.find(row => row.id === 'ocr')!
assert.equal(ocr.sampled, false)
assert.equal(ocr.no_resident_process, true)
const unavailable = buildResourceServiceRows([], extensions, labels)
assert.equal(unavailable.find(row => row.id === 'terminal')?.no_resident_process, false)
assert.equal(unavailable.find(row => row.id === 'screen-display')?.sampled, false)
assert.equal(unavailable.find(row => row.id === 'onekvm-server')?.sampled, false)
assert.equal(unavailable.find(row => row.id === 'nanokvm-device')?.shared_with, 'core')

console.log('resource-services tests passed')
