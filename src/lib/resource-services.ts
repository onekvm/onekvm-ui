import type { ExtensionSummary, ServiceResourceUsage } from '../api/client.ts'

export type ResourceServiceStatusFilter = 'running' | 'stopped' | 'all'
export type ResourceServiceSortKey = 'name' | 'status' | 'cpu' | 'memory'
export type ResourceServiceSortDir = 'asc' | 'desc'

export interface ResourceServiceView {
  id: string
  name: string
  running: boolean
  cpu_percent: number
  memory_bytes: number
}

export type ResourceServiceRow = ServiceResourceUsage & {
  name: string
  running: boolean
  sampled: boolean
  no_resident_process: boolean
  shared_with?: 'core' | 'plugin-host'
}

/** Join catalog entries to samples without turning missing measurements into zero usage. */
export function buildResourceServiceRows(
  resources: readonly ServiceResourceUsage[],
  extensions: readonly ExtensionSummary[],
  labels: { pluginHost: string; pluginPrefix: string; extensionName: (extension: ExtensionSummary) => string },
): ResourceServiceRow[] {
  const usage = new Map(resources.map(service => [`${service.kind}:${service.id}`, service]))
  const included = new Set<string>()
  const rows: ResourceServiceRow[] = []
  const add = (id: string, kind: ServiceResourceUsage['kind'], name: string, running: boolean, noResident = false) => {
    const key = `${kind}:${id}`
    const resource = usage.get(key)
    included.add(key)
    rows.push({
      id, kind, cpu_percent: 0, memory_bytes: 0,
      ...resource,
      name, running, sampled: Boolean(resource),
      no_resident_process: !resource && running && noResident,
    })
  }
  if (usage.has('system:plugin-host')) add('plugin-host', 'system', labels.pluginHost, true)
  for (const extension of extensions.filter(item => item.installed)) {
    const kind = extension.system ? 'system' : 'extension'
    if (extension.system && !extension.running && !usage.has(`${kind}:${extension.id}`)) continue
    const name = labels.extensionName(extension)
    add(extension.id, kind, extension.system ? name : `${labels.pluginPrefix}: ${name}`,
      Boolean(extension.running), !extension.system && !extension.services?.length)
    const row = rows[rows.length - 1]!
    const units = extension.services?.map(service => service.unit) || []
    if (!row.sampled && units.length && units.every(unit => unit === 'onekvm.service')) row.shared_with = 'core'
    if (!row.sampled && units.length && units.every(unit => unit === 'onekvm-extension-host.service')) row.shared_with = 'plugin-host'
  }
  for (const resource of resources) {
    if (resource.kind === 'core' || included.has(`${resource.kind}:${resource.id}`)) continue
    add(resource.id, resource.kind,
      resource.kind === 'extension' ? `${labels.pluginPrefix}: ${resource.id}` : resource.id,
      resource.memory_bytes > 0)
  }
  add('onekvm-server', 'core', 'onekvm-server', true)
  return rows
}

export function defaultResourceServiceSortDir(key: ResourceServiceSortKey): ResourceServiceSortDir {
  return key === 'name' ? 'asc' : 'desc'
}

export function filterResourceServices<T extends ResourceServiceView>(
  rows: readonly T[],
  query: string,
  status: ResourceServiceStatusFilter,
): T[] {
  const needle = query.trim().toLowerCase()
  return rows.filter((row) => {
    if (status === 'running' && !row.running) return false
    if (status === 'stopped' && row.running) return false
    if (!needle) return true
    return row.name.toLowerCase().includes(needle) || row.id.toLowerCase().includes(needle)
  })
}

export function sortResourceServices<T extends ResourceServiceView>(
  rows: readonly T[],
  key: ResourceServiceSortKey,
  dir: ResourceServiceSortDir,
): T[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...rows].sort((left, right) => {
    let cmp = 0
    if (key === 'name') cmp = left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
    else if (key === 'cpu') cmp = left.cpu_percent - right.cpu_percent
    else if (key === 'memory') cmp = left.memory_bytes - right.memory_bytes
    else cmp = Number(left.running) - Number(right.running)
    if (cmp === 0) {
      cmp = left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
    }
    if (cmp === 0) cmp = left.id.localeCompare(right.id)
    return cmp * sign
  })
}

export function visibleResourceServices<T extends ResourceServiceView>(
  rows: readonly T[],
  query: string,
  status: ResourceServiceStatusFilter,
  key: ResourceServiceSortKey,
  dir: ResourceServiceSortDir,
): T[] {
  return sortResourceServices(filterResourceServices(rows, query, status), key, dir)
}
