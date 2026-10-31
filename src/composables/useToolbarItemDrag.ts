import { h, onBeforeUnmount, onMounted, render, shallowRef } from 'vue'
import { Folder } from '@/icons'
import { toolbarDropBefore } from '@/lib/toolbar-drag-target'
import { isToolbarItem } from '@/lib/toolbar-layout'
import { isRootOnlyToolbarIcon } from '@/lib/toolbar-icons'
import { useToolbarItemPreview } from './useToolbarItemPreview'

export interface ToolbarDrop { folder?: string; before?: string; merge?: string }
export function useToolbarItemDrag(options: {
  enabled: () => boolean
  order: () => string[]
  folderItems: (folder: string) => string[]
  vertical: () => boolean
  openFolder: (folder: string) => void
  canCreateFolder: () => boolean
  commit: (item: string, target: ToolbarDrop) => void
}) {
  const dragging = shallowRef(false)
  const hint = shallowRef<{ mode: 'into' | 'merge'; x: number; y: number } | null>(null)
  const preview = useToolbarItemPreview()
  let active: { id: string; pointer: number; x: number; y: number; source: HTMLElement; ghost: HTMLElement | null; target: ToolbarDrop | null } | null = null
  let marker: HTMLElement | null = null
  let mergeIcon: HTMLElement | null = null
  let folderTimer = 0
  let hoveredFolder = ''
  let clickTimer = 0
  const suppressClick = (event: MouseEvent) => { event.preventDefault(); event.stopImmediatePropagation(); window.removeEventListener('click', suppressClick, true) }
  function suppressNextClick() {
    window.addEventListener('click', suppressClick, true)
    clearTimeout(clickTimer)
    clickTimer = window.setTimeout(() => window.removeEventListener('click', suppressClick, true), 350)
  }
  function finishCanceledGesture(event: PointerEvent) {
    event.preventDefault(); event.stopImmediatePropagation()
    suppressNextClick()
  }
  function clearMarker() {
    if (mergeIcon) { render(null, mergeIcon); mergeIcon.remove(); mergeIcon = null }
    marker?.classList.remove('is-toolbar-drop-target')
    marker?.removeAttribute('data-toolbar-drop-mode')
    marker = null
  }
  function cancel() {
    active?.ghost?.remove()
    active?.source.classList.remove('is-toolbar-item-dragging')
    active = null
    dragging.value = false
    hint.value = null
    preview.clear()
    clearMarker()
    clearTimeout(folderTimer)
    hoveredFolder = ''
    window.removeEventListener('pointermove', move, true)
    window.removeEventListener('pointerup', end, true)
    window.removeEventListener('pointercancel', cancel, true)
    window.removeEventListener('keydown', keydown, true)
  }
  function keydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !active) return
    event.preventDefault(); event.stopImmediatePropagation()
    window.addEventListener('click', suppressClick, true)
    clearTimeout(clickTimer)
    window.addEventListener('pointerup', finishCanceledGesture, { capture: true, once: true })
    cancel()
  }
  function start(event: PointerEvent) {
    if (!event.shiftKey || event.button !== 0 || !event.isPrimary || !options.enabled() || active) return
    const source = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-toolbar-item]') : null
    if (!source || !source.closest('[data-toolbar-surface]')) return
    event.preventDefault(); event.stopImmediatePropagation()
    active = { id: source.dataset.toolbarItem!, pointer: event.pointerId, x: event.clientX, y: event.clientY, source, ghost: null, target: null }
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', end, true)
    window.addEventListener('pointercancel', cancel, true)
    window.addEventListener('keydown', keydown, true)
  }
  function move(event: PointerEvent) {
    if (!active || event.pointerId !== active.pointer) return
    event.preventDefault(); event.stopImmediatePropagation()
    if (!active.ghost && Math.hypot(event.clientX - active.x, event.clientY - active.y) < 5) return
    if (!active.ghost) {
      const rect = active.source.getBoundingClientRect()
      const ghost = active.source.cloneNode(true) as HTMLElement
      ghost.removeAttribute('data-toolbar-item'); ghost.setAttribute('aria-hidden', 'true'); ghost.inert = true
      ghost.classList.add('toolbar-item-drag-ghost')
      Object.assign(ghost.style, { position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, margin: '0', pointerEvents: 'none', zIndex: '6000', order: '0' })
      ;(document.fullscreenElement || document.body).append(ghost)
      active.ghost = ghost
      active.source.classList.add('is-toolbar-item-dragging')
      dragging.value = true
      if (document.pointerLockElement) void document.exitPointerLock()
    }
    active.ghost.style.transform = `translate(${event.clientX - active.x}px, ${event.clientY - active.y}px)`
    const hit = document.elementFromPoint(event.clientX, event.clientY)
    const surface = hit?.closest<HTMLElement>('[data-toolbar-surface]')
    const folderList = hit?.closest<HTMLElement>('[data-toolbar-folder-list]')
    const direction = surface ? preview.direction(surface, Boolean(folderList) || options.vertical()) : 'horizontal'
    const vertical = direction === 'vertical'
    const item = surface ? preview.hit(surface, event.clientX, event.clientY, direction) : null
    clearMarker()
    active.target = null
    let folder = ''
    let mode = 'before'
    if (item && item !== active.source) {
      const id = item.dataset.toolbarItem!
      const rect = preview.bounds(item)
      const ratio = vertical ? (event.clientY - rect.top) / rect.height : (event.clientX - rect.left) / rect.width
      const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom
      if (inside && id.startsWith('folder:') && isToolbarItem(active.id) && !isRootOnlyToolbarIcon(active.id) && ratio > .25 && ratio < .75) {
        folder = id.slice(7)
        active.target = { folder }
        mode = 'into'
      } else if (inside && !folderList && isToolbarItem(id) && !isRootOnlyToolbarIcon(id) && isToolbarItem(active.id) && !isRootOnlyToolbarIcon(active.id) && ratio > .3 && ratio < .7 && options.canCreateFolder()) {
        active.target = { merge: id }
        mode = 'merge'
      } else {
        const parent = folderList?.dataset.toolbarFolderList
        if (!parent || (isToolbarItem(active.id) && !isRootOnlyToolbarIcon(active.id))) {
          const order = parent ? options.folderItems(parent) : options.order()
          const next = toolbarDropBefore(order, new Set(preview.items(surface!)), active.id, id, ratio > .5)
          active.target = { folder: parent, before: next }
          mode = ratio > .5 ? 'after' : 'before'
        }
      }
      if (active.target) marker = item
    } else if (!item && folderList && isToolbarItem(active.id) && !isRootOnlyToolbarIcon(active.id)) {
      active.target = { folder: folderList.dataset.toolbarFolderList }
      marker = folderList
      mode = 'into'
    }
    if (marker) { marker.classList.add('is-toolbar-drop-target'); marker.dataset.toolbarDropMode = mode }
    active.ghost.style.visibility = active.target?.merge ? 'hidden' : ''
    if (marker && mode === 'merge') {
      const icon = marker.querySelector('.n-button__icon')
      if (icon) {
        mergeIcon = document.createElement('span')
        mergeIcon.className = 'toolbar-item-merge-icon'
        mergeIcon.setAttribute('aria-hidden', 'true')
        icon.append(mergeIcon)
        render(h(Folder), mergeIcon)
      }
    }
    if (active.target && mode !== 'into' && mode !== 'merge') {
      preview.preview(active.source, marker?.closest<HTMLElement>('[data-toolbar-surface]') ?? null, active.target.before, options.vertical())
    } else preview.reset()
    hint.value = active.target && (mode === 'into' || mode === 'merge')
      ? { mode, x: Math.max(100, Math.min(window.innerWidth - 100, event.clientX)), y: event.clientY < 76 ? event.clientY + 42 : event.clientY - 44 }
      : null
    if (folder !== hoveredFolder) {
      clearTimeout(folderTimer)
      hoveredFolder = folder
      if (folder) folderTimer = window.setTimeout(() => options.openFolder(folder), 450)
    }
  }
  function end(event: PointerEvent) {
    if (!active || event.pointerId !== active.pointer) return
    event.preventDefault(); event.stopImmediatePropagation()
    if (active.ghost) move(event)
    const item = active.id
    const target = active.target
    const moved = dragging.value
    const before = moved ? preview.capture() : null
    cancel()
    suppressNextClick()
    if (moved && target && options.enabled()) {
      options.commit(item, target)
      if (before) void preview.settle(before)
    }
  }
  onMounted(() => { window.addEventListener('pointerdown', start, true); window.addEventListener('blur', cancel) })
  onBeforeUnmount(() => {
    cancel(); clearTimeout(clickTimer)
    window.removeEventListener('pointerdown', start, true); window.removeEventListener('blur', cancel)
    window.removeEventListener('pointerup', finishCanceledGesture, true)
    window.removeEventListener('click', suppressClick, true)
  })
  return { dragging, hint, cancel }
}
