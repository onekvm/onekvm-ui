import { computed, readonly, shallowRef } from 'vue'
import { activateIconSet, initializeIconRuntime } from '../icons/runtime.ts'
import type { OneKVMIconSetDefinition } from '../icons/types.ts'

import { naiveOverridesFor, naiveThemeFor } from './naive'
import {
  ONEKVM_THEME_COLORS_STORAGE_KEY,
  customThemeColorIssue,
  normalizeThemeColors,
  parseThemeColorPreferences,
  resolveCustomThemeColors,
  type CustomThemeColors,
  type ThemeColorPreferences,
} from './colors'
import {
  DEFAULT_APPEARANCE_PREFERENCE,
  DEFAULT_ONEKVM_THEME_ID,
  graphiteTheme,
  ONEKVM_APPEARANCE_STORAGE_KEY,
  ONEKVM_THEME_STORAGE_KEY,
  oneKVMThemeCSSVariables,
  paperTheme,
  win98Theme,
  parseAppearancePreference,
  resolveAppearance,
  resolveThemeDefinition,
  themeIdForAppearance,
  themeSummary,
  type OneKVMAppearancePreference,
} from './model'
import type {
  OneKVMThemeDefinition,
  OneKVMThemeRuntimeV1,
  OneKVMThemeSummary,
  ResolvedOneKVMTheme,
} from './types'

interface InitializeThemeOptions {
  iconSets?: readonly OneKVMIconSetDefinition[]
  themes?: readonly OneKVMThemeDefinition[]
  defaultTheme?: string
}

declare global {
  interface Window {
    OneKVMTheme?: { v1: OneKVMThemeRuntimeV1 }
  }
}

const themes = new Map<string, ResolvedOneKVMTheme>([
  [graphiteTheme.id, graphiteTheme],
  [paperTheme.id, paperTheme],
  [win98Theme.id, win98Theme],
])
const activeThemeState = shallowRef<ResolvedOneKVMTheme>(graphiteTheme)
const themeColorPreferencesState = shallowRef<ThemeColorPreferences>({})
const appearancePreferenceState = shallowRef<OneKVMAppearancePreference>(DEFAULT_APPEARANCE_PREFERENCE)
let requestedThemeId = DEFAULT_ONEKVM_THEME_ID
let initialized = false
let systemAppearanceQuery: MediaQueryList | null = null

export const activeTheme = readonly(activeThemeState)
const baseTheme = computed(() => themes.get(activeThemeState.value.id) || graphiteTheme)
const customColors = computed(() => themeColorPreferencesState.value[activeThemeState.value.id] || {})
export const appearancePreference = readonly(appearancePreferenceState)
export const activeNaiveTheme = computed(() => naiveThemeFor(activeThemeState.value))
export const activeNaiveOverrides = computed(() => naiveOverridesFor(activeThemeState.value))

function readStoredTheme() {
  try {
    return localStorage.getItem(ONEKVM_THEME_STORAGE_KEY)
  } catch {
    return null
  }
}

function persistTheme(id: string) {
  try {
    localStorage.setItem(ONEKVM_THEME_STORAGE_KEY, id)
  } catch {
    // Theme activation still works when storage is unavailable.
  }
}

function readStoredAppearance() {
  try {
    return parseAppearancePreference(localStorage.getItem(ONEKVM_APPEARANCE_STORAGE_KEY))
  } catch {
    return DEFAULT_APPEARANCE_PREFERENCE
  }
}

function persistAppearance(preference: OneKVMAppearancePreference) {
  try {
    localStorage.setItem(ONEKVM_APPEARANCE_STORAGE_KEY, preference)
  } catch {
    // Appearance still applies when storage is unavailable.
  }
}

function systemIsLight() {
  return Boolean(systemAppearanceQuery?.matches)
}

function applyTheme(theme: ResolvedOneKVMTheme) {
  const root = document.documentElement
  for (const [tokenName, variableName] of Object.entries(oneKVMThemeCSSVariables)) {
    root.style.setProperty(variableName, theme.tokens[tokenName as keyof typeof theme.tokens])
  }
  root.dataset.onekvmTheme = theme.id
  root.dataset.onekvmSkin = theme.skin
  root.dataset.theme = theme.appearance
  root.style.colorScheme = theme.appearance
  activateIconSet(theme.iconSet)

  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  themeColor?.setAttribute('content', theme.tokens.background)
  window.dispatchEvent(new CustomEvent('onekvm-themechange', { detail: themeSummary(theme) }))
}

function applyResolvedTheme() {
  const appearance = resolveAppearance(appearancePreferenceState.value, systemIsLight())
  const themeId = themeIdForAppearance(appearance, themes, requestedThemeId)
  const theme = themes.get(themeId) || (appearance === 'light' ? paperTheme : graphiteTheme)
  const customized = resolveCustomThemeColors(theme, themeColorPreferencesState.value[theme.id] || {})
  const resolved = customThemeColorIssue(customized) ? theme : customized
  activeThemeState.value = resolved
  applyTheme(resolved)
}

function setThemeColors(value: CustomThemeColors | null) {
  const colors = value === null ? {} : normalizeThemeColors(value)
  if (!colors) return false
  const preferences = { ...themeColorPreferencesState.value }
  const id = activeThemeState.value.id
  if (Object.keys(colors).length && customThemeColorIssue(resolveCustomThemeColors(baseTheme.value, colors))) return false
  if (Object.keys(colors).length) preferences[id] = colors
  else delete preferences[id]
  themeColorPreferencesState.value = preferences
  try {
    localStorage.setItem(ONEKVM_THEME_COLORS_STORAGE_KEY, JSON.stringify(preferences))
  } catch {
    // Match the existing browser-local theme preference behavior.
  }
  applyResolvedTheme()
  return true
}

function activateTheme(id: string, persist = true) {
  const theme = themes.get(id)
  if (!theme) return false
  requestedThemeId = id
  if (appearancePreferenceState.value !== 'system') {
    appearancePreferenceState.value = theme.appearance
    if (persist) persistAppearance(theme.appearance)
  }
  applyResolvedTheme()
  if (persist) persistTheme(id)
  return true
}

function setAppearancePreference(preference: string, persist = true) {
  const next = parseAppearancePreference(preference)
  appearancePreferenceState.value = next
  applyResolvedTheme()
  if (persist) persistAppearance(next)
  return true
}

function onSystemAppearanceChange() {
  if (appearancePreferenceState.value !== 'system') return
  applyResolvedTheme()
}

export function registerOneKVMTheme(definition: OneKVMThemeDefinition): OneKVMThemeSummary {
  const resolved = resolveThemeDefinition(definition, themes)
  themes.set(resolved.id, resolved)
  if (initialized && requestedThemeId === resolved.id) applyResolvedTheme()
  return themeSummary(resolved)
}

export function listOneKVMThemes() {
  return [...themes.values()].map(themeSummary)
}

export function currentOneKVMTheme() {
  return themeSummary(activeThemeState.value)
}

export function useOneKVMTheme() {
  return {
    theme: activeTheme,
    baseTheme: readonly(baseTheme),
    customColors: readonly(customColors),
    setColors: setThemeColors,
    appearance: appearancePreference,
    naiveTheme: activeNaiveTheme,
    naiveOverrides: activeNaiveOverrides,
    activate: activateTheme,
    setAppearance: setAppearancePreference,
    list: listOneKVMThemes,
  }
}

export function initializeThemeRuntime(options: InitializeThemeOptions = {}) {
  if (initialized) return
  initializeIconRuntime(options.iconSets)
  for (const theme of options.themes || []) registerOneKVMTheme(theme)

  const fallbackThemeId = options.defaultTheme && themes.has(options.defaultTheme)
    ? options.defaultTheme
    : DEFAULT_ONEKVM_THEME_ID
  requestedThemeId = readStoredTheme() || fallbackThemeId
  appearancePreferenceState.value = readStoredAppearance()
  try {
    themeColorPreferencesState.value = parseThemeColorPreferences(localStorage.getItem(ONEKVM_THEME_COLORS_STORAGE_KEY))
  } catch {
    themeColorPreferencesState.value = {}
  }
  systemAppearanceQuery = window.matchMedia('(prefers-color-scheme: light)')
  systemAppearanceQuery.addEventListener('change', onSystemAppearanceChange)
  if (!themes.has(requestedThemeId)) requestedThemeId = fallbackThemeId
  applyResolvedTheme()

  const runtime: OneKVMThemeRuntimeV1 = Object.freeze({
    register: registerOneKVMTheme,
    activate: (id: string) => activateTheme(id),
    current: currentOneKVMTheme,
    list: listOneKVMThemes,
  })
  window.OneKVMTheme = { v1: runtime }
  initialized = true
}
