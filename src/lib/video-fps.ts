export function playbackFrameCount(
  element: { getVideoPlaybackQuality?: () => { totalVideoFrames: number } } | null,
  presentedFrames: number,
): number {
  const decoded = element?.getVideoPlaybackQuality?.().totalVideoFrames
  if (typeof decoded === 'number' && Number.isFinite(decoded) && decoded >= presentedFrames)
    return decoded
  return presentedFrames
}

export function fpsFromFrameDelta(frames: number, previousFrames: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0
  return Math.max(0, Math.round(((frames - previousFrames) * 1000) / elapsedMs))
}

export function videoFrameCallbackStalled(lastFrame: number, now: number, limitMs = 1500): boolean {
  return !lastFrame || now - lastFrame > limitMs
}
