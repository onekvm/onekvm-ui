import { onBeforeUnmount, onMounted, type Ref } from 'vue'

import {
  fpsFromFrameDelta,
  playbackFrameCount,
  videoFrameCallbackStalled,
} from '@/lib/video-fps'

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

  const armFrameCallback = (element: HTMLVideoElement) => {
    if (callbackId) element.cancelVideoFrameCallback(callbackId)
    callbackId = element.requestVideoFrameCallback(framePresented)
  }

  const currentFrameCount = () => playbackFrameCount(video.value, presentedFrames)

  const sample = () => {
    const now = performance.now()
    const element = video.value
    const frames = currentFrameCount()
    const elapsed = now - previousSample
    const stalled = usesFrameCallback && videoFrameCallbackStalled(lastFrame, now)
    update(fpsFromFrameDelta(frames, previousFrames, elapsed))
    previousFrames = frames
    previousSample = now
    if (stalled && element && usesFrameCallback) armFrameCallback(element)
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
    if (element && usesFrameCallback) armFrameCallback(element)
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
