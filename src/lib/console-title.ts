import type { ConsoleTitleSource, PersonalizationConfig } from '@/api/client'

export const DEFAULT_DEVICE_NAME = 'OneKVM'
export const MAX_PERSONALIZATION_TEXT_LENGTH = 64

type ConsoleIdentity = Partial<PersonalizationConfig> | null | undefined

const unsupportedTitleCharacters = /[\u0000-\u001F\u007F-\u009F\u061C\u200B-\u200F\u2028-\u202E\u2060\u2066-\u2069\uFEFF]/u

export function validPersonalizationText(value: string, required = true) {
  const normalized = value.trim()
  if (required && !normalized) return false
  return Array.from(normalized).length <= MAX_PERSONALIZATION_TEXT_LENGTH
    && !unsupportedTitleCharacters.test(normalized)
}

export function resolveConsoleTitle(
  identity: ConsoleIdentity,
  hostname: string | null | undefined,
  fallbackHostname = '',
) {
  const deviceName = identity?.device_name?.trim() || ''
  const customTitle = identity?.custom_console_title?.trim() || ''
  const resolvedHostname = hostname?.trim() || fallbackHostname.trim()
  const source: ConsoleTitleSource = identity?.console_title_source || 'hostname'
  const selected = source === 'device_name'
    ? deviceName
    : source === 'custom'
      ? customTitle
      : resolvedHostname
  return selected || resolvedHostname || deviceName || DEFAULT_DEVICE_NAME
}
