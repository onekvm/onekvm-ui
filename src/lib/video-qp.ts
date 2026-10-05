export type QpPresetKey =
  | 'minimum-latency'
  | 'latency-priority'
  | 'balanced'
  | 'quality-priority'
  | 'maximum-quality'

export interface QpPreset {
  value: QpPresetKey
  labelKey: string
  labelFallback: string
  descriptionKey: string
  descriptionFallback: string
  initialQp: number
  minQp: number
  maxQp: number
}

export interface VideoQpValues {
  initial_qp?: number
  min_qp?: number
  max_qp?: number
}

// Balanced matches kmpp onekvm_setup (PicoKVM VEPU: init 22, P 12–48).
// Outer presets keep the same step spacing.
export const qpPresets: readonly QpPreset[] = [
  {
    value: 'minimum-latency',
    labelKey: 'settings.advancedSettings.displayPage.qpMinimumLatency',
    labelFallback: 'Minimum latency',
    descriptionKey: 'settings.advancedSettings.displayPage.qpMinimumLatencyHint',
    descriptionFallback: 'Uses smaller encoded frames to minimize transmission pressure; fine detail is reduced first.',
    initialQp: 43,
    minQp: 28,
    maxQp: 51,
  },
  {
    value: 'latency-priority',
    labelKey: 'settings.advancedSettings.displayPage.qpLatencyPriority',
    labelFallback: 'Latency priority',
    descriptionKey: 'settings.advancedSettings.displayPage.qpLatencyPriorityHint',
    descriptionFallback: 'Prefers lower frame sizes during motion while retaining more detail than Minimum latency.',
    initialQp: 39,
    minQp: 24,
    maxQp: 51,
  },
  {
    value: 'balanced',
    labelKey: 'settings.advancedSettings.displayPage.qpBalanced',
    labelFallback: 'Balanced',
    descriptionKey: 'settings.advancedSettings.displayPage.qpBalancedHint',
    descriptionFallback: 'Balances detail, bitrate, and transmission latency.',
    initialQp: 22,
    minQp: 12,
    maxQp: 48,
  },
  {
    value: 'quality-priority',
    labelKey: 'settings.advancedSettings.displayPage.qpQualityPriority',
    labelFallback: 'Quality priority',
    descriptionKey: 'settings.advancedSettings.displayPage.qpQualityPriorityHint',
    descriptionFallback: 'Retains more picture detail at the cost of larger frames and possible bitrate overshoot.',
    initialQp: 31,
    minQp: 16,
    maxQp: 47,
  },
  {
    value: 'maximum-quality',
    labelKey: 'settings.advancedSettings.displayPage.qpMaximumQuality',
    labelFallback: 'Maximum quality',
    descriptionKey: 'settings.advancedSettings.displayPage.qpMaximumQualityHint',
    descriptionFallback: 'Preserves the most picture detail; requires more bandwidth and may increase latency.',
    initialQp: 27,
    minQp: 12,
    maxQp: 43,
  },
]

export function hasQpOverride(value: VideoQpValues) {
  return [value.initial_qp, value.min_qp, value.max_qp]
    .some((parameter) => (parameter ?? 0) > 0)
}

export function matchingQpPreset(value: VideoQpValues) {
  return qpPresets.find((preset) =>
    value.initial_qp === preset.initialQp &&
    value.min_qp === preset.minQp &&
    value.max_qp === preset.maxQp,
  )
}

export function setQpPreset(value: VideoQpValues, presetKey: QpPresetKey) {
  const preset = qpPresets.find((candidate) => candidate.value === presetKey)
  if (!preset) return false
  value.initial_qp = preset.initialQp
  value.min_qp = preset.minQp
  value.max_qp = preset.maxQp
  return true
}

export function clearQpOverride(value: VideoQpValues) {
  value.initial_qp = 0
  value.min_qp = 0
  value.max_qp = 0
}
