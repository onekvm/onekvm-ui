export interface DownloadTask {
  id: string
  state: string
  error?: string | null
}

const active = (task: DownloadTask | null) => task?.state === 'running' || task?.state === 'cancelling'

// The observer never owns the device task: dispose only stops local requests.
export function createDownloadObserver<T extends DownloadTask>(options: {
  load: (signal: AbortSignal) => Promise<T[]>
  start: (url: string, name: string) => Promise<T>
  cancel: (id: string) => Promise<T>
  rememberedID: string
  remember: (id: string) => void
  update: (task: T, attached: boolean) => void
  reconnecting: (value: boolean) => void
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>
  unschedule?: (timer: ReturnType<typeof setTimeout>) => void
}) {
  const schedule = options.schedule ?? setTimeout
  const unschedule = options.unschedule ?? clearTimeout
  let task: T | null = null
  let rememberedID = options.rememberedID
  let disposed = false
  let mutating = false
  let revision = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let observer: AbortController | undefined

  function remember(id: string) {
    rememberedID = id
    options.remember(id)
  }

  function update(next: T) {
    if (disposed) return
    const attached = task?.id !== next.id
    task = next
    remember(active(next) ? next.id : '')
    options.reconnecting(false)
    options.update(next, attached)
  }

  function clearTimer() {
    if (timer !== undefined) unschedule(timer)
    timer = undefined
  }

  function resume() {
    clearTimer()
    if (disposed || mutating || observer || (!active(task) && !rememberedID)) return
    timer = schedule(() => { timer = undefined; void discover() }, active(task) ? 1000 : 5000)
  }

  async function discover() {
    if (disposed || mutating || observer) return
    clearTimer()
    const observedRevision = revision
    const request = new AbortController()
    observer = request
    try {
      const tasks = await options.load(request.signal)
      if (disposed || mutating || observedRevision !== revision) return
      options.reconnecting(false)
      const currentID = active(task) ? task!.id : rememberedID
      const next = tasks.find(item => item.id === currentID) || tasks.find(active)
      if (next) update(next)
      else {
        remember('')
        if (task && active(task)) update({ ...task, state: 'failed', error: 'ISO download task no longer exists' })
      }
    } catch {
      if (!disposed && observedRevision === revision) options.reconnecting(Boolean(active(task) || rememberedID))
    } finally {
      if (observer === request) observer = undefined
      if (observedRevision === revision) resume()
    }
  }

  async function mutate(action: () => Promise<T>) {
    if (disposed || mutating) return
    mutating = true
    revision += 1
    clearTimer()
    observer?.abort()
    observer = undefined
    let failed = false
    try {
      update(await action())
    } catch (error) {
      failed = true
      throw error
    } finally {
      revision += 1
      mutating = false
      resume()
      // A lost POST response may still have created a task on the device.
      if (failed && !active(task) && !rememberedID) void discover()
    }
  }

  return {
    discover,
    start: (url: string, name: string) => mutate(() => options.start(url, name)),
    cancel: async () => {
      if (task && active(task)) {
        const id = task.id
        await mutate(() => options.cancel(id))
      }
    },
    dispose() {
      disposed = true
      revision += 1
      clearTimer()
      observer?.abort()
    },
  }
}
