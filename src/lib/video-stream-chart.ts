export type StreamSample = {
  t: number
  fps: number
  bitrate: number
}

export const STREAM_HISTORY_CAPACITY = 60
export const STREAM_SAMPLE_MS = 1_000

export function pushStreamSample(
  samples: readonly StreamSample[],
  sample: StreamSample,
  capacity = STREAM_HISTORY_CAPACITY,
): StreamSample[] {
  if (capacity < 1) return []
  const next = samples.length >= capacity
    ? samples.slice(samples.length - capacity + 1)
    : samples.slice()
  next.push(sample)
  return next
}

export function niceCeiling(value: number, fallback: number): number {
  if (!Number.isFinite(fallback) || fallback <= 0) fallback = 1
  if (!Number.isFinite(value) || value <= 0) return fallback
  const padded = value
  const exp = Math.floor(Math.log10(padded))
  const unit = 10 ** exp
  const frac = padded / unit
  const nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10
  return nice * unit
}

export const FPS_AXIS_MAX = 60

export function fpsScaleMax(_values: readonly number[], targetFps: number): number {
  if (Number.isFinite(targetFps) && targetFps > 0)
    return Math.min(FPS_AXIS_MAX, targetFps)
  return FPS_AXIS_MAX
}

export function bitrateScaleMax(values: readonly number[]): number {
  return niceCeiling(Math.max(0, ...values), 1_000)
}

export function sampleX(index: number, count: number, width: number): number {
  if (width <= 0 || count < 1) return 0
  if (count === 1) return width
  return (index / (count - 1)) * width
}

export function sampleY(value: number, max: number, height: number): number {
  if (height <= 0 || max <= 0) return height
  const clamped = Math.min(max, Math.max(0, value))
  return height - (clamped / max) * height
}

export function linePath(
  values: readonly number[],
  max: number,
  width: number,
  height: number,
): string {
  if (values.length === 0 || width <= 0 || height <= 0 || max <= 0) return ''
  if (values.length === 1) {
    const y = sampleY(values[0], max, height).toFixed(2)
    return `M0 ${y} L${width.toFixed(2)} ${y}`
  }
  return values.map((value, index) => {
    const x = sampleX(index, values.length, width).toFixed(2)
    const y = sampleY(value, max, height).toFixed(2)
    return `${index === 0 ? 'M' : 'L'}${x} ${y}`
  }).join(' ')
}

export function areaPath(
  values: readonly number[],
  max: number,
  width: number,
  height: number,
): string {
  const line = linePath(values, max, width, height)
  if (!line || values.length === 0) return ''
  const firstX = sampleX(0, values.length, width).toFixed(2)
  const lastX = sampleX(values.length - 1, values.length, width).toFixed(2)
  return `${line} L${lastX} ${height.toFixed(2)} L${firstX} ${height.toFixed(2)} Z`
}

export function nearestSampleIndex(offsetX: number, count: number, width: number): number {
  if (count < 1 || width <= 0) return -1
  let best = 0
  let bestDistance = Number.POSITIVE_INFINITY
  for (let index = 0; index < count; index++) {
    const distance = Math.abs(sampleX(index, count, width) - offsetX)
    if (distance < bestDistance) {
      best = index
      bestDistance = distance
    }
  }
  return best
}
