import { computed, readonly, shallowRef } from 'vue'

import { nextUploadSpeed, uploadPercentage, uploadRemainingSeconds } from '@/lib/upload-speed'

export function useUploadProgress() {
  const name = shallowRef('')
  const transferred = shallowRef(0)
  const total = shallowRef(0)
  const speed = shallowRef(0)
  const controller = shallowRef<AbortController | null>(null)
  let sampleAt = 0
  let sampleBytes = 0

  const uploading = computed(() => controller.value !== null)
  const percentage = computed(() => uploadPercentage(transferred.value, total.value))
  const remainingSeconds = computed(() => uploadRemainingSeconds(
    total.value,
    transferred.value,
    speed.value,
    uploading.value,
  ))

  function begin(fileName: string, size: number) {
    const next = new AbortController()
    controller.value = next
    name.value = fileName
    transferred.value = 0
    total.value = size
    speed.value = 0
    sampleAt = performance.now()
    sampleBytes = 0
    return next
  }

  function progress(loaded: number, size: number) {
    transferred.value = loaded
    if (size > 0) total.value = size
    const now = performance.now()
    const sampled = nextUploadSpeed(speed.value, loaded, sampleBytes, now - sampleAt)
    if (sampled === null) return
    speed.value = sampled
    sampleAt = now
    sampleBytes = loaded
  }

  function finish(active?: AbortController) {
    if (!active || controller.value === active) controller.value = null
  }

  function cancel() {
    controller.value?.abort()
  }

  return {
    name: readonly(name),
    transferred: readonly(transferred),
    total: readonly(total),
    speed: readonly(speed),
    percentage,
    remainingSeconds,
    uploading,
    begin,
    progress,
    finish,
    cancel,
  }
}
