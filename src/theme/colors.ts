import type { ResolvedOneKVMTheme } from './types.ts'

export const ONEKVM_THEME_COLORS_STORAGE_KEY = 'onekvm-ui-theme-colors'
export const customThemeColorNames = ['primary', 'background', 'card', 'foreground'] as const
export type CustomThemeColorName = typeof customThemeColorNames[number]
export type CustomThemeColors = Partial<Record<CustomThemeColorName, string>>
export type ThemeColorPreferences = Record<string, CustomThemeColors>

export function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const color = value.trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(color)) return color
  if (/^#[0-9a-f]{3}$/.test(color)) return `#${[...color.slice(1)].map(char => char + char).join('')}`
  return null
}

export function normalizeThemeColors(value: unknown): CustomThemeColors | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const result: CustomThemeColors = {}
  for (const name of customThemeColorNames) {
    const raw = (value as Record<string, unknown>)[name]
    if (raw === undefined) continue
    const color = normalizeHexColor(raw)
    if (!color) return null
    result[name] = color
  }
  return result
}

export function parseThemeColorPreferences(raw: string | null): ThemeColorPreferences {
  try {
    const value: unknown = JSON.parse(raw || '{}')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(Object.entries(value).flatMap(([id, colors]) => {
      if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(id)) return []
      const normalized = normalizeThemeColors(colors)
      return normalized && Object.keys(normalized).length ? [[id, normalized]] : []
    }))
  } catch {
    return {}
  }
}

function channels(color: string): number[] {
  return [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16))
}

function mix(color: string, other: string, amount: number): string {
  const a = channels(color)
  const b = channels(other)
  return `#${a.map((channel, index) => Math.round(channel * (1 - amount) + b[index]! * amount).toString(16).padStart(2, '0')).join('')}`
}

function luminance(color: string): number {
  const values = channels(color).map(channel => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return values[0]! * 0.2126 + values[1]! * 0.7152 + values[2]! * 0.0722
}

export function colorContrastRatio(a: string, b: string): number {
  const first = normalizeHexColor(a)
  const second = normalizeHexColor(b)
  if (!first || !second) return 0
  const x = luminance(first)
  const y = luminance(second)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

function readableMix(color: string, other: string, text: string, amount: number): string {
  for (let weight = amount; weight > 0; weight -= 0.02) {
    const mixed = mix(color, other, weight)
    if (colorContrastRatio(mixed, text) >= 4.5) return mixed
  }
  return color
}

/** Preserve the theme's identity, skin, icons and semantic status colors. */
export function resolveCustomThemeColors(base: ResolvedOneKVMTheme, colors: CustomThemeColors): ResolvedOneKVMTheme {
  if (!Object.keys(colors).length) return base
  const token = { ...base.tokens, ...colors }
  if (colors.primary) {
    const primary = colors.primary
    const text = colorContrastRatio(primary, '#ffffff') >= colorContrastRatio(primary, '#000000') ? '#ffffff' : '#000000'
    token.primaryForeground = text
    token.primaryHover = readableMix(primary, base.appearance === 'dark' ? '#ffffff' : '#000000', text, 0.14)
    token.primaryPressed = readableMix(primary, '#000000', text, 0.22)
    token.ring = token.primaryHover
    if (base.skin === 'classic') token.titlebarActive = `linear-gradient(90deg, ${primary}, ${token.primaryHover})`
    else if (base.tokens.titlebarActive === base.tokens.primary) token.titlebarActive = primary
  }
  if (colors.background || colors.card || colors.foreground) {
    const { foreground, background, card } = token
    token.cardForeground = foreground
    token.popover = card
    token.popoverForeground = foreground
    token.secondary = readableMix(card, foreground, foreground, 0.06)
    token.secondaryHover = readableMix(card, foreground, foreground, 0.10)
    token.secondaryForeground = foreground
    token.muted = background
    token.mutedForeground = readableMix(foreground, background, card, 0.28)
    if (colorContrastRatio(token.mutedForeground, background) < 4.5) token.mutedForeground = foreground
    token.placeholderForeground = token.mutedForeground
    token.accent = token.secondaryHover
    token.accentForeground = foreground
    token.border = mix(card, foreground, 0.20)
    token.borderStrong = mix(card, foreground, 0.34)
    token.input = card
    token.toolbar = card
    token.canvas = background
    token.surfaceInset = background
    token.surfaceRaised = token.secondary
    token.surfaceOverlay = card
    token.textSecondary = token.mutedForeground
    token.textTertiary = token.mutedForeground
    token.chartGrid = token.border
    if (base.skin !== 'classic' && base.appearance === 'dark') token.titlebarActive = token.secondary
  }
  return { ...base, tokens: token }
}

export function customThemeColorIssue(theme: ResolvedOneKVMTheme): 'foreground' | 'primary' | null {
  const token = theme.tokens
  if ([token.background, token.card].some(surface => colorContrastRatio(surface, token.foreground) < 4.5)) return 'foreground'
  if ([token.background, token.card].some(surface => colorContrastRatio(surface, token.primary) < 3)) return 'primary'
  return null
}
