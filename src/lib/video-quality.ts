const tiers = [
  { maximum: 10, key: 'settings.advancedSettings.displayPage.qualityTier10', fallback: 'Minimum bandwidth' },
  { maximum: 20, key: 'settings.advancedSettings.displayPage.qualityTier20', fallback: 'Very low bandwidth' },
  { maximum: 30, key: 'settings.advancedSettings.displayPage.qualityTier30', fallback: 'Low bandwidth' },
  { maximum: 40, key: 'settings.advancedSettings.displayPage.qualityTier40', fallback: 'Bandwidth first' },
  { maximum: 50, key: 'settings.advancedSettings.displayPage.qualityTier50', fallback: 'Balanced' },
  { maximum: 60, key: 'settings.advancedSettings.displayPage.qualityTier60', fallback: 'Balanced quality' },
  { maximum: 70, key: 'settings.advancedSettings.displayPage.qualityTier70', fallback: 'High quality' },
  { maximum: 80, key: 'settings.advancedSettings.displayPage.qualityTier80', fallback: 'Very high quality' },
  { maximum: 90, key: 'settings.advancedSettings.displayPage.qualityTier90', fallback: 'Near maximum quality' },
  { maximum: 100, key: 'settings.advancedSettings.displayPage.qualityTier100', fallback: 'Maximum quality' },
] as const

export function qualityTier(percent: number) {
  const normalized = Number.isFinite(percent) ? Math.min(100, Math.max(1, percent)) : 100
  return tiers.find((tier) => normalized <= tier.maximum) ?? tiers[tiers.length - 1]
}
