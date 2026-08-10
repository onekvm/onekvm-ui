import { onBeforeUnmount, onMounted, watch, type Ref } from 'vue'

const headerSeparator = Uint8Array.of(13, 10, 13, 10)

function indexOfBytes(buffer: Uint8Array, needle: Uint8Array, from: number, to: number) {
  outer: for (let offset = from; offset <= to - needle.length; offset += 1) {
    for (let index = 0; index < needle.length; index += 1) {
      if (buffer[offset + index] !== needle[index]) continue outer
    }
    return offset
  }
  return -1
}

interface MJPEGStreamCallbacks {
  frame: (source: CanvasImageSource, width: number, height: number) => void
  fps: (value: number) => void
  bitrate: (value: number) => void
  error: (error: Error) => void
}

// Fetching and parsing the multipart stream makes every decoded JPEG visible
// to the UI. A plain <img src="multipart-stream"> only fires load once, so it
// cannot provide a real presented-frame FPS measurement.
export function useMJPEGStream(
  enabled: Readonly<Ref<boolean>>,
  streamURL: Readonly<Ref<string>>,
  callbacks: MJPEGStreamCallbacks,
) {
  let controller: AbortController | undefined
  let queuedFrame: Uint8Array | undefined
  let decoding = false
  let generation = 0
  let mounted = false
  let presentedFrames = 0
  let previousFrames = 0
  let receivedBytes = 0
  let previousBytes = 0
  let previousSample = 0
  let lastFrame = 0
  let sampleTimer = 0

  const decodeFrame = async (frame: Uint8Array) => {
    const blob = new Blob([frame], { type: 'image/jpeg' })
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(blob)
      return {
        source: bitmap as CanvasImageSource,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      }
    }

    const objectURL = URL.createObjectURL(blob)
    const image = new Image()
    try {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () => reject(new Error('Unable to decode MJPEG frame'))
        image.src = objectURL
      })
      return {
        source: image as CanvasImageSource,
        width: image.naturalWidth,
        height: image.naturalHeight,
        release: () => URL.revokeObjectURL(objectURL),
      }
    } catch (error) {
      URL.revokeObjectURL(objectURL)
      throw error
    }
  }

  const showFrame = async (frame: Uint8Array, activeGeneration: number) => {
    decoding = true
    let decoded: Awaited<ReturnType<typeof decodeFrame>> | undefined
    try {
      decoded = await decodeFrame(frame)
      if (!mounted || !enabled.value || generation !== activeGeneration) return
      callbacks.frame(decoded.source, decoded.width, decoded.height)
      presentedFrames += 1
      lastFrame = performance.now()
    } catch (error) {
      if (generation === activeGeneration && !controller?.signal.aborted) {
        controller?.abort()
        callbacks.error(error instanceof Error ? error : new Error(String(error)))
      }
    } finally {
      decoded?.release()
      if (generation !== activeGeneration) return
      decoding = false
      const next = queuedFrame
      queuedFrame = undefined
      if (next && !controller?.signal.aborted) void showFrame(next, activeGeneration)
    }
  }

  const acceptFrame = (frame: Uint8Array) => {
    receivedBytes += frame.byteLength
    if (decoding) {
      // Keep latency bounded: when decoding is slower than the stream, retain
      // only the newest complete JPEG instead of building a stale frame queue.
      queuedFrame = frame
      return
    }
    void showFrame(frame, generation)
  }

  const stop = () => {
    generation += 1
    controller?.abort()
    controller = undefined
    queuedFrame = undefined
    decoding = false
  }

  const readStream = async (signal: AbortSignal) => {
    const response = await fetch(streamURL.value, {
      cache: 'no-store',
      credentials: 'same-origin',
      signal,
    })
    if (!response.ok || !response.body) {
      throw new Error(`MJPEG stream returned HTTP ${response.status}`)
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder('ascii')
    const maxFrameSize = 4 * 1024 * 1024
    // Reuse one receive buffer. The old implementation concatenated and
    // sliced the complete pending stream for every TCP chunk, producing
    // hundreds of MB/s of short-lived allocations at 1080p60 and periodic GC
    // stalls even when network throughput was only 10-20 Mbps.
    const buffer = new Uint8Array(maxFrameSize + 64 * 1024)
    let start = 0
    let end = 0

    while (!signal.aborted) {
      const { done, value } = await reader.read()
      if (done) throw new Error('MJPEG stream closed')
      if (value.byteLength > buffer.length - (end - start)) {
        throw new Error('MJPEG receive buffer overflow')
      }
      if (end + value.byteLength > buffer.length) {
        buffer.copyWithin(0, start, end)
        end -= start
        start = 0
      }
      buffer.set(value, end)
      end += value.byteLength

      for (;;) {
        const headerEnd = indexOfBytes(buffer, headerSeparator, start, end)
        if (headerEnd < 0) {
          if (end - start > 16 * 1024) throw new Error('Invalid MJPEG multipart header')
          break
        }
        const header = decoder.decode(buffer.subarray(start, headerEnd))
        const lengthMatch = /content-length:\s*(\d+)/i.exec(header)
        if (!lengthMatch) throw new Error('MJPEG frame has no Content-Length')
        const length = Number(lengthMatch[1])
        if (!Number.isSafeInteger(length) || length <= 0 || length > maxFrameSize) {
          throw new Error(`Invalid MJPEG frame length ${length}`)
        }
        const payloadStart = headerEnd + headerSeparator.length
        const payloadEnd = payloadStart + length
        if (end < payloadEnd) break
        acceptFrame(buffer.slice(payloadStart, payloadEnd))
        let next = payloadEnd
        if (next + 1 < end && buffer[next] === 13 && buffer[next + 1] === 10) next += 2
        start = next
        if (start === end) {
          start = 0
          end = 0
          break
        }
      }
    }
  }

  const start = () => {
    stop()
    presentedFrames = 0
    previousFrames = 0
    receivedBytes = 0
    previousBytes = 0
    previousSample = performance.now()
    lastFrame = 0
    callbacks.fps(0)
    callbacks.bitrate(0)
    if (!mounted || !enabled.value) return
    controller = new AbortController()
    void readStream(controller.signal).catch((error: unknown) => {
      if (controller?.signal.aborted) return
      callbacks.error(error instanceof Error ? error : new Error(String(error)))
    })
  }

  const sample = () => {
    if (!enabled.value) return
    const now = performance.now()
    const elapsed = now - previousSample
    const stalled = !lastFrame || now - lastFrame > 1_500
    const fps = elapsed > 0 && !stalled
      ? Math.max(0, Math.round(((presentedFrames - previousFrames) * 1_000) / elapsed))
      : 0
    const bitrate = elapsed > 0
      ? Math.max(0, Math.round(((receivedBytes - previousBytes) * 8) / elapsed))
      : 0
    previousFrames = presentedFrames
    previousBytes = receivedBytes
    previousSample = now
    callbacks.fps(fps)
    callbacks.bitrate(bitrate)
  }

  watch([enabled, streamURL], start, { flush: 'post' })
  onMounted(() => {
    mounted = true
    sampleTimer = window.setInterval(sample, 1_000)
    start()
  })
  onBeforeUnmount(() => {
    mounted = false
    window.clearInterval(sampleTimer)
    stop()
  })

  return { restart: start }
}
