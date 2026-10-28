import { api, type OneKVMStatus } from '@/api/client'

type StatusListener = (status: OneKVMStatus) => void
type ErrorListener = () => void
export type StatusPatchOperation = {
  op: 'add' | 'remove' | 'replace'
  path: string
  value?: unknown
}
type StatusWaiter = {
  resolve: (status: OneKVMStatus) => void
  reject: (error: Error) => void
}

function cloneStatus(status: OneKVMStatus) {
  return JSON.parse(JSON.stringify(status)) as OneKVMStatus
}

function decodePointer(path: string) {
  if (path === '') return []
  if (!path.startsWith('/')) throw new Error('Invalid status patch path')
  return path.slice(1).split('/').map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))
}

function patchValue(value: unknown, operations: StatusPatchOperation[]) {
  let root = value
  for (const operation of operations) {
    const parts = decodePointer(operation.path)
    if (!parts.length) {
      if (operation.op === 'remove' || operation.value === undefined) throw new Error('Invalid root status patch')
      root = operation.value
      continue
    }
    let parent: unknown = root
    for (const part of parts.slice(0, -1)) {
      if (Array.isArray(parent)) {
        const index = Number(part)
        if (!Number.isInteger(index) || index < 0 || index >= parent.length) throw new Error('Invalid status patch parent')
        parent = parent[index]
      } else if (parent && typeof parent === 'object') {
        parent = (parent as Record<string, unknown>)[part]
      } else {
        throw new Error('Invalid status patch parent')
      }
    }
    const key = parts.at(-1) as string
    if (Array.isArray(parent)) {
      if (operation.op === 'remove') {
        const index = Number(key)
        if (!Number.isInteger(index) || index < 0 || index >= parent.length) throw new Error('Invalid status patch index')
        parent.splice(index, 1)
      } else if (operation.value === undefined) {
        throw new Error('Missing status patch value')
      } else if (key === '-') {
        parent.push(operation.value)
      } else {
        const index = Number(key)
        if (!Number.isInteger(index) || index < 0 || index > parent.length) throw new Error('Invalid status patch index')
        if (operation.op === 'add') parent.splice(index, 0, operation.value)
        else if (index < parent.length) parent[index] = operation.value
        else throw new Error('Invalid status patch index')
      }
    } else if (parent && typeof parent === 'object') {
      const object = parent as Record<string, unknown>
      if (operation.op === 'remove') delete object[key]
      else if (operation.value === undefined) throw new Error('Missing status patch value')
      else object[key] = operation.value
    } else {
      throw new Error('Invalid status patch parent')
    }
  }
  return root
}

export function applyStatusPatch(status: OneKVMStatus, operations: StatusPatchOperation[]) {
  const next = patchValue(cloneStatus(status), operations)
  if (!next || typeof next !== 'object' || Array.isArray(next)) throw new Error('Invalid patched status')
  return next as OneKVMStatus
}

class StatusEvents {
  private source: EventSource | null = null
  private retryTimer: ReturnType<typeof setTimeout> | undefined
  private current: OneKVMStatus | null = null
  private receivedAt = 0
  private readonly listeners = new Map<StatusListener, ErrorListener | undefined>()
  private readonly waiters = new Set<StatusWaiter>()

  subscribe(listener: StatusListener, onError?: ErrorListener) {
    this.listeners.set(listener, onError)
    this.start()
    if (this.current) listener(this.current)
    return () => {
      this.listeners.delete(listener)
      this.closeIfUnused()
    }
  }

  waitForStatus() {
    if (this.current) return Promise.resolve(this.current)
    this.start()
    return new Promise<OneKVMStatus>((resolve, reject) => {
      this.waiters.add({ resolve, reject })
    })
  }

  currentUptime() {
    return this.current
      ? this.current.uptime_seconds + Math.max(0, Math.floor((Date.now() - this.receivedAt) / 1000))
      : null
  }

  reconnect() {
    clearTimeout(this.retryTimer)
    this.retryTimer = undefined
    const source = this.source
    this.source = null
    source?.close()
    this.current = null
    if (this.listeners.size || this.waiters.size) this.start()
  }

  private start() {
    if (this.source || this.retryTimer !== undefined) return
    const source = new EventSource(api.getStatusEventsURL(), {
      withCredentials: import.meta.env.VITE_WITH_CREDENTIALS !== 'false',
    })
    this.source = source
    source.addEventListener('status', (event) => {
      if (this.source !== source) return
      let status: OneKVMStatus
      try {
        status = JSON.parse((event as MessageEvent<string>).data) as OneKVMStatus
        if (!status || typeof status !== 'object' || Array.isArray(status)) throw new Error('Invalid status snapshot')
      } catch {
        this.recover(source, new Error('Invalid status event'))
        return
      }
      this.publish(status)
    })
    source.addEventListener('status.patch', (event) => {
      if (this.source !== source) return
      if (!this.current) {
        this.recover(source, new Error('Status patch received without a snapshot'))
        return
      }
      let status: OneKVMStatus
      try {
        const operations = JSON.parse((event as MessageEvent<string>).data) as StatusPatchOperation[]
        if (!Array.isArray(operations)) throw new Error('Status patch is not an array')
        status = applyStatusPatch(this.current, operations)
      } catch {
        this.recover(source, new Error('Invalid status patch'))
        return
      }
      this.publish(status)
    })
    source.onerror = () => {
      this.recover(source, new Error('Status event stream disconnected'))
    }
  }

  private recover(source: EventSource, error: Error) {
    if (this.source !== source) return
    this.source = null
    source.close()
    // Patches are relative to this stream's previous snapshot. After an
    // error, open a new stream to obtain a full snapshot before applying more.
    if (this.listeners.size) {
      this.retryTimer = setTimeout(() => {
        this.retryTimer = undefined
        this.start()
      }, 1000)
    }
    this.reportError(error)
  }

  private publish(status: OneKVMStatus) {
    this.current = status
    this.receivedAt = Date.now()
    for (const waiter of this.waiters) waiter.resolve(status)
    this.waiters.clear()
    for (const listener of this.listeners.keys()) listener(status)
  }

  private reportError(error: Error) {
    this.current = null
    for (const waiter of this.waiters) waiter.reject(error)
    this.waiters.clear()
    for (const onError of this.listeners.values()) onError?.()
  }

  private closeIfUnused() {
    if (this.listeners.size || this.waiters.size) return
    clearTimeout(this.retryTimer)
    this.retryTimer = undefined
    const source = this.source
    this.source = null
    source?.close()
    this.current = null
  }
}

export const statusEvents = new StatusEvents()
