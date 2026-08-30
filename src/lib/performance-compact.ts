export const COMPACT_CHART_WIDTH = 72
export const COMPACT_CHART_HEIGHT = 20

export function formatCompactBitrate(kbps: number) {
  if (!Number.isFinite(kbps) || kbps <= 0) return '0'
  if (kbps >= 1000) return `${(kbps / 1000).toFixed(kbps >= 10000 ? 0 : 1)}M`
  return `${Math.round(kbps)}k`
}

export function formatCompactResolution(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return '—'
  return `${Math.round(width)}×${Math.round(height)}`
}
