import type { ToolbarFolder, ToolbarIconPreference, ToolbarLabelPosition } from '../api/client.ts'
import { isDeviceToolbarIcon, isToolbarIconId, normalizeToolbarIcons } from './toolbar-icons.ts'

// Icon sets may register additional names; rendering falls back to Folder when
// the selected set does not provide a glyph.
export const validToolbarFolderIcon = (value: unknown): value is string => typeof value === 'string'
  && value.length <= 64 && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/i.test(value)
export const isToolbarSeparator = (value: unknown): value is string => typeof value === 'string' && /^separator:[a-z0-9_-]{1,64}$/.test(value)
const defaultSeparators = new Set(['separator:controls', 'separator:tools', 'separator:account'])
export function visibleToolbarSeparators(order: readonly string[], visibleItems: ReadonlySet<string>) {
  const shown = new Set<string>()
  let hasItem = false
  let pending = ''
  for (const id of order) {
    if (isToolbarSeparator(id)) {
      if (!defaultSeparators.has(id)) { shown.add(id); pending = ''; hasItem = false }
      else if (hasItem && !pending) pending = id
    } else if (visibleItems.has(id)) {
      if (pending) shown.add(pending)
      pending = ''
      hasItem = true
    }
  }
  return order.filter(id => shown.has(id))
}
export const MAX_TOOLBAR_FOLDERS = 32
export interface ToolbarLayout {
  toolbar_icons?: ToolbarIconPreference[]
  toolbar_folders?: ToolbarFolder[]
  toolbar_order?: string[]
  toolbar_show_labels?: boolean
  toolbar_label_position?: ToolbarLabelPosition
}
const validToolItem = (value: string) => /^tool:[a-z0-9_-]{1,64}\/[a-z0-9_-]{1,64}$/.test(value)
export const isToolbarItem = (value: unknown): value is string => typeof value === 'string' && (isToolbarIconId(value) || validToolItem(value))

export function normalizeToolbarFolders(value: readonly ToolbarFolder[] | null | undefined): ToolbarFolder[] {
  const ids = new Set<string>()
  const members = new Set<string>()
  return (value ?? []).filter(folder => folder && /^[a-z0-9_-]{1,64}$/.test(folder.id) && !ids.has(folder.id) && Boolean(ids.add(folder.id)))
    .slice(0, MAX_TOOLBAR_FOLDERS).map(folder => ({
      id: folder.id,
      name: typeof folder.name === 'string' ? folder.name.trim() : '',
      icon: validToolbarFolderIcon(folder.icon) ? folder.icon : 'Folder',
      items: (Array.isArray(folder.items) ? folder.items : []).slice(0, 256)
        .filter(item => item !== 'settings' && isToolbarItem(item) && !members.has(item) && Boolean(members.add(item))),
    }))
}

export function toolbarFolderFor(folders: readonly ToolbarFolder[], item: string) {
  return folders.find(folder => folder.items.includes(item))
}

export function toolbarLayoutOrder(layout: ToolbarLayout, pinnedToolIds: readonly string[] = []) {
  const folders = normalizeToolbarFolders(layout.toolbar_folders)
  const icons = normalizeToolbarIcons(layout.toolbar_icons)
  const defaults = [
    ...icons.filter(icon => isDeviceToolbarIcon(icon.id)).map(icon => icon.id),
    'separator:controls',
    ...pinnedToolIds.map(id => `tool:${id}`),
    ...folders.map(folder => `folder:${folder.id}`),
    ...(pinnedToolIds.length || folders.length ? ['separator:tools'] : []),
    ...icons.filter(icon => !isDeviceToolbarIcon(icon.id)).flatMap(icon => icon.id === 'account' ? ['separator:account', icon.id] : [icon.id]),
  ]
  const valid = (id: unknown): id is string => isToolbarItem(id) || isToolbarSeparator(id)
    || (typeof id === 'string' && folders.some(folder => `folder:${folder.id}` === id))
  return [...new Set(layout.toolbar_order?.length
    ? [...layout.toolbar_order.filter(valid), ...defaults.filter(id => !isToolbarSeparator(id))]
    : defaults)]
}

export function upsertToolbarFolder<T extends ToolbarLayout>(layout: T, folder: ToolbarFolder): T {
  const folders = normalizeToolbarFolders(layout.toolbar_folders)
  const next = { ...folder, items: folder.items.filter(item => item !== 'settings' && isToolbarItem(item)) }
  const index = folders.findIndex(item => item.id === next.id)
  if (index < 0 && folders.length >= MAX_TOOLBAR_FOLDERS) return layout
  const transferred = folders.map(item => ({ ...item, items: item.items.filter(id => !next.items.includes(id)) }))
  if (index < 0) transferred.push(next)
  else transferred[index] = next
  return {
    ...layout,
    toolbar_folders: normalizeToolbarFolders(transferred),
    toolbar_icons: normalizeToolbarIcons(layout.toolbar_icons).map(icon => next.items.includes(icon.id) ? { ...icon, hidden: false } : icon),
  }
}

export function removeToolbarFolder<T extends ToolbarLayout>(layout: T, id: string): T {
  return { ...layout, toolbar_folders: normalizeToolbarFolders(layout.toolbar_folders).filter(folder => folder.id !== id), toolbar_order: (layout.toolbar_order ?? []).filter(item => item !== `folder:${id}`) }
}

export function groupToolbarItems<T extends ToolbarLayout>(layout: T, item: string, other: string, folder: ToolbarFolder, rootOrder = toolbarLayoutOrder(layout)): T {
  if (item === other || item === 'settings' || other === 'settings' || !isToolbarItem(item) || !isToolbarItem(other)) return layout
  if (normalizeToolbarFolders(layout.toolbar_folders).length >= MAX_TOOLBAR_FOLDERS) return layout
  const grouped = upsertToolbarFolder(layout, { ...folder, items: [other, item] })
  const order = rootOrder.filter(id => id !== item)
  order.splice(Math.max(0, order.indexOf(other)), 0, `folder:${folder.id}`)
  return { ...grouped, toolbar_order: order }
}

export function moveToolbarItem<T extends ToolbarLayout>(
  layout: T, item: string, target: { folder?: string; before?: string }, rootOrder = toolbarLayoutOrder(layout),
): T {
  if (item === target.before || (item === 'settings' && target.folder)) return layout
  const folders = normalizeToolbarFolders(layout.toolbar_folders)
  if (!isToolbarItem(item) && !isToolbarSeparator(item) && !folders.some(folder => `folder:${folder.id}` === item)) return layout
  if (target.folder && (!isToolbarItem(item) || !folders.some(folder => folder.id === target.folder))) return layout
  for (const folder of folders) folder.items = folder.items.filter(id => id !== item)
  if (target.folder) {
    const folder = folders.find(folder => folder.id === target.folder)!
    const index = target.before ? folder.items.indexOf(target.before) : -1
    folder.items.splice(index < 0 ? folder.items.length : index, 0, item)
    return {
      ...layout, toolbar_folders: folders,
      toolbar_icons: normalizeToolbarIcons(layout.toolbar_icons).map(icon => icon.id === item ? { ...icon, hidden: false } : icon),
    }
  }
  const order = rootOrder.filter(id => id !== item)
  const index = target.before ? order.indexOf(target.before) : -1
  order.splice(index < 0 ? order.length : index, 0, item)
  return { ...layout, toolbar_folders: folders, toolbar_order: order }
}

export function syncToolbarIconOrder(order: readonly string[] | undefined, icons: readonly ToolbarIconPreference[]) {
  if (!order?.length) return []
  const next = [...order]
  for (const device of [true, false]) {
    const ids = icons.filter(icon => isDeviceToolbarIcon(icon.id) === device && order.includes(icon.id)).map(icon => icon.id)
    const positions = order.flatMap((id, index) => isToolbarIconId(id) && isDeviceToolbarIcon(id) === device ? [index] : [])
    positions.forEach((position, index) => { next[position] = ids[index]! })
  }
  return next
}
