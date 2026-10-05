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
