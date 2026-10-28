import type { ToolbarIconId, ToolbarIconPreference } from '../api/client.ts'

export const TOOLBAR_ICON_IDS = [
  'display',
  'mouse',
  'keyboard',
  'gamepad',
  'power',
  'audio',
  'virtual_media',
  'performance',
  'fullscreen',
  'toolbox',
  'settings',
  'language',
  'account',
] as const satisfies readonly ToolbarIconId[]

const DEVICE_TOOLBAR_ICONS = new Set<ToolbarIconId>([
  'display',
  'mouse',
  'keyboard',
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

export function defaultToolbarIcons(): ToolbarIconPreference[] {
  return TOOLBAR_ICON_IDS.map(id => ({ id, hidden: false }))
}

export function normalizeToolbarIcons(
  icons: readonly { id?: string; hidden?: boolean }[] | null | undefined,
): ToolbarIconPreference[] {
  const seen = new Set<ToolbarIconId>()
  const device: ToolbarIconPreference[] = []
  const action: ToolbarIconPreference[] = []
  for (const icon of icons ?? []) {
    if (!isToolbarIconId(icon?.id) || seen.has(icon.id)) continue
    seen.add(icon.id)
    const preference = { id: icon.id, hidden: Boolean(icon.hidden) && icon.id !== 'settings' }
    if (isDeviceToolbarIcon(icon.id)) device.push(preference)
    else action.push(preference)
  }
  for (const id of TOOLBAR_ICON_IDS) {
    if (seen.has(id)) continue
    const preference = { id, hidden: false }
    if (isDeviceToolbarIcon(id)) device.push(preference)
    else action.push(preference)
  }
  return [...device, ...action]
}

export function reorderToolbarIcon(
  icons: readonly { id?: string; hidden?: boolean }[] | null | undefined,
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

export function setToolbarIconHidden(
  icons: readonly { id?: string; hidden?: boolean }[] | null | undefined,
  id: ToolbarIconId,
  hidden: boolean,
) {
  return normalizeToolbarIcons(icons).map(icon => (
    icon.id === id ? { ...icon, hidden: hidden && id !== 'settings' } : icon
  ))
}

export function toolbarIconsEqual(
  left: readonly { id?: string; hidden?: boolean }[] | null | undefined,
  right: readonly { id?: string; hidden?: boolean }[] | null | undefined,
) {
  const normalizedLeft = normalizeToolbarIcons(left)
  const normalizedRight = normalizeToolbarIcons(right)
  return normalizedLeft.length === normalizedRight.length
    && normalizedLeft.every((icon, index) => icon.id === normalizedRight[index]?.id && icon.hidden === normalizedRight[index]?.hidden)
}

export function toolbarIconHidden(
  icons: readonly { id?: string; hidden?: boolean }[] | null | undefined,
  id: ToolbarIconId,
) {
  return normalizeToolbarIcons(icons).some(icon => icon.id === id && icon.hidden)
}

/** Even slots leave the following odd slot for the HDD indicator beside Power. */
export function toolbarIconCssOrder(
  icons: readonly { id?: string; hidden?: boolean }[] | null | undefined,
  id: ToolbarIconId,
) {
  const index = normalizeToolbarIcons(icons).findIndex(icon => icon.id === id)
  return (Math.max(index, 0) + 1) * 2
}
