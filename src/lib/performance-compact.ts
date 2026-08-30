export function formatCompactBitrate(kbps: number) {
  if (!Number.isFinite(kbps) || kbps <= 0) return '0'
  if (kbps >= 1000) return `${(kbps / 1000).toFixed(kbps >= 10000 ? 0 : 1)}M`
  return `${Math.round(kbps)}k`
}
