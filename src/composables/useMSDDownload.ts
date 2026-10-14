import { onBeforeUnmount, onMounted, readonly, shallowRef } from 'vue'

import { api, type MSDDownloadTask } from '@/api/client'
import { createDownloadObserver } from '@/lib/msd-download-observer'

const storageKey = 'onekvm-msd-download'

export function useMSDDownload(options: { onUpdate: (task: MSDDownloadTask, attached: boolean) => void }) {
  const task = shallowRef<MSDDownloadTask | null>(null)
  const reconnecting = shallowRef(false)
  let rememberedID = ''
  try { rememberedID = localStorage.getItem(storageKey) || '' } catch { /* Storage is optional. */ }

  const observer = createDownloadObserver({
    load: signal => api.getMSDDownloads(signal),
    start: (url, name) => api.startMSDDownload(url, name),
    cancel: id => api.cancelMSDDownload(id),
    rememberedID,
    remember(id) {
      try {
        if (id) localStorage.setItem(storageKey, id)
        else localStorage.removeItem(storageKey)
      } catch { /* Device discovery still works without storage. */ }
    },
    update(next, attached) {
      task.value = next
      options.onUpdate(next, attached)
    },
    reconnecting(value) { reconnecting.value = value },
  })

  function discover() { void observer.discover() }
  function onVisible() { if (document.visibilityState === 'visible') discover() }
  onMounted(() => {
    discover()
    window.addEventListener('online', discover)
    document.addEventListener('visibilitychange', onVisible)
  })
  onBeforeUnmount(() => {
    observer.dispose()
    window.removeEventListener('online', discover)
    document.removeEventListener('visibilitychange', onVisible)
  })

  return { task: readonly(task), reconnecting: readonly(reconnecting), start: observer.start, cancel: observer.cancel, discover }
}
