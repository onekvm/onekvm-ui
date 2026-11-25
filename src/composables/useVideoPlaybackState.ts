import { onScopeDispose, readonly, shallowRef, watch, type Ref } from 'vue'

/** A lost HDMI signal reaches the status within about 2.5 s (1.5 s encoder
    grace and a 1 s status sample). A shorter stall keeps the last picture,
    as WebRTC does, instead of flashing a buffering indicator first. */
const STALL_INDICATOR_MS = 3000

export function useVideoPlaybackState(
  video: Ref<HTMLVideoElement | null>,
  signalConnected: () => boolean | null = () => null,
) {
  const playing = shallowRef(false)
  const hasFrame = shallowRef(false)
  let waitingTimer: ReturnType<typeof setTimeout> | undefined
  const cancelWaiting = () => {
    clearTimeout(waitingTimer)
    waitingTimer = undefined
  }
  const onPlaying = () => {
    cancelWaiting()
    hasFrame.value = true
    playing.value = true
  }
  const onWaiting = () => {
    // A live MSE stream may run briefly out of future data. Keep its last
    // picture visible and avoid flashing the initial connection indicator.
    if (!hasFrame.value || !video.value || video.value.readyState >= 3 || waitingTimer !== undefined) return
    waitingTimer = setTimeout(() => {
      waitingTimer = undefined
      // The no-signal still pauses for seconds while the backend rearms the
      // source. It is not a buffering problem: keep the picture.
      if (video.value && video.value.readyState < 3 && signalConnected() !== false) playing.value = false
    }, STALL_INDICATOR_MS)
  }
  // A slow status report can arrive after the indicator appeared; the
  // still that follows is not buffering either.
  const stopSignalWatch = watch(signalConnected, (connected) => {
    if (connected === false && hasFrame.value) onPlaying()
  }, { flush: 'sync' })
  const reset = () => {
    cancelWaiting()
    playing.value = false
    hasFrame.value = false
  }
  onScopeDispose(() => {
    cancelWaiting()
    stopSignalWatch()
  })
  return { playing: readonly(playing), hasFrame: readonly(hasFrame), onPlaying, onWaiting, reset }
}
