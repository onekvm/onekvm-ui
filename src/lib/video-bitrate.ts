export interface VideoBitrateRange {
  minimum: number
  maximum: number
  step: number
  default: number
}

export function videoBitratePresets(range: VideoBitrateRange | undefined): number[] {
  if (!range) return []
  return [...new Set([
    range.minimum, range.default, range.maximum,
    500, 1000, 2000, 3000, 4000, 5000, 6000, 8000, 10000,
    15000, 20000, 30000, 40000, 50000, 75000, 100000,
  ])].filter(value => Number.isInteger(value) && value > 0
    && value >= range.minimum && value <= range.maximum)
    .sort((a, b) => a - b)
}
