import { onBeforeUnmount, onMounted, type Ref } from 'vue'

export function useVideoFps(
  video: Ref<HTMLVideoElement | null>,
  update: (fps: number) => void,
  updatePresent?: (presentUs: number) => void,
  presentEnabled?: Ref<boolean>,
) {
  let callbackId = 0
  let sampleTimer = 0
  let presentedFrames = 0
  let previousFrames = 0
  let previousSample = 0
  let lastFrame = 0
  let usesFrameCallback = false
  let presentSumUs = 0
  let presentSamples = 0

  const framePresented: VideoFrameRequestCallback = (now, metadata) => {
    const element = video.value
    if (!element) return
    presentedFrames += 1
    lastFrame = now
    const receive = metadata.receiveTime
    const display = metadata.expectedDisplayTime
    if (presentEnabled && !presentEnabled.value) {
      presentSumUs = 0
      presentSamples = 0
    } else if (receive != null && display > receive) {
      const presentUs = (display - receive) * 1000
      if (presentUs > 0 && presentUs < 1_000_000) {
        presentSumUs += presentUs
        presentSamples += 1
      }
    }
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
    if (!updatePresent) return
    if (presentEnabled && !presentEnabled.value) {
      presentSumUs = 0
      presentSamples = 0
      updatePresent(0)
      return
    }
    const presentUs = presentSamples > 0 ? Math.round(presentSumUs / presentSamples) : 0
    presentSumUs = 0
    presentSamples = 0
    updatePresent(stalled ? 0 : presentUs)
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
    updatePresent?.(0)
  })
}
