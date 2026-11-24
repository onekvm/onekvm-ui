import type {
  ExtensionSettingCondition,
  ExtensionSettingProperty,
  ExtensionSettingValue,
  NotificationChannelConfig,
  NotificationChannelSchema,
  WebhookHeader,
} from '../api/client.ts'

/** Built-in channel type; every other type is an extension contribution `<extension>/<channel>`. */
export const WEBHOOK_CHANNEL = 'webhook'
export const MAX_CHANNELS = 16
export const MAX_WEBHOOK_HEADERS = 8

const RESERVED_HEADERS = ['host', 'content-length', 'content-type', 'transfer-encoding', 'connection']

/** Form fields in the declared order; unlisted fields follow by name. */
export function schemaFields(schema: NotificationChannelSchema): [string, ExtensionSettingProperty][] {
  const properties = schema.properties || {}
  const listed = (schema.order || []).filter((name) => name in properties)
  const rest = Object.keys(properties).filter((name) => !listed.includes(name)).sort()
  return [...listed, ...rest].map((name) => [name, properties[name]!])
}

export function isSecret(property: ExtensionSettingProperty) {
  return property.format === 'password'
}

function initialValue(property: ExtensionSettingProperty): ExtensionSettingValue {
  if (property.default !== undefined) return property.default
  if (property.type === 'boolean') return false
  if (property.type === 'string' && !property.enum?.length) return ''
  return null
}

export function newChannel(type: string, schema?: NotificationChannelSchema): NotificationChannelConfig {
  const channel: NotificationChannelConfig = { id: '', type, name: '', enabled: true, min_level: 'warning' }
  if (type === WEBHOOK_CHANNEL) return { ...channel, settings: { url: '' }, headers: [] }
  const settings: Record<string, ExtensionSettingValue> = {}
  for (const [name, property] of schemaFields(schema || { properties: {} })) {
    if (!isSecret(property)) settings[name] = initialValue(property)
  }
  return { ...channel, settings, secrets: {} }
}

/** Settings and secrets together, as conditions see them. */
export function channelValues(channel: NotificationChannelConfig): Record<string, ExtensionSettingValue> {
  return { ...channel.settings, ...channel.secrets }
}

function matches(condition: ExtensionSettingCondition | undefined, values: Record<string, ExtensionSettingValue>) {
  return !!condition && values[condition.field] === condition.equals
}

export function fieldEnabled(property: ExtensionSettingProperty, values: Record<string, ExtensionSettingValue>) {
  return !property.enabled_when || matches(property.enabled_when, values)
}

export function fieldRequired(
  schema: NotificationChannelSchema,
  name: string,
  values: Record<string, ExtensionSettingValue>,
) {
  const property = schema.properties[name]
  if (!property || !fieldEnabled(property, values)) return false
  return (schema.required || []).includes(name) || matches(property.required_when, values)
}

export function webhookUrlValid(url: string, required: boolean) {
  const value = url.trim()
  if (!value) return !required
  try {
    const parsed = new URL(value)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && !!parsed.hostname && value.length <= 2048
  } catch {
    return false
  }
}

export function webhookHeadersValid(headers: WebhookHeader[]) {
  if (headers.length > MAX_WEBHOOK_HEADERS) return false
  const names = new Set<string>()
  return headers.every((header) => {
    const name = header.name.trim().toLowerCase()
    if (!/^[!#$%&'*+\-.^_`|~0-9a-z]{1,64}$/.test(name) || names.has(name)) return false
    names.add(name)
    return !RESERVED_HEADERS.includes(name)
  })
}

function valueValid(property: ExtensionSettingProperty, value: ExtensionSettingValue) {
  if (value === null || value === undefined) return true
  if (property.type === 'boolean') return typeof value === 'boolean'
  if (property.type === 'string') {
    return typeof value === 'string' && (property.maxLength === undefined || [...value].length <= property.maxLength)
  }
  if (typeof value !== 'number' || (property.type === 'integer' && !Number.isInteger(value))) return false
  return (property.minimum === undefined || value >= property.minimum)
    && (property.maximum === undefined || value <= property.maximum)
}

/**
 * Fields that keep the channel from being saved or tested. Required fields
 * count only for an enabled channel or a test; `savedSecrets` are password
 * fields the device already holds, which a blank value keeps.
 */
export function invalidFields(
  channel: NotificationChannelConfig,
  schema: NotificationChannelSchema | undefined,
  savedSecrets: readonly string[],
  test = false,
): string[] {
  const requireAll = channel.enabled || test
  if (channel.type === WEBHOOK_CHANNEL) {
    const invalid: string[] = []
    if (!webhookUrlValid(String(channel.settings?.url ?? ''), requireAll)) invalid.push('url')
    if (!webhookHeadersValid(channel.headers || [])) invalid.push('headers')
    return invalid
  }
  // Without the type's form the channel is kept as it is.
  if (!schema) return []
  const values = channelValues(channel)
  return schemaFields(schema).filter(([name, property]) => {
    if (isSecret(property)) {
      const secret = channel.secrets?.[name]
      const present = !!secret || (secret === '' && savedSecrets.includes(name))
      return requireAll && fieldRequired(schema, name, values) && !present
    }
    const value = channel.settings?.[name]
    if (!valueValid(property, value ?? null)) return true
    return requireAll && fieldRequired(schema, name, values) && (value === null || value === undefined || value === '')
  }).map(([name]) => name)
}

/** The channel as it is submitted: trimmed names, URL and headers. */
export function normalizedChannel(channel: NotificationChannelConfig): NotificationChannelConfig {
  const result: NotificationChannelConfig = { ...channel, name: channel.name.trim() }
  if (channel.type === WEBHOOK_CHANNEL) {
    result.settings = { url: String(channel.settings?.url ?? '').trim() }
    result.headers = (channel.headers || []).map((header) => ({ name: header.name.trim(), value: header.value.trim() }))
  }
  return result
}
