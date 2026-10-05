import { PHONE_UI_MAX_WIDTH, PHONE_UI_QUERY, phoneUiActive } from './mobile-viewport.ts'

export const SETTINGS_INDEX = 'index'
export const SETTINGS_APP_MAX_WIDTH = PHONE_UI_MAX_WIDTH
export const SETTINGS_APP_QUERY = PHONE_UI_QUERY
export const ADVANCED_SETTINGS_HASH = '#/settings/advanced'

export type SettingsListTone = 'device' | 'network' | 'extensions' | 'admin'

export type SettingsListItem = {
  key: string
  parent?: string
}

export type SettingsListGroup<T extends SettingsListItem> = {
  id: string
  items: T[]
}

const SETTINGS_LIST_GROUPS: { id: string; keys: string[] }[] = [
  { id: 'device', keys: ['system', 'display', 'keyboard', 'usb'] },
  { id: 'network', keys: ['network', 'time'] },
  { id: 'extensions', keys: ['cloud', 'plugins'] },
  { id: 'admin', keys: ['services', 'logs', 'resources', 'sessions', 'users', 'files', 'update'] },
]

export function isSettingsIndex(section: string) {
  return section === SETTINGS_INDEX || section === ''
}

export function settingsAppActive(viewportWidth: number, viewportHeight = viewportWidth) {
  return phoneUiActive(viewportWidth, viewportHeight)
}

export function isAdvancedSettingsHash(hash: string) {
  return hash === ADVANCED_SETTINGS_HASH || hash.startsWith(`${ADVANCED_SETTINGS_HASH}/`)
}

export function advancedSettingsRouteFromHash(hash: string, mobile: boolean) {
  if (!isAdvancedSettingsHash(hash)) return 'system'
  const route = hash.slice(ADVANCED_SETTINGS_HASH.length).replace(/^\//, '')
  if (route) return route
  return mobile ? '' : 'system'
}

export function advancedSettingsHash(route = '') {
  return route ? `/settings/advanced/${route}` : '/settings/advanced'
}

export function settingsGroupTone(groupId: string): SettingsListTone {
  if (groupId === 'network' || groupId === 'extensions' || groupId === 'admin') return groupId
  return 'device'
}

export function groupSettingsSections<T extends SettingsListItem>(items: readonly T[]): SettingsListGroup<T>[] {
  const remaining = new Map(items.map((item) => [item.key, item]))
  const groups: SettingsListGroup<T>[] = []

  for (const group of SETTINGS_LIST_GROUPS) {
    const grouped: T[] = []
    for (const key of group.keys) {
      const item = remaining.get(key)
      if (!item) continue
      grouped.push(item)
      remaining.delete(key)
      if (group.id === 'extensions' && key === 'plugins') {
        for (const child of items) {
          if (child.parent !== key || !remaining.has(child.key)) continue
          grouped.push(child)
          remaining.delete(child.key)
        }
      }
    }
    if (grouped.length) groups.push({ id: group.id, items: grouped })
  }

  const extras = [...remaining.values()].filter((item) => !['cloud', 'plugins'].includes(item.parent || ''))
  if (!extras.length) return groups

  let admin = groups.find((group) => group.id === 'admin')
  if (!admin) {
    admin = { id: 'admin', items: [] }
    groups.push(admin)
  }
  const updateIndex = admin.items.findIndex((item) => item.key === 'update')
  if (updateIndex === -1) admin.items.push(...extras)
  else admin.items.splice(updateIndex, 0, ...extras)
  return groups
}

export function cloudSettingsTarget(activeProviderId?: string | null) {
  const id = activeProviderId?.trim()
  return id ? `extension:${id}` : 'cloud'
}

export function settingsSidebarActive(itemKey: string, section: string, extensionParent?: string) {
  return itemKey === section || (itemKey === 'cloud' && extensionParent === 'cloud')
}

export function settingsSidebarGroupActive(itemKey: string, section: string, extensionParent?: string) {
  return section.startsWith('extension:') && itemKey === extensionParent && itemKey !== 'cloud'
}

export function settingsBackTarget(section: string, parent?: string) {
  if (isSettingsIndex(section)) return null
  if (parent === 'cloud' || parent === 'plugins') return parent
  return SETTINGS_INDEX
}
