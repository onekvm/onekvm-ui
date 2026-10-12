import { onScopeDispose, readonly, shallowRef, type Ref } from 'vue'

export function useVideoPlaybackState(video: Ref<HTMLVideoElement | null>) {
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
      if (video.value && video.value.readyState < 3) playing.value = false
    }, 600)
  }
  const reset = () => {
    cancelWaiting()
    playing.value = false
    hasFrame.value = false
  }
  onScopeDispose(cancelWaiting)
  return { playing: readonly(playing), hasFrame: readonly(hasFrame), onPlaying, onWaiting, reset }
}
