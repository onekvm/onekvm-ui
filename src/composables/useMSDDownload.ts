import { onBeforeUnmount, onMounted, readonly, shallowRef } from 'vue'

import { api, type MSDDownloadTask } from '@/api/client'

const storageKey = 'onekvm-msd-download'
const active = (task: MSDDownloadTask) => task.state === 'running' || task.state === 'cancelling'

// Observing a task and owning it are separate: teardown only stops polling.
export function useMSDDownload(options: { onUpdate: (task: MSDDownloadTask, attached: boolean) => void }) {
  const task = shallowRef<MSDDownloadTask | null>(null)
  const reconnecting = shallowRef(false)
  let disposed = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let observer: AbortController | undefined
  let rememberedID = ''
  let revision = 0
  let mutating = false
  try { rememberedID = localStorage.getItem(storageKey) || '' } catch { /* Storage is optional. */ }

  function remember(id: string) {
    rememberedID = id
    try {
      if (id) localStorage.setItem(storageKey, id)
      else localStorage.removeItem(storageKey)
    } catch { /* Device discovery still works without storage. */ }
  }

  function update(next: MSDDownloadTask) {
    if (disposed) return
    const attached = task.value?.id !== next.id
    task.value = next
    remember(active(next) ? next.id : '')
    options.onUpdate(next, attached)
  }

  async function poll() {
    const observedRevision = revision
    observer = new AbortController()
    try {
      const tasks = await api.getMSDDownloads(observer.signal)
      if (disposed || mutating || observedRevision !== revision) return
      reconnecting.value = false
      const currentID = task.value && active(task.value) ? task.value.id : rememberedID
      const next = tasks.find((item) => item.id === currentID) || tasks.find(active)
      if (next) update(next)
      else {
        remember('')
        // Core restarted: the in-memory task no longer exists.
        if (task.value && active(task.value)) {
          update({ ...task.value, state: 'failed', error: 'ISO download task no longer exists' })
        }
      }
    } catch {
      if (!disposed) reconnecting.value = Boolean(task.value && active(task.value))
    } finally {
      if (!disposed) timer = setTimeout(poll, task.value && active(task.value) ? 1000 : 5000)
    }
  }

  async function start(url: string, name: string) {
    mutating = true
    revision += 1
    try {
      const next = await api.startMSDDownload(url, name)
      remember(next.id)
      update(next)
    } finally {
      revision += 1
      mutating = false
    }
  }

  async function cancel() {
    if (!task.value || !active(task.value)) return
    mutating = true
    revision += 1
    try {
      update(await api.cancelMSDDownload(task.value.id))
    } finally {
      revision += 1
      mutating = false
    }
  }

  onMounted(poll)
  onBeforeUnmount(() => {
    disposed = true
    clearTimeout(timer)
    observer?.abort()
  })

  return { task: readonly(task), reconnecting: readonly(reconnecting), start, cancel }
}
