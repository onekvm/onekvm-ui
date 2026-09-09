export function uploadPercentage(transferred: number, total: number) {
  if (total <= 0) return 0
  return Math.min(100, Math.round(transferred * 1000 / total) / 10)
}

export function nextUploadSpeed(
  previous: number,
  transferred: number,
  sampleBytes: number,
  elapsedMs: number,
) {
  const byteDelta = transferred - sampleBytes
  if (elapsedMs < 100 || byteDelta < 0) return null
  const instant = byteDelta * 1000 / elapsedMs
  return previous > 0 ? previous * 0.7 + instant * 0.3 : instant
}

export function uploadRemainingSeconds(
  total: number,
  transferred: number,
  speed: number,
  active: boolean,
) {
  if (!active || speed <= 0 || total <= transferred) return 0
  return Math.max(1, Math.ceil((total - transferred) / speed))
}
