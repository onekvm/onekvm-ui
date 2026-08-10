import { api, type OneKVMStatus } from '@/api/client'

type StatusListener = (status: OneKVMStatus) => void
type ErrorListener = () => void
type StatusWaiter = {
  resolve: (status: OneKVMStatus) => void
  reject: (error: Error) => void
}

class StatusEvents {
  private source: EventSource | null = null
  private current: OneKVMStatus | null = null
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

  private start() {
    if (this.source) return
    const source = new EventSource(api.getStatusEventsURL(), {
      withCredentials: import.meta.env.VITE_WITH_CREDENTIALS !== 'false',
    })
    this.source = source
    source.addEventListener('status', (event) => {
      if (this.source !== source) return
      try {
        const status = JSON.parse((event as MessageEvent<string>).data) as OneKVMStatus
        this.current = status
        for (const waiter of this.waiters) waiter.resolve(status)
        this.waiters.clear()
        for (const listener of this.listeners.keys()) listener(status)
      } catch {
        this.reportError(new Error('Invalid status event'))
      }
    })
    source.onerror = () => {
      if (this.source === source) this.reportError(new Error('Status event stream disconnected'))
    }
  }

  private reportError(error: Error) {
    this.current = null
    for (const waiter of this.waiters) waiter.reject(error)
    this.waiters.clear()
    for (const onError of this.listeners.values()) onError?.()
  }

  private closeIfUnused() {
    if (this.listeners.size || this.waiters.size) return
    this.source?.close()
    this.source = null
    this.current = null
  }
}

export const statusEvents = new StatusEvents()
