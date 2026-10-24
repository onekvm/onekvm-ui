import { onBeforeUnmount, onMounted, ref, toValue, type MaybeRefOrGetter } from 'vue'

import {
  STREAM_SAMPLE_MS,
  PacketLossSampler,
  latencyMs,
  pushStreamSample,
  type LatencySample,
} from '@/lib/video-stream-chart'

export function useLatencyHistory(values: MaybeRefOrGetter<{
  packetSource?: string | null
  packetsLost?: number | null
  capture: number
  encode: number
  transport?: number | null
  ice: number
  jitter: number
  decode: number
  present: number
}>) {
  const samples = ref<LatencySample[]>([])
  let timer = 0
  const loss = new PacketLossSampler()

  const take = () => {
    const next = toValue(values)
    samples.value = pushStreamSample(samples.value, {
      t: Date.now(),
      packetsLost: loss.sample(next.packetSource ?? null, next.packetsLost),
      capture: latencyMs(next.capture),
      encode: latencyMs(next.encode),
      transport: next.transport == null ? null : latencyMs(next.transport),
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
