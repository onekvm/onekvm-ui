import { shallowRef, watch, type Ref } from 'vue'
import { api, type StorageStatus } from '@/api/client'

/** Storage inventory follows kernel device/mount events only while its pane is visible. */
export function useStorageStatus(active: Readonly<Ref<boolean>>) {
  const status = shallowRef<StorageStatus | null>(null)
  const error = shallowRef('')
  watch(active, (enabled, _previous, onCleanup) => {
    if (!enabled) return
    error.value = ''
    const source = new EventSource(api.getStorageStatusEventsURL(), {
      withCredentials: import.meta.env.VITE_WITH_CREDENTIALS !== 'false',
    })
    source.addEventListener('storage', (event) => {
      try {
        status.value = JSON.parse((event as MessageEvent<string>).data) as StorageStatus
        error.value = ''
      } catch {
        error.value = 'Invalid storage status'
      }
    })
    source.onerror = () => { error.value = 'Storage status disconnected' }
    onCleanup(() => source.close())
  }, { immediate: true })
  return { status, error }
}
