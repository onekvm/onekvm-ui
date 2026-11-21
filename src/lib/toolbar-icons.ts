import type { ToolbarIconId, ToolbarIconPreference } from '../api/client.ts'

export const TOOLBAR_ICON_IDS = [
  'display',
  'mouse',
  'keyboard',
  'caps_lock',
  'num_lock',
  'scroll_lock',
  'virtual_keyboard',
  'keyboard_text',
  'ctrl_alt_del',
  'gamepad',
  'power',
  'audio',
  'virtual_media',
  'performance',
  'fullscreen',
  'toolbox',
  'notifications',
  'collection',
  'settings',
  'language',
  'account',
] as const satisfies readonly ToolbarIconId[]

const DEVICE_TOOLBAR_ICONS = new Set<ToolbarIconId>([
  'display',
  'mouse',
  'keyboard',
  'caps_lock',
  'num_lock',
  'scroll_lock',
  'virtual_keyboard',
  'keyboard_text',
  'ctrl_alt_del',
  'gamepad',
  'power',
  'audio',
  'virtual_media',
])

export function isToolbarIconId(value: unknown): value is ToolbarIconId {
  return typeof value === 'string' && (TOOLBAR_ICON_IDS as readonly string[]).includes(value)
}

export function isDeviceToolbarIcon(id: ToolbarIconId) {
  return DEVICE_TOOLBAR_ICONS.has(id)
}

export function isKeyboardActionToolbarIcon(id: ToolbarIconId) {
  return id === 'virtual_keyboard' || id === 'keyboard_text' || id === 'ctrl_alt_del'
}

function toolbarIconHiddenByDefault(id: ToolbarIconId) {
  return id === 'caps_lock' || id === 'num_lock' || id === 'scroll_lock' || id === 'notifications' || isKeyboardActionToolbarIcon(id)
}

export function isRootOnlyToolbarIcon(id: string) {
  return id === 'settings' || id === 'collection'
}

export function defaultToolbarIcons(): ToolbarIconPreference[] {
  return TOOLBAR_ICON_IDS.map(id => ({ id, hidden: toolbarIconHiddenByDefault(id), removed: false }))
}

type ToolbarIconInput = readonly { id?: string; hidden?: boolean; removed?: boolean }[] | null | undefined

/** Where an icon appears: on the toolbar, in the collection menu, or nowhere. */
export type ToolbarIconPlacement = 'toolbar' | 'collection' | 'hidden'

/** Keyboard actions stay in the keyboard menu, so they have no collection place. */
export function toolbarIconCollectable(id: ToolbarIconId) {
  return !isKeyboardActionToolbarIcon(id) && !isRootOnlyToolbarIcon(id)
}

export function normalizeToolbarIcons(icons: ToolbarIconInput): ToolbarIconPreference[] {
  const seen = new Set<ToolbarIconId>()
  const device: ToolbarIconPreference[] = []
  const action: ToolbarIconPreference[] = []
  for (const icon of icons ?? []) {
    if (!isToolbarIconId(icon?.id) || seen.has(icon.id)) continue
    seen.add(icon.id)
    const removed = Boolean(icon.removed) && !isRootOnlyToolbarIcon(icon.id)
    const preference = { id: icon.id, hidden: (Boolean(icon.hidden) || removed) && !isRootOnlyToolbarIcon(icon.id), removed }
    if (isDeviceToolbarIcon(icon.id)) device.push(preference)
    else action.push(preference)
  }
  for (const id of TOOLBAR_ICON_IDS) {
    if (seen.has(id)) continue
    const preference = { id, hidden: toolbarIconHiddenByDefault(id), removed: false }
    if (isDeviceToolbarIcon(id)) device.push(preference)
    else if (id === 'collection' || id === 'notifications') {
      // Added icons join the group before the collection and settings, not after the account.
      const before = id === 'notifications' ? ['collection', 'settings'] : ['settings']
      const index = action.findIndex(icon => before.includes(icon.id))
      action.splice(index < 0 ? action.length : index, 0, preference)
    }
    else action.push(preference)
  }
  return [...device, ...action]
}

export function reorderToolbarIcon(
  icons: ToolbarIconInput,
  from: ToolbarIconId,
  to: ToolbarIconId,
) {
  const next = normalizeToolbarIcons(icons)
  if (from === to || isDeviceToolbarIcon(from) !== isDeviceToolbarIcon(to)) return next
  const fromIndex = next.findIndex(icon => icon.id === from)
  const toIndex = next.findIndex(icon => icon.id === to)
  if (fromIndex < 0 || toIndex < 0) return next
  const [item] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, item!)
  return next
}

/** Moves the icon between the toolbar and the collection menu. */
export function setToolbarIconHidden(icons: ToolbarIconInput, id: ToolbarIconId, hidden: boolean) {
  return setToolbarIconPlacement(icons, id, hidden ? 'collection' : 'toolbar')
}

export function setToolbarIconPlacement(icons: ToolbarIconInput, id: ToolbarIconId, placement: ToolbarIconPlacement) {
  if (isRootOnlyToolbarIcon(id)) placement = 'toolbar'
  // A hidden keyboard action is still in the keyboard menu: the same as collected.
  if (placement === 'hidden' && isKeyboardActionToolbarIcon(id)) placement = 'collection'
  return normalizeToolbarIcons(icons).map(icon => (
    icon.id === id ? { ...icon, hidden: placement !== 'toolbar', removed: placement === 'hidden' } : icon
  ))
}

export function toolbarIconPlacement(icons: ToolbarIconInput, id: ToolbarIconId): ToolbarIconPlacement {
  const icon = normalizeToolbarIcons(icons).find(icon => icon.id === id)
  if (!icon?.hidden) return 'toolbar'
  return icon.removed || !toolbarIconCollectable(id) ? 'hidden' : 'collection'
}

export function toolbarIconsEqual(left: ToolbarIconInput, right: ToolbarIconInput) {
  const normalizedLeft = normalizeToolbarIcons(left)
  const normalizedRight = normalizeToolbarIcons(right)
  return normalizedLeft.length === normalizedRight.length
    && normalizedLeft.every((icon, index) => icon.id === normalizedRight[index]?.id
      && icon.hidden === normalizedRight[index]?.hidden && icon.removed === normalizedRight[index]?.removed)
}

/** Not on the toolbar: collected or removed. */
export function toolbarIconHidden(icons: ToolbarIconInput, id: ToolbarIconId) {
  return normalizeToolbarIcons(icons).some(icon => icon.id === id && icon.hidden)
}

/** In neither the toolbar nor the collection menu. */
export function toolbarIconRemoved(icons: ToolbarIconInput, id: ToolbarIconId) {
  return normalizeToolbarIcons(icons).some(icon => icon.id === id && icon.removed)
}

/** Even slots leave the following odd slot for the HDD indicator beside Power. */
export function toolbarIconCssOrder(
  icons: ToolbarIconInput,
  id: ToolbarIconId,
) {
  const index = normalizeToolbarIcons(icons).findIndex(icon => icon.id === id)
  return (Math.max(index, 0) + 1) * 2
}
