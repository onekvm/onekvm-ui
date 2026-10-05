import {
  oneKVMThemeTokenNames,
  type OneKVMThemeAppearance,
  type OneKVMThemeDefinition,
  type OneKVMThemeSummary,
  type OneKVMThemeTokenName,
  type OneKVMThemeTokens,
  type ResolvedOneKVMTheme,
} from './types.ts'

export const ONEKVM_THEME_STORAGE_KEY = 'onekvm-ui-theme'
export const ONEKVM_APPEARANCE_STORAGE_KEY = 'onekvm-ui-appearance'
export const DEFAULT_ONEKVM_THEME_ID = 'graphite'
export const LIGHT_ONEKVM_THEME_ID = 'paper'
export const APPEARANCE_PREFERENCES = ['system', 'light', 'dark'] as const
export type OneKVMAppearancePreference = (typeof APPEARANCE_PREFERENCES)[number]
export const DEFAULT_APPEARANCE_PREFERENCE: OneKVMAppearancePreference = 'dark'

export const oneKVMThemeCSSVariables: Readonly<Record<OneKVMThemeTokenName, string>> = {
  background: '--background',
  foreground: '--foreground',
  card: '--card',
  cardForeground: '--card-foreground',
  popover: '--popover',
  popoverForeground: '--popover-foreground',
  primary: '--primary',
  primaryHover: '--primary-hover',
  primaryPressed: '--primary-pressed',
  primaryForeground: '--primary-foreground',
  secondary: '--secondary',
  secondaryHover: '--secondary-hover',
  secondaryForeground: '--secondary-foreground',
  muted: '--muted',
  mutedForeground: '--muted-foreground',
  accent: '--accent',
  accentForeground: '--accent-foreground',
  destructive: '--destructive',
  destructiveHover: '--destructive-hover',
  destructivePressed: '--destructive-pressed',
  destructiveForeground: '--destructive-foreground',
  success: '--success',
  successForeground: '--success-foreground',
  warning: '--warning',
  warningForeground: '--warning-foreground',
  border: '--border',
  borderStrong: '--border-strong',
  input: '--input',
  ring: '--ring',
  toolbar: '--onekvm-toolbar',
  canvas: '--onekvm-canvas',
  videoStage: '--onekvm-video-stage',
  surfaceInset: '--onekvm-surface-inset',
  surfaceRaised: '--onekvm-surface-raised',
  surfaceOverlay: '--onekvm-surface-overlay',
  textSecondary: '--onekvm-text-secondary',
  textTertiary: '--onekvm-text-tertiary',
  shadowPopover: '--onekvm-shadow-popover',
  shadowPanel: '--onekvm-shadow-panel',
  chartFps: '--onekvm-chart-fps',
  chartBitrate: '--onekvm-chart-bitrate',
  chartGrid: '--onekvm-chart-grid',
  radiusSmall: '--radius-small',
  radius: '--radius',
  radiusLarge: '--radius-large',
}

export const graphiteTheme: ResolvedOneKVMTheme = Object.freeze({
  id: DEFAULT_ONEKVM_THEME_ID,
  name: 'Graphite',
  appearance: 'dark',
  tokens: Object.freeze({
    background: '#090d12',
    foreground: '#f4f7fa',
    card: '#11171e',
    cardForeground: '#f4f7fa',
    popover: '#151c24',
    popoverForeground: '#f4f7fa',
    primary: '#3b82f6',
    primaryHover: '#60a5fa',
    primaryPressed: '#2563eb',
    primaryForeground: '#ffffff',
    secondary: '#1a222c',
    secondaryHover: '#222c38',
    secondaryForeground: '#dce3ea',
    muted: '#171e26',
    mutedForeground: '#8e9aa7',
    accent: '#202a35',
    accentForeground: '#f8fafc',
    destructive: '#ef4444',
    destructiveHover: '#f87171',
    destructivePressed: '#dc2626',
    destructiveForeground: '#ffffff',
    success: '#34d399',
    successForeground: '#d9fff1',
    warning: '#fbbf24',
    warningForeground: '#fff3c4',
    border: '#29323d',
    borderStrong: '#3a4653',
    input: '#0d131a',
    ring: '#60a5fa',
    toolbar: '#0d131a',
    canvas: '#070a0e',
    videoStage: '#020304',
    surfaceInset: '#0d131a',
    surfaceRaised: '#171e26',
    surfaceOverlay: 'rgb(17 23 30 / 94%)',
    textSecondary: '#c7d0d9',
    textTertiary: '#a7b1bc',
    shadowPopover: '0 16px 40px rgb(0 0 0 / 48%), 0 0 0 1px rgb(255 255 255 / 4%)',
    shadowPanel: '0 8px 24px rgb(0 0 0 / 30%), 0 0 0 1px rgb(255 255 255 / 3%)',
    chartFps: '#5eead4',
    chartBitrate: '#fbbf24',
    chartGrid: '#3a4653',
    radiusSmall: '4px',
    radius: '6px',
    radiusLarge: '8px',
  }),
})

export const paperTheme: ResolvedOneKVMTheme = Object.freeze({
  id: LIGHT_ONEKVM_THEME_ID,
  name: 'Paper',
  appearance: 'light',
  tokens: Object.freeze({
    background: '#f3f5f8',
    foreground: '#12181f',
    card: '#ffffff',
    cardForeground: '#12181f',
    popover: '#ffffff',
    popoverForeground: '#12181f',
    primary: '#2563eb',
    primaryHover: '#1d4ed8',
    primaryPressed: '#1e40af',
    primaryForeground: '#ffffff',
    secondary: '#e8edf2',
    secondaryHover: '#dce3ea',
    secondaryForeground: '#243040',
    muted: '#eef2f6',
    mutedForeground: '#3f4b57',
    accent: '#e8eef5',
    accentForeground: '#12181f',
    destructive: '#dc2626',
    destructiveHover: '#b91c1c',
    destructivePressed: '#991b1b',
    destructiveForeground: '#ffffff',
    success: '#059669',
    successForeground: '#ecfdf5',
    warning: '#d97706',
    warningForeground: '#fffbeb',
    border: '#d5dde5',
    borderStrong: '#b7c2cd',
    input: '#ffffff',
    ring: '#2563eb',
    toolbar: '#ffffff',
    canvas: '#e8eef3',
    videoStage: '#020304',
    surfaceInset: '#eef2f6',
    surfaceRaised: '#ffffff',
    surfaceOverlay: 'rgb(255 255 255 / 97%)',
    textSecondary: '#3a4653',
    textTertiary: '#5b6773',
    shadowPopover: '0 16px 40px rgb(15 23 42 / 14%), 0 0 0 1px rgb(15 23 42 / 6%)',
    shadowPanel: '0 8px 24px rgb(15 23 42 / 8%), 0 0 0 1px rgb(15 23 42 / 5%)',
    chartFps: '#0f766e',
    chartBitrate: '#b45309',
    chartGrid: '#d5dde5',
    radiusSmall: '4px',
    radius: '6px',
    radiusLarge: '8px',
  }),
})

const themeIdPattern = /^[a-z0-9][a-z0-9-]{1,62}$/

export function isAppearancePreference(value: unknown): value is OneKVMAppearancePreference {
  return value === 'system' || value === 'light' || value === 'dark'
}

export function parseAppearancePreference(value: unknown): OneKVMAppearancePreference {
  return isAppearancePreference(value) ? value : DEFAULT_APPEARANCE_PREFERENCE
}

export function resolveAppearance(
  preference: OneKVMAppearancePreference,
  systemIsLight: boolean,
): OneKVMThemeAppearance {
  if (preference === 'light' || preference === 'dark') return preference
  return systemIsLight ? 'light' : 'dark'
}

export function themeIdForAppearance(
  appearance: OneKVMThemeAppearance,
  themes: ReadonlyMap<string, ResolvedOneKVMTheme>,
  requestedId: string,
): string {
  const requested = themes.get(requestedId)
  if (requested?.appearance === appearance) return requested.id
  for (const theme of themes.values()) {
    if (theme.appearance === appearance) return theme.id
  }
  return appearance === 'light' ? LIGHT_ONEKVM_THEME_ID : DEFAULT_ONEKVM_THEME_ID
}

export function themeSummary(theme: ResolvedOneKVMTheme): OneKVMThemeSummary {
  return { id: theme.id, name: theme.name, appearance: theme.appearance }
}

export function resolveThemeDefinition(
  definition: OneKVMThemeDefinition,
  themes: ReadonlyMap<string, ResolvedOneKVMTheme>,
): ResolvedOneKVMTheme {
  if (!themeIdPattern.test(definition.id)) throw new Error(`Invalid OneKVM theme ID: ${definition.id}`)
  if (!definition.name.trim()) throw new Error(`OneKVM theme ${definition.id} requires a name`)
  if (definition.appearance !== 'dark' && definition.appearance !== 'light') {
    throw new Error(`Invalid appearance for OneKVM theme ${definition.id}`)
  }

  const baseId = definition.extends || DEFAULT_ONEKVM_THEME_ID
  if (baseId === definition.id) throw new Error(`OneKVM theme ${definition.id} cannot extend itself`)
  const base = themes.get(baseId)
  if (!base) throw new Error(`Unknown OneKVM base theme: ${baseId}`)

  const tokens = { ...base.tokens }
  for (const tokenName of oneKVMThemeTokenNames) {
    const value = definition.tokens[tokenName]
    if (value === undefined) continue
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`Invalid ${tokenName} token for OneKVM theme ${definition.id}`)
    }
    tokens[tokenName] = value
  }

  return Object.freeze({
    id: definition.id,
    name: definition.name.trim(),
    appearance: definition.appearance,
    tokens: Object.freeze(tokens as OneKVMThemeTokens),
  })
}
