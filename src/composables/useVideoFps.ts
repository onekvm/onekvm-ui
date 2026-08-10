import { onBeforeUnmount, onMounted, type Ref } from 'vue'

export function useVideoFps(video: Ref<HTMLVideoElement | null>, update: (fps: number) => void) {
  let callbackId = 0
  let sampleTimer = 0
  let presentedFrames = 0
  let previousFrames = 0
  let previousSample = 0
  let lastFrame = 0
  let usesFrameCallback = false

  const framePresented: VideoFrameRequestCallback = (now) => {
    const element = video.value
    if (!element) return
    presentedFrames += 1
    lastFrame = now
    callbackId = element.requestVideoFrameCallback(framePresented)
  }

  const currentFrameCount = () => {
    const element = video.value
    if (!element) return 0
    if (usesFrameCallback) return presentedFrames
    return element.getVideoPlaybackQuality?.().totalVideoFrames ?? 0
  }

  const sample = () => {
    const now = performance.now()
    const frames = currentFrameCount()
    const elapsed = now - previousSample
    const stalled = usesFrameCallback && (!lastFrame || now - lastFrame > 1_500)
    const fps = elapsed > 0 && !stalled
      ? Math.max(0, Math.round(((frames - previousFrames) * 1_000) / elapsed))
      : 0

    previousFrames = frames
    previousSample = now
    update(fps)
  }

  onMounted(() => {
    const element = video.value
    previousSample = performance.now()
    usesFrameCallback = Boolean(element?.requestVideoFrameCallback)
    if (element && usesFrameCallback) callbackId = element.requestVideoFrameCallback(framePresented)
    sampleTimer = window.setInterval(sample, 1_000)
  })

  onBeforeUnmount(() => {
    const element = video.value
    if (element && callbackId) element.cancelVideoFrameCallback(callbackId)
    window.clearInterval(sampleTimer)
    update(0)
  })
}
