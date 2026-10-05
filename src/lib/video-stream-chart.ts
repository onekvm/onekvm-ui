export type StreamSample = {
  t: number
  fps: number
  bitrate: number
}

export type LatencySample = {
  t: number
  capture: number
  encode: number
  ice: number
  jitter: number
  decode: number
  present: number
}

export const LATENCY_STACK_KEYS = [
  'capture',
  'encode',
  'jitter',
  'decode',
  'present',
] as const

export type LatencyStackKey = (typeof LATENCY_STACK_KEYS)[number]
export type LatencyStackParts = Record<LatencyStackKey, number>

export const STREAM_HISTORY_CAPACITY = 60
export const STREAM_SAMPLE_MS = 1_000

export function formatSampleTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '--:--:--'
  const date = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function pushStreamSample<T>(
  samples: readonly T[],
  sample: T,
  capacity = STREAM_HISTORY_CAPACITY,
): T[] {
  if (capacity < 1) return []
  const next = samples.length >= capacity
    ? samples.slice(samples.length - capacity + 1)
    : samples.slice()
  next.push(sample)
  return next
}

export function latencyMs(us: number): number {
  if (!Number.isFinite(us) || us <= 0) return 0
  return us / 1000
}

export function formatLatencyUs(value: number): string {
  if (!value || value < 0) return '-'
  if (value >= 10_000) return `${Math.round(value / 1000)} ms`
  if (value >= 1000) return `${(value / 1000).toFixed(1)} ms`
  return `${value} µs`
}

export function latencyStackParts(sample: LatencySample): LatencyStackParts {
  const capture = Math.max(0, sample.capture)
  const encode = Math.max(0, sample.encode)
  const present = Math.max(0, sample.present)
  let jitter = Math.max(0, sample.jitter)
  let decode = Math.max(0, sample.decode)
  let display = 0

  /* `present` is receive→display and therefore already contains the browser
     jitter and decode stages. Keep the stack mutually exclusive. The browser
     metrics use independent rolling windows, so clamp jitter/decode
     proportionally when their sum momentarily exceeds the present budget. */
  if (present > 0) {
    const measured = jitter + decode
    if (measured > present && measured > 0) {
      const scale = present / measured
      jitter *= scale
      decode *= scale
    }
    display = Math.max(0, present - jitter - decode)
  }

  return { capture, encode, jitter, decode, present: display }
}

export function latencyStackTotal(sample: LatencySample): number {
  const parts = latencyStackParts(sample)
  let total = 0
  for (const key of LATENCY_STACK_KEYS) total += parts[key]
  return total
}

export function latencyKnownTotal(sample: LatencySample): number {
  return latencyStackTotal(sample)
}

export function latencyScaleMax(samples: readonly LatencySample[]): number {
  let peak = 0
  for (const sample of samples) {
    peak = Math.max(peak, latencyStackTotal(sample), latencyKnownTotal(sample), sample.ice)
  }
  return niceCeiling(peak, 20)
}

export function stackedBandPath(
  upper: readonly number[],
  lower: readonly number[],
  max: number,
  width: number,
  height: number,
): string {
  if (upper.length === 0 || upper.length !== lower.length || width <= 0 || height <= 0 || max <= 0)
    return ''
  const count = lower.length
  if (count === 1) {
    const yTop = sampleY(upper[0], max, height).toFixed(2)
    const yBot = sampleY(lower[0], max, height).toFixed(2)
    const w = width.toFixed(2)
    return `M0 ${yTop} L${w} ${yTop} L${w} ${yBot} L0 ${yBot} Z`
  }
  const top = linePath(upper, max, width, height)
  if (!top) return ''
  const parts = [top]
  for (let index = count - 1; index >= 0; index--) {
    const x = sampleX(index, count, width).toFixed(2)
    const y = sampleY(lower[index], max, height).toFixed(2)
    parts.push(`L${x} ${y}`)
  }
  return `${parts.join(' ')} Z`
}

export function latencyStackBands(
  samples: readonly LatencySample[],
  max: number,
  width: number,
  height: number,
): Record<LatencyStackKey, string> {
  const bands = {} as Record<LatencyStackKey, string>
  const count = samples.length
  const lower = Array.from({ length: count }, () => 0)
  for (const key of LATENCY_STACK_KEYS) {
    const upper = samples.map((sample, index) => lower[index] + latencyStackParts(sample)[key])
    bands[key] = stackedBandPath(upper, lower, max, width, height)
    for (let index = 0; index < count; index++) lower[index] = upper[index]
  }
  return bands
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

export function compactChartPaths(
  samples: readonly Pick<StreamSample, 'fps' | 'bitrate'>[],
  targetFps: number,
  width: number,
  height: number,
) {
  const fpsValues = samples.map((sample) => sample.fps)
  const bitrateValues = samples.map((sample) => sample.bitrate)
  const fpsMax = fpsScaleMax(fpsValues, targetFps)
  const bitrateMax = bitrateScaleMax(bitrateValues)
  return {
    fps: linePath(fpsValues, fpsMax, width, height),
    bitrate: linePath(bitrateValues, bitrateMax, width, height),
    fpsArea: areaPath(fpsValues, fpsMax, width, height),
  }
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
