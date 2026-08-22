import { onBeforeUnmount, onMounted, ref, toValue, type MaybeRefOrGetter } from 'vue'

import {
  STREAM_SAMPLE_MS,
  latencyMs,
  pushStreamSample,
  type LatencySample,
} from '@/lib/video-stream-chart'

export function useLatencyHistory(values: MaybeRefOrGetter<{
  capture: number
  encode: number
  ice: number
  jitter: number
  decode: number
  present: number
}>) {
  const samples = ref<LatencySample[]>([])
  let timer = 0

  const take = () => {
    const next = toValue(values)
    samples.value = pushStreamSample(samples.value, {
      t: Date.now(),
      capture: latencyMs(next.capture),
      encode: latencyMs(next.encode),
      ice: latencyMs(next.ice),
      jitter: latencyMs(next.jitter),
      decode: latencyMs(next.decode),
      present: latencyMs(next.present),
    })
  }

  onMounted(() => {
    take()
    timer = window.setInterval(take, STREAM_SAMPLE_MS)
  })

  onBeforeUnmount(() => {
    window.clearInterval(timer)
  })

  return { samples }
}
