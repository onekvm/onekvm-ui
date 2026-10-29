import { computed, h, shallowRef } from 'vue'
import type { DropdownOption } from 'naive-ui'
import { Check, FolderPlus, LockKeyhole, Minus, Pencil, Trash2 } from '@/icons'
import { t } from '@/i18n/runtime'
import { isToolbarSeparator } from '@/lib/toolbar-layout'

const lockKey = 'onekvm.toolbar.locked'
export function useToolbarContextMenu(options: {
  canArrange: () => boolean
  canCreateFolder: () => boolean
  createFolder: () => void
  editFolder: (id: string) => void
  addSeparator: (before?: string) => void
  removeSeparator: (id: string) => void
}) {
  const locked = shallowRef(localStorage.getItem(lockKey) === '1')
  const show = shallowRef(false)
  const position = shallowRef({ x: 0, y: 0 })
  const item = shallowRef('')
  const glyph = (icon: typeof Check) => () => h(icon, { size: 16 })
  const menuOptions = computed<DropdownOption[]>(() => [
    { key: 'lock', label: locked.value ? t('toolbar.unlock', 'Unlock toolbar') : t('toolbar.lock', 'Lock toolbar'), icon: glyph(locked.value ? Check : LockKeyhole) },
    { type: 'divider', key: 'arrange-divider' },
    { key: 'separator', label: t('toolbar.addSeparator', 'Add separator'), icon: glyph(Minus), disabled: locked.value || !options.canArrange() },
    { key: 'folder', label: t('toolbar.folders.create', 'Create folder'), icon: glyph(FolderPlus), disabled: locked.value || !options.canArrange() || !options.canCreateFolder() },
    ...(item.value.startsWith('folder:') ? [{ key: 'edit', label: t('toolbar.folders.edit', 'Edit folder'), icon: glyph(Pencil), disabled: locked.value || !options.canArrange() }] : []),
    ...(isToolbarSeparator(item.value) ? [{ key: 'remove', label: t('toolbar.removeSeparator', 'Remove separator'), icon: glyph(Trash2), disabled: locked.value || !options.canArrange() }] : []),
  ])
  function open(event: MouseEvent) {
    if (!(event.target instanceof Element)) return
    event.preventDefault()
    event.stopPropagation()
    if (document.pointerLockElement) void document.exitPointerLock()
    item.value = event.target.closest<HTMLElement>('[data-toolbar-item]')?.dataset.toolbarItem ?? ''
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
    if (key === 'folder' && options.canCreateFolder()) options.createFolder()
    if (key === 'separator') options.addSeparator(item.value || undefined)
    if (key === 'remove' && isToolbarSeparator(item.value)) options.removeSeparator(item.value)
    if (key === 'edit') options.editFolder(item.value.slice(7))
  }
  return { locked, show, position, menuOptions, open, select }
}
