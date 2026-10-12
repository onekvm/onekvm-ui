import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'

type PiPVideo = HTMLVideoElement & {
  webkitPresentationMode?: string
  webkitSupportsPresentationMode?: (mode: string) => boolean
  webkitSetPresentationMode?: (mode: string) => void
}

export function usePictureInPicture(videoMode: () => string) {
  const active = shallowRef(false)
  const busy = shallowRef(false)
  let canvasVideo: HTMLVideoElement | null = null
  let canvasStream: MediaStream | null = null
  let sourceGeneration = 0
  let disposed = false
  const sourceVideo = () => document.querySelector<PiPVideo>('video#screen')
  const supported = computed(() => {
    const native = document.pictureInPictureEnabled && typeof HTMLVideoElement.prototype.requestPictureInPicture === 'function'
    const prototype = HTMLVideoElement.prototype as PiPVideo
    const safari = typeof prototype.webkitSupportsPresentationMode === 'function' && typeof prototype.webkitSetPresentationMode === 'function'
    return Boolean((native || safari) && (videoMode() !== 'mjpeg' || typeof HTMLCanvasElement.prototype.captureStream === 'function'))
  })

  function releaseCanvas() {
    canvasStream?.getTracks().forEach((track) => track.stop())
    canvasStream = null
    canvasVideo?.remove()
    canvasVideo = null
  }

  function sync() {
    const video = sourceVideo()
    const pip = document.pictureInPictureElement
    const canvasInPiP = (canvasVideo as PiPVideo | null)?.webkitPresentationMode === 'picture-in-picture'
    active.value = Boolean((pip && (pip === video || pip === canvasVideo)) || video?.webkitPresentationMode === 'picture-in-picture' || canvasInPiP)
    if (canvasVideo && pip !== canvasVideo && !canvasInPiP && !busy.value) releaseCanvas()
  }

  async function exit() {
    const pip = document.pictureInPictureElement
    if (pip && (pip === sourceVideo() || pip === canvasVideo)) {
      await document.exitPictureInPicture()
    }
    const video = sourceVideo()
    if (video?.webkitPresentationMode === 'picture-in-picture') video.webkitSetPresentationMode?.('inline')
    const captured = canvasVideo as PiPVideo | null
    if (captured?.webkitPresentationMode === 'picture-in-picture') captured.webkitSetPresentationMode?.('inline')
    releaseCanvas()
    sync()
  }

  async function toggle() {
    if (busy.value || disposed) return
    const generation = sourceGeneration
    busy.value = true
    try {
      sync()
      if (active.value) {
        await exit()
        return
      }
      let video = sourceVideo()
      if (videoMode() === 'mjpeg') {
        const canvas = document.querySelector<HTMLCanvasElement>('#screen-mjpeg')
        if (!canvas?.width || !canvas.height) throw new Error('Video is not ready')
        releaseCanvas()
        canvasStream = canvas.captureStream(60)
        canvasVideo = document.createElement('video')
        canvasVideo.hidden = true
        canvasVideo.muted = true
        canvasVideo.playsInline = true
        canvasVideo.srcObject = canvasStream
        document.body.append(canvasVideo)
        video = canvasVideo
        await video.play()
      }
      if (disposed || generation !== sourceGeneration) {
        releaseCanvas()
        return
      }
      if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth) throw new Error('Video is not ready')
      if (document.pictureInPictureEnabled && video.requestPictureInPicture) {
        await video.requestPictureInPicture()
      } else if (video.webkitSupportsPresentationMode?.('picture-in-picture')) {
        video.webkitSetPresentationMode?.('picture-in-picture')
      } else {
        throw new Error('Picture-in-picture is unavailable')
      }
      if (disposed || generation !== sourceGeneration) {
        if (document.pictureInPictureElement === video) await document.exitPictureInPicture()
        if (video.webkitPresentationMode === 'picture-in-picture') video.webkitSetPresentationMode?.('inline')
        releaseCanvas()
      }
    } catch (error) {
      releaseCanvas()
      throw error
    } finally {
      busy.value = false
      sync()
    }
  }

  watch(videoMode, () => {
    sourceGeneration += 1
    void exit().catch(() => releaseCanvas())
  })
  onMounted(() => {
    document.addEventListener('enterpictureinpicture', sync, true)
    document.addEventListener('leavepictureinpicture', sync, true)
    document.addEventListener('webkitpresentationmodechanged', sync, true)
    sync()
  })
  onBeforeUnmount(() => {
    disposed = true
    sourceGeneration += 1
    document.removeEventListener('enterpictureinpicture', sync, true)
    document.removeEventListener('leavepictureinpicture', sync, true)
    document.removeEventListener('webkitpresentationmodechanged', sync, true)
    void exit().catch(() => releaseCanvas())
  })

  return { active, busy, supported, toggle }
}
