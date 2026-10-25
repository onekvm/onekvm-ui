import { onBeforeUnmount, shallowRef, watch, type Ref } from 'vue'
import { api, type SystemOnlineUpdateProgress, type SystemUpdateStatus } from '@/api/client'

const activePhases = new Set(['uploading', 'downloading', 'checking', 'installing'])

/** Reattach to the server's update when a settings page is opened or refreshed. */
export function useSystemUpdateMonitor(
  active: Readonly<Ref<boolean>>,
  onComplete: (error: string) => void,
) {
  const status = shallowRef<SystemUpdateStatus | null>(null)
  const progress = shallowRef<SystemOnlineUpdateProgress | null>(null)
  const busy = shallowRef(false)
  const started = shallowRef(false)
  const unavailable = shallowRef(false)
  const error = shallowRef('')
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: AbortController | undefined
  let generation = 0
  let idleCount = 0

  function stop() {
    generation += 1
    pending?.abort()
    pending = undefined
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }

  async function refresh() {
    stop()
    if (!active.value) return
    const current = generation
    const wasBusy = busy.value
    pending = new AbortController()
    const signal = AbortSignal.any([pending.signal, AbortSignal.timeout(5000)])
    const [state, transfer] = await Promise.allSettled([
      api.getSystemUpdate(signal),
      api.getSystemOnlineUpdateProgress(signal),
    ])
    if (current !== generation || !active.value) return
    pending = undefined
    error.value = ''
    if (state.status === 'fulfilled') {
      status.value = state.value
      unavailable.value = false
    } else {
      // A timeout or RAUC being busy says nothing about A/B support. Retain
      // the last usable snapshot, then retry instead of removing the panel.
      unavailable.value = status.value === null
      error.value = state.reason instanceof Error ? state.reason.message : String(state.reason)
    }
    if (transfer.status === 'fulfilled') progress.value = transfer.value
    else if (!error.value) error.value = transfer.reason instanceof Error ? transfer.reason.message : String(transfer.reason)

    if (!error.value) {
      const operationBusy = status.value?.operation !== 'idle'
      let phase = progress.value?.phase
      // Older servers do not persist a terminal transfer phase. Only allow
      // this fallback after an accepted install, never during inspection.
      idleCount = phase === 'installing' && !operationBusy ? idleCount + 1 : 0
      if (idleCount >= 3 && progress.value) {
        progress.value = { ...progress.value, phase: status.value?.last_error ? 'error' : 'complete', error: status.value?.last_error || '' }
        phase = progress.value.phase
      }
      busy.value = operationBusy || activePhases.has(phase || '')
      if (busy.value || phase === 'awaiting_packages' || phase === 'complete' || phase === 'error') started.value = true
      if (wasBusy && !busy.value && (phase === 'complete' || phase === 'error')) {
        onComplete(progress.value?.error || status.value?.last_error || '')
      }
    }
    if (busy.value || error.value) timer = setTimeout(() => void refresh(), error.value ? 2500 : 1000)
  }

  async function follow() {
    busy.value = true
    started.value = true
    idleCount = 0
    await refresh()
  }

  watch(active, (enabled) => { if (!enabled) stop() })
  onBeforeUnmount(stop)
  return { status, progress, busy, started, unavailable, error, refresh, follow }
}
