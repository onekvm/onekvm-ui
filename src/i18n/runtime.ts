import { ref, shallowRef } from 'vue'

import languages from './languages'
import en from './locales/en'

type MessageTree = Record<string, unknown>
type LocaleModule = { default: { translation: MessageTree } }

const LANGUAGE_KEY = 'nano-kvm-language'
const FALLBACK_BROWSER_LOCALE = 'en-US'
const localeLoaders = import.meta.glob<LocaleModule>(['./locales/*.ts', '!./locales/en.ts'])
const supportedLanguages = new Set(languages.map(({ key }) => key))
const activeMessages = shallowRef<MessageTree>(en.translation)

const aliases: Record<string, string> = {
  'zh-cn': 'zh',
  'zh-sg': 'zh',
  'zh-tw': 'zh_tw',
  'zh-hk': 'zh_tw',
}

function supportedLanguage(value: string) {
  const lower = value.toLowerCase()
  const candidate = aliases[lower] || lower.split('-')[0]
  return supportedLanguages.has(candidate) ? candidate : ''
}

function normalizeLanguage(value: string) {
  return supportedLanguage(value) || 'en'
}

export function browserLanguage() {
  const candidates = navigator.languages?.length
    ? navigator.languages
    : [navigator.language || FALLBACK_BROWSER_LOCALE]
  for (const candidate of candidates) {
    const language = supportedLanguage(candidate)
    if (language) return language
  }
  return normalizeLanguage(FALLBACK_BROWSER_LOCALE)
}

const initialLanguage = normalizeLanguage(
  localStorage.getItem(LANGUAGE_KEY) || browserLanguage(),
)
export const currentLanguage = ref(initialLanguage)
export const languageOptions = languages.map(({ key, name }) => ({ label: name, value: key }))

function lookup(tree: MessageTree, path: string) {
  let value: unknown = tree
  for (const part of path.split('.')) {
    if (!value || typeof value !== 'object') return undefined
    value = (value as MessageTree)[part]
  }
  return typeof value === 'string' ? value : undefined
}

export function t(path: string, fallback?: string) {
  return lookup(activeMessages.value, path) || lookup(en.translation, path) || fallback || path
}

export async function setLanguage(language: string) {
  const normalized = normalizeLanguage(language)
  if (normalized === 'en') {
    activeMessages.value = en.translation
  } else {
    const locale = await localeLoaders[`./locales/${normalized}.ts`]()
    activeMessages.value = locale.default.translation
  }
  currentLanguage.value = normalized
  localStorage.setItem(LANGUAGE_KEY, normalized)
  document.documentElement.lang = normalized === 'zh' ? 'zh-CN' : normalized === 'zh_tw' ? 'zh-TW' : 'en-US'
}

export function initializeLanguage(deviceLanguage?: string, preferBrowser = false) {
  const stored = localStorage.getItem(LANGUAGE_KEY) || ''
  const detected = browserLanguage()
  const language = preferBrowser
    ? detected
    : supportedLanguage(stored) || supportedLanguage(deviceLanguage || '') || detected
  return setLanguage(language)
}
