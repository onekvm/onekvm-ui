export interface ConsoleFrame {
  readonly blob: Blob
  readonly width: number
  readonly height: number
}

type FrameProvider = () => Promise<ConsoleFrame>
let provider: FrameProvider | undefined
let selectionTarget: (() => HTMLElement | null) | undefined

/** The mounted console owns its media elements; extensions never query the DOM. */
export function registerConsoleFrameProvider(value: FrameProvider, target?: () => HTMLElement | null): () => void {
  provider = value
  selectionTarget = target
  return () => { if (provider === value) { provider = undefined; selectionTarget = undefined } }
}

export async function captureConsoleFrame(): Promise<ConsoleFrame> {
  const current = provider
  if (!current) throw new Error('CONSOLE_FRAME_UNAVAILABLE')
  const frame = await current()
  if (current !== provider) throw new Error('CONSOLE_FRAME_UNAVAILABLE')
  return frame
}

/** Capture native pixels, independent of the console's CSS fit, zoom or rotation. */
export function encodeConsoleFrame(source: HTMLVideoElement | HTMLCanvasElement): Promise<ConsoleFrame> {
  const width = source instanceof HTMLVideoElement ? source.videoWidth : source.width
  const height = source instanceof HTMLVideoElement ? source.videoHeight : source.height
  if (!width || !height || (source instanceof HTMLVideoElement && source.readyState < 2)) {
    return Promise.reject(new Error('CONSOLE_FRAME_UNAVAILABLE'))
  }
  const target = document.createElement('canvas')
  target.width = width
  target.height = height
  const context = target.getContext('2d', { alpha: false })
  if (!context) return Promise.reject(new Error('CONSOLE_FRAME_UNAVAILABLE'))
  context.drawImage(source, 0, 0)
  return new Promise((resolve, reject) => target.toBlob(blob => {
    if (blob) resolve({ blob, width, height })
    else reject(new Error('CONSOLE_FRAME_UNAVAILABLE'))
  }, 'image/png'))
}

/** A scoped overlay stays below the console toolbar, including in fullscreen. */
export async function captureConsoleSelectionFrame() {
  const current = provider
  const target = selectionTarget?.()
  if (!target?.isConnected) throw new Error('CONSOLE_FRAME_UNAVAILABLE')
  const frame = await captureConsoleFrame()
  if (current !== provider || target !== selectionTarget?.() || !target.isConnected) throw new Error('CONSOLE_FRAME_UNAVAILABLE')
  return { frame, target }
}
