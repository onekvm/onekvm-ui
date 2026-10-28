import type { ExtensionSettingValue, ExtensionStatus } from '../api/client'

export function validateExtensionSettings(
  extension: Pick<ExtensionStatus, 'settings_schema' | 'settings'>,
  update: Record<string, ExtensionSettingValue>,
): string | null {
  const schema = extension.settings_schema
  const merged = { ...extension.settings, ...update }
  for (const name of schema.required || []) {
    const value = merged[name]
    // Required fields must be present; empty strings are valid schema values
    // (for example, EasyTier's IPv4 address when automatic assignment is on).
    if (value === undefined || value === null) return `${name} is required`
  }
  for (const [name, value] of Object.entries(update)) {
    const property = schema.properties[name]
    if (!property) {
      if (!schema.additionalProperties) return `Unknown setting ${name}`
      continue
    }
    if (property.readOnly) return `${name} is read-only`
    if (value === null) continue
    if (property.type === 'boolean' && typeof value !== 'boolean') return `${name} must be a boolean`
    if (property.type === 'string' && typeof value !== 'string') return `${name} must be a string`
    if ((property.type === 'integer' || property.type === 'number') && typeof value !== 'number') return `${name} must be a number`
    if (property.type === 'integer' && typeof value === 'number' && !Number.isInteger(value)) return `${name} must be an integer`
    if (typeof value === 'string' && property.maxLength !== undefined && value.length > property.maxLength) {
      return `${name} exceeds its maximum length`
    }
    if (typeof value === 'number' && property.minimum !== undefined && value < property.minimum) return `${name} is too small`
    if (typeof value === 'number' && property.maximum !== undefined && value > property.maximum) return `${name} is too large`
  }
  return null
}
