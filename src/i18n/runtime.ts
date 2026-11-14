import { ref, shallowRef } from 'vue'

import languages from './languages'

export type LanguageOption = { label: string; value: string }
type MessageTree = Record<string, unknown>

const LANGUAGE_KEY = 'nano-kvm-language'
const FALLBACK_BROWSER_LOCALE = 'en-US'
const builtinOptions: LanguageOption[] = languages.map(({ key, name }) => ({ label: name, value: key }))
const supportedLanguages = new Set(builtinOptions.map(({ value }) => value))
const aliases: Record<string, string> = {
  'zh-cn': 'zh',
  'zh-sg': 'zh',
  'zh-tw': 'zh_tw',
  'zh-hk': 'zh_tw',
}

export const languageOptions = shallowRef<LanguageOption[]>(builtinOptions.slice())
const activeMessages = shallowRef<MessageTree>({})
const englishMessages = shallowRef<MessageTree>({})

function storedLanguage() {
  try {
    return localStorage.getItem(LANGUAGE_KEY) || ''
  } catch {
    return ''
  }
}

function rememberLanguage(language: string) {
  try {
    localStorage.setItem(LANGUAGE_KEY, language)
  } catch {
    /* Node tests have no web storage. */
  }
}

function supportedLanguage(value: string) {
  const lower = value.toLowerCase()
  const underscored = lower.replace(/-/g, '_')
  const aliased = aliases[lower] || aliases[underscored]
  if (aliased && supportedLanguages.has(aliased)) return aliased
  if (supportedLanguages.has(underscored)) return underscored
  const primary = underscored.split('_')[0] || ''
  return supportedLanguages.has(primary) ? primary : ''
}

function normalizeLanguage(value: string) {
  return supportedLanguage(value) || 'en'
}

export function browserLanguage() {
  if (typeof navigator === 'undefined') return 'en'
  const candidates = navigator.languages?.length
    ? navigator.languages
    : [navigator.language || FALLBACK_BROWSER_LOCALE]
  for (const candidate of candidates) {
    const language = supportedLanguage(candidate)
    if (language) return language
  }
  return 'en'
}

export const currentLanguage = ref(normalizeLanguage(storedLanguage() || browserLanguage()))

function lookup(tree: MessageTree, path: string) {
  let value: unknown = tree
  for (const part of path.split('.')) {
    if (!value || typeof value !== 'object') return undefined
    value = (value as MessageTree)[part]
  }
  return typeof value === 'string' ? value : undefined
}

export function t(path: string, fallback?: string) {
  return lookup(activeMessages.value, path) || lookup(englishMessages.value, path) || fallback || path
}

function htmlLang(code: string) {
  if (code === 'zh') return 'zh-CN'
  if (code === 'zh_tw') return 'zh-TW'
  const [language, region] = code.split('_')
  return region ? `${language}-${region.toUpperCase()}` : language || 'en'
}

function translationTree(body: unknown): MessageTree | null {
  if (!body || typeof body !== 'object') return null
  const record = body as MessageTree
  if (record.translation && typeof record.translation === 'object') return record.translation as MessageTree
  return record
}

async function loadNodePack(code: string): Promise<MessageTree | null> {
  try {
    const specifier = `./locales/${code}.ts`
    const locale = await import(/* @vite-ignore */ specifier) as { default?: { translation?: MessageTree } }
    return locale.default?.translation ?? null
  } catch {
    return null
  }
}

async function loadPack(code: string): Promise<MessageTree | null> {
  if (typeof window === 'undefined') return loadNodePack(code)
  try {
    const response = await fetch(`/l10n/${encodeURIComponent(code)}/messages.json`, { cache: 'no-store' })
    if (!response.ok) return null
    return translationTree(await response.json())
  } catch {
    return null
  }
}

export async function refreshLanguageCatalog() {
  if (typeof fetch !== 'function') return
  try {
    const response = await fetch('/l10n/index.json', { cache: 'no-store' })
    if (!response.ok) return
    const body = await response.json() as { languages?: { code?: string; name?: string }[] }
    const next: LanguageOption[] = []
    for (const language of body.languages || []) {
      if (!language.code || !language.name) continue
      if (!/^[a-z]{2,8}(_[a-z0-9]{2,8})?$/.test(language.code)) continue
      next.push({ value: language.code, label: language.name })
    }
    if (!next.length) return
    languageOptions.value = next
    supportedLanguages.clear()
    for (const option of next) supportedLanguages.add(option.value)
    supportedLanguages.add('en')
  } catch {
    /* Keep the built-in list when the index is unavailable. */
  }
}

export async function setLanguage(language: string) {
  const normalized = normalizeLanguage(language)
  if (!Object.keys(englishMessages.value).length) {
    const english = await loadPack('en')
    if (english) englishMessages.value = english
  }
  const messages = normalized === 'en' ? englishMessages.value : await loadPack(normalized)
  activeMessages.value = messages && Object.keys(messages).length ? messages : englishMessages.value
  currentLanguage.value = normalized
  rememberLanguage(normalized)
  if (typeof document !== 'undefined') document.documentElement.lang = htmlLang(normalized)
}

export async function initializeLanguage(deviceLanguage?: string, preferBrowser = false) {
  await refreshLanguageCatalog()
  const stored = storedLanguage()
  const detected = browserLanguage()
  const language = preferBrowser
    ? detected
    : supportedLanguage(stored) || supportedLanguage(deviceLanguage || '') || detected
  await setLanguage(language)
}
