import { onBeforeUnmount, onMounted, ref, toValue, type MaybeRefOrGetter } from 'vue'

import {
  STREAM_SAMPLE_MS,
  pushStreamSample,
  type StreamSample,
} from '@/lib/video-stream-chart'

export function useVideoStreamHistory(
  fps: MaybeRefOrGetter<number>,
  bitrate: MaybeRefOrGetter<number>,
) {
  const samples = ref<StreamSample[]>([])
  let timer = 0

  const take = () => {
    const nextFps = Number(toValue(fps))
    const nextBitrate = Number(toValue(bitrate))
    samples.value = pushStreamSample(samples.value, {
      t: Date.now(),
      fps: Number.isFinite(nextFps) ? Math.max(0, nextFps) : 0,
      bitrate: Number.isFinite(nextBitrate) ? Math.max(0, nextBitrate) : 0,
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
