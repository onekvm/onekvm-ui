export const oneKVMThemeTokenNames = [
  'background',
  'foreground',
  'card',
  'cardForeground',
  'popover',
  'popoverForeground',
  'primary',
  'primaryHover',
  'primaryPressed',
  'primaryForeground',
  'secondary',
  'secondaryHover',
  'secondaryForeground',
  'muted',
  'mutedForeground',
  'accent',
  'accentForeground',
  'destructive',
  'destructiveHover',
  'destructivePressed',
  'destructiveForeground',
  'success',
  'successForeground',
  'warning',
  'warningForeground',
  'border',
  'borderStrong',
  'input',
  'ring',
  'toolbar',
  'canvas',
  'videoStage',
  'surfaceInset',
  'surfaceRaised',
  'surfaceOverlay',
  'textSecondary',
  'textTertiary',
  'shadowPopover',
  'shadowPanel',
  'chartFps',
  'chartBitrate',
  'chartGrid',
  'radiusSmall',
  'radius',
  'radiusLarge',
] as const

export type OneKVMThemeTokenName = (typeof oneKVMThemeTokenNames)[number]
export type OneKVMThemeTokens = Record<OneKVMThemeTokenName, string>
export type OneKVMThemeAppearance = 'dark' | 'light'

export interface OneKVMThemeDefinition {
  id: string
  name: string
  appearance: OneKVMThemeAppearance
  extends?: string
  tokens: Partial<OneKVMThemeTokens>
}

export interface ResolvedOneKVMTheme {
  id: string
  name: string
  appearance: OneKVMThemeAppearance
  tokens: OneKVMThemeTokens
}

export interface OneKVMThemeSummary {
  id: string
  name: string
  appearance: OneKVMThemeAppearance
}

export interface OneKVMThemeRuntimeV1 {
  register: (definition: OneKVMThemeDefinition) => OneKVMThemeSummary
  activate: (id: string) => boolean
  current: () => OneKVMThemeSummary
  list: () => OneKVMThemeSummary[]
}
