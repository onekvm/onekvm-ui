import { computed, h, shallowRef } from 'vue'
import type { DropdownOption } from 'naive-ui'
import { Captions, Check, Ellipsis, Eye, EyeOff, FolderPlus, LockKeyhole, Minus, Pencil, Trash2 } from '@/icons'
import { t } from '@/i18n/runtime'
import { isToolbarSeparator } from '@/lib/toolbar-layout'
import type { ToolbarIconPlacement } from '@/lib/toolbar-icons'

const lockKey = 'onekvm.toolbar.locked'
export function useToolbarContextMenu(options: {
  canArrange: () => boolean
  canCreateFolder: () => boolean
  createFolder: () => void
  editFolder: (id: string) => void
  removeFolder: (id: string) => void
  addSeparator: (before?: string) => void
  removeSeparator: (id: string) => void
  /** Where the item appears; undefined when it cannot be moved off the toolbar. */
  iconPlacement: (id: string) => ToolbarIconPlacement | undefined
  /** Whether the item can go into the collection menu. */
  iconCollectable: (id: string) => boolean
  setIconPlacement: (id: string, placement: ToolbarIconPlacement) => void
  /** Whether the item shows its text; undefined when it has none. */
  itemLabel: (id: string) => boolean | undefined
  setItemLabel: (id: string, show: boolean) => void
}) {
  const locked = shallowRef(localStorage.getItem(lockKey) === '1')
  const show = shallowRef(false)
  const position = shallowRef({ x: 0, y: 0 })
  const item = shallowRef('')
  const inMenu = shallowRef(false)
  const glyph = (icon: typeof Check) => () => h(icon, { size: 16 })
  const menuOptions = computed<DropdownOption[]>(() => {
    const placement = item.value ? options.iconPlacement(item.value) : undefined
    const hidden = placement === undefined ? undefined : placement !== 'toolbar'
    const disabled = locked.value || !options.canArrange()
    const visibility: DropdownOption[] = []
    if (placement !== undefined) {
      if (placement !== 'toolbar') visibility.push({ key: 'show', label: t('toolbar.showIcon', 'Show on toolbar'), icon: glyph(Eye), disabled })
      if (placement === 'toolbar' && options.iconCollectable(item.value)) {
        visibility.push({ key: 'collect', label: t('toolbar.collectIcon', 'Move to collection'), icon: glyph(Ellipsis), disabled })
      }
      if (placement !== 'hidden') visibility.push({ key: 'hide', label: t('toolbar.hideIcon', 'Hide icon'), icon: glyph(EyeOff), disabled })
    }
    const label = inMenu.value || hidden ? undefined : options.itemLabel(item.value)
    if (label !== undefined) {
      visibility.push({ key: 'label', label: label ? t('toolbar.hideLabel', 'Hide text') : t('toolbar.showLabel', 'Show text'), icon: glyph(Captions), disabled })
    }
    if (visibility.length) visibility.push({ type: 'divider', key: 'visibility-divider' })
    const lock: DropdownOption = { key: 'lock', label: locked.value ? t('toolbar.unlock', 'Unlock toolbar') : t('toolbar.lock', 'Lock toolbar'), icon: glyph(locked.value ? Check : LockKeyhole) }
    // Separators and folders only apply to items on the toolbar itself.
    if (hidden || inMenu.value) return [...visibility, lock]
    return [
      ...visibility,
      lock,
      { type: 'divider', key: 'arrange-divider' },
      { key: 'separator', label: t('toolbar.addSeparator', 'Add separator'), icon: glyph(Minus), disabled: locked.value || !options.canArrange() },
      { key: 'folder', label: t('toolbar.folders.create', 'Create folder'), icon: glyph(FolderPlus), disabled: locked.value || !options.canArrange() || !options.canCreateFolder() },
      ...(item.value.startsWith('folder:') ? [{ key: 'edit', label: t('toolbar.folders.edit', 'Edit folder'), icon: glyph(Pencil), disabled: locked.value || !options.canArrange() }] : []),
      ...(item.value.startsWith('folder:') ? [{ key: 'remove-folder', label: t('toolbar.folders.remove', 'Delete folder'), icon: glyph(Trash2), disabled: locked.value || !options.canArrange() }] : []),
      ...(isToolbarSeparator(item.value) ? [{ key: 'remove', label: t('toolbar.removeSeparator', 'Remove separator'), icon: glyph(Trash2), disabled: locked.value || !options.canArrange() }] : []),
    ]
  })
  function open(event: MouseEvent, from?: { id?: string; menu?: boolean }) {
    if (!(event.target instanceof Element)) return
    event.preventDefault()
    event.stopPropagation()
    if (document.pointerLockElement) void document.exitPointerLock()
    item.value = from?.id ?? event.target.closest<HTMLElement>('[data-toolbar-item]')?.dataset.toolbarItem ?? ''
    inMenu.value = Boolean(from?.menu)
    position.value = { x: event.clientX, y: event.clientY }
    show.value = true
  }
  function select(key: string) {
    show.value = false
    if (key === 'lock') {
      locked.value = !locked.value
      try { localStorage.setItem(lockKey, locked.value ? '1' : '0') } catch { /* Keep the current session usable. */ }
      return
    }
    if (locked.value || !options.canArrange()) return
    const placements: Record<string, ToolbarIconPlacement> = { show: 'toolbar', collect: 'collection', hide: 'hidden' }
    if (placements[key] && options.iconPlacement(item.value) !== undefined) options.setIconPlacement(item.value, placements[key])
    if (key === 'label') {
      const label = options.itemLabel(item.value)
      if (label !== undefined) options.setItemLabel(item.value, !label)
    }
    if (key === 'folder' && options.canCreateFolder()) options.createFolder()
    if (key === 'separator') options.addSeparator(item.value || undefined)
    if (key === 'remove' && isToolbarSeparator(item.value)) options.removeSeparator(item.value)
    if (key === 'edit') options.editFolder(item.value.slice(7))
    if (key === 'remove-folder' && item.value.startsWith('folder:')) options.removeFolder(item.value.slice(7))
  }
  return { locked, show, position, menuOptions, open, select }
}
