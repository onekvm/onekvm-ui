import JMuxer from 'jmuxer'

import probeURL from '@/assets/video/h265-main-l5.h265?url'

// Exercise the same Annex B → JMuxer → MSE → video decoder path as the live
// WebSocket player. An advertised HEVC MIME type is not sufficient on Edge.
export async function probeH265WebSocketVideoSupport(timeoutMs = 4000): Promise<boolean> {
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  const abort = new AbortController()
  let muxer: JMuxer | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let feedTimer: ReturnType<typeof setInterval> | undefined
  let finish!: (supported: boolean) => void
  const result = new Promise<boolean>((resolve) => { finish = resolve })
  const decoded = () => finish(video.readyState >= 2 && video.videoWidth > 0)
  const failed = () => finish(false)
  video.addEventListener('loadeddata', decoded)
  video.addEventListener('error', failed)
  timer = setTimeout(failed, timeoutMs)

  // Run setup separately so the timeout also bounds fetch/sourceopen. Abort
  // before cleanup prevents a late fetch from allocating another muxer.
  void (async () => {
    const response = await fetch(probeURL, { signal: abort.signal })
    if (!response.ok) throw new Error('H.265 probe sample unavailable')
    const sample = new Uint8Array(await response.arrayBuffer())
    if (abort.signal.aborted) return
    const feed = () => {
      if (abort.signal.aborted) return
      try {
        muxer?.feed({ video: sample, duration: 50, isLastVideoFrameComplete: true } as JMuxer.Feeder)
        void video.play().catch(failed)
      } catch { failed() }
    }
    const options = {
      node: video,
      mode: 'video' as const,
      videoCodec: 'H265',
      flushingTime: 0,
      clearBuffer: true,
      onReady: () => {
        if (abort.signal.aborted) return
        // Live flushingTime=0 appends queued fragments on the next feed.
        // Continue feeding until the decoder produces data, just as the
        // socket does; one feed can leave only the init segment appended.
        feed()
        feedTimer = setInterval(feed, 50)
      },
      onError: failed,
      onUnsupportedCodec: failed,
    }
    muxer = new JMuxer(options)
  })().catch(failed)

  try {
    return await result
  } finally {
    clearTimeout(timer)
    clearInterval(feedTimer)
    abort.abort()
    video.removeEventListener('loadeddata', decoded)
    video.removeEventListener('error', failed)
    muxer?.destroy()
    video.pause()
    video.removeAttribute('src')
    video.load()
  }
}
