<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, shallowRef, useTemplateRef, watch } from 'vue'
import { Copy, Ellipsis, Minus, Square } from '@lucide/vue'
import { t } from '@/i18n/runtime'
import { readSafeAreaInsets } from '@/lib/fullscreen-inset'
import { clampOverlayPosition, resizeAnchoredBox, type OverlayResizeHandle } from '@/lib/overlay-drag'
import { useOverlayMount } from '@/composables/useOverlayMount'
import ConsoleFloatingWindow from '../ConsoleFloatingWindow.vue'
import type { ToolPresentation } from '@/extensions/toolboxRuntime'
const props = withDefaults(defineProps<{
  title: string; presentation: ToolPresentation; width?: number; height?: number; layer: number; active: boolean; sequence: number; childWindowActive?: boolean
  state?: 'normal' | 'maximized' | 'minimized'; ownedModal?: boolean; resizable?: boolean; minimizable?: boolean; maximizable?: boolean
}>(), { state: 'normal', resizable: true, minimizable: true, maximizable: true })
const emit = defineEmits<{ focus: []; close: []; childAttention: []; 'update:state': [state: 'normal' | 'maximized' | 'minimized'] }>()
const overlayTo = useOverlayMount()
const frame = useTemplateRef<InstanceType<typeof ConsoleFloatingWindow>>('frame')
const root = computed(() => frame.value?.element || null)
const viewport = reactive({ width: window.innerWidth, height: window.innerHeight, x: 0, y: 0 })
const box = reactive({ x: props.ownedModal ? (viewport.width - (props.width || 720)) / 2 : 48, y: props.ownedModal ? (viewport.height - (props.height || 480)) / 2 : 64, width: props.width || 720, height: props.height || 480 })
let gesture: { kind: 'move' | OverlayResizeHandle; id: number; x: number; y: number; box: typeof box } | null = null
let stateAnimation: Animation | null = null
const fullLayout = computed(() => props.presentation !== 'window')
const modal = computed(() => fullLayout.value || props.ownedModal)
const maximized = computed(() => !fullLayout.value && props.state === 'maximized')
const menuOpen = shallowRef(false)
const keyboardAction = shallowRef<'move' | 'size' | null>(null)
let keyboardStart: typeof box | null = null
const handles: OverlayResizeHandle[] = ['n', 'e', 's', 'w', 'nw', 'ne', 'se', 'sw']
const style = computed(() => ({
  left: `${viewport.x + (props.presentation === 'drawer' ? Math.max(0, viewport.width - box.width) : fullLayout.value || maximized.value ? 0 : box.x)}px`,
  top: `${viewport.y + (fullLayout.value || maximized.value ? 0 : box.y)}px`,
  width: `${props.presentation === 'fullscreen' || maximized.value ? viewport.width : box.width}px`,
  height: `${fullLayout.value || maximized.value ? viewport.height : box.height}px`,
  zIndex: props.layer,
}))
function clamp() {
  box.width = Math.min(Math.max(240, box.width), Math.max(1, viewport.width - (fullLayout.value ? 0 : 16)))
  box.height = Math.min(Math.max(180, box.height), Math.max(1, viewport.height - 16))
  Object.assign(box, clampOverlayPosition(box, box, { left: 0, top: 0, ...viewport }))
}
function updateViewport() {
  const visual = window.visualViewport
  const safe = readSafeAreaInsets()
  Object.assign(viewport, { width: (visual?.width || window.innerWidth) - safe.left - safe.right, height: (visual?.height || window.innerHeight) - safe.top - safe.bottom, x: (visual?.offsetLeft || 0) + safe.left, y: (visual?.offsetTop || 0) + safe.top })
  clamp()
  void nextTick(() => {
    if (document.activeElement instanceof HTMLElement && root.value?.contains(document.activeElement)) {
      document.activeElement.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  })
}
function start(event: PointerEvent, kind: 'move' | OverlayResizeHandle) {
  if (props.childWindowActive || fullLayout.value || event.button !== 0 || (kind !== 'move' && (!props.resizable || maximized.value)) || (kind === 'move' && (event.target as Element).closest('button'))) return
  stateAnimation?.cancel()
  if (maximized.value) {
    box.x = event.clientX - viewport.x - box.width * ((event.clientX - viewport.x) / viewport.width)
    box.y = event.clientY - viewport.y - 20
    clamp()
    emit('update:state', 'normal')
  }
  gesture = { kind, id: event.pointerId, x: event.clientX, y: event.clientY, box: { ...box } }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  event.preventDefault()
}
function move(event: PointerEvent) {
  if (!gesture || event.pointerId !== gesture.id) return
  const dx = event.clientX - gesture.x
  const dy = event.clientY - gesture.y
  if (gesture.kind === 'move') {
    Object.assign(box, clampOverlayPosition({ x: gesture.box.x + dx, y: gesture.box.y + dy }, box, { left: 0, top: 0, ...viewport }))
  } else {
    const x = (gesture.kind.includes('w') ? gesture.box.x : gesture.box.x + gesture.box.width) + dx
    const y = (gesture.kind.includes('n') ? gesture.box.y : gesture.box.y + gesture.box.height) + dy
    Object.assign(box, resizeAnchoredBox(gesture.kind, x, y, gesture.box, Math.min(240, viewport.width - 16), Math.min(180, viewport.height - 16), viewport))
  }
}
function end() { gesture = null }
function keyboardMove(event: KeyboardEvent, resize = false) {
  if (fullLayout.value || maximized.value || props.childWindowActive || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return
  const delta = event.shiftKey ? 1 : 16
  const dx = event.key === 'ArrowLeft' ? -delta : event.key === 'ArrowRight' ? delta : 0
  const dy = event.key === 'ArrowUp' ? -delta : event.key === 'ArrowDown' ? delta : 0
  if (resize) { box.width += dx; box.height += dy } else { box.x += dx; box.y += dy }
  clamp()
  event.preventDefault()
  event.stopPropagation()
}
function keydown(event: KeyboardEvent) {
  if (props.childWindowActive) {
    if (event.altKey && event.key === 'F4') { event.preventDefault(); event.stopPropagation(); emit('close') }
    else { event.preventDefault(); event.stopPropagation(); emit('childAttention') }
    return
  }
  if (event.altKey && event.code === 'Space' && !fullLayout.value) { menuOpen.value = !menuOpen.value; event.preventDefault(); event.stopPropagation(); return }
  if (keyboardAction.value) {
    if (event.key === 'Escape' || event.key === 'Enter') {
      if (event.key === 'Escape' && keyboardStart) Object.assign(box, keyboardStart)
      keyboardAction.value = null
      event.preventDefault(); event.stopPropagation(); return
    }
    keyboardMove(event, keyboardAction.value === 'size')
    return
  }
  if (event.altKey && event.key === 'F4') { event.preventDefault(); event.stopPropagation(); emit('close'); return }
  if (menuOpen.value && event.key === 'Escape') { menuOpen.value = false; event.preventDefault(); event.stopPropagation(); return }
  if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); event.stopPropagation(); emit('close') }
  if (event.key !== 'Tab' || !modal.value || !root.value) return
  const items = [...root.value.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"], a[href]')].filter(e => e.getClientRects().length)
  const first = items[0]
  const last = items.at(-1)
  if (event.shiftKey && (document.activeElement === first || document.activeElement === root.value)) { last?.focus(); event.preventDefault() }
  else if (!event.shiftKey && document.activeElement === last) { first?.focus(); event.preventDefault() }
}
function guardParent(event: Event) {
  if (!props.childWindowActive) return
  // Closing the parent remains available; prevent its button from taking focus.
  if (event.target instanceof Element && event.target.closest('.console-window-button')) {
    if (event.type === 'pointerdown') event.preventDefault()
    return
  }
  event.preventDefault()
  event.stopImmediatePropagation()
  if (event.type === 'pointerdown' || event.type === 'focusin') emit('childAttention')
}
watch(() => props.childWindowActive, blocked => {
  if (blocked) { menuOpen.value = false; keyboardAction.value = null; end() }
})
const options = computed(() => [
  { key: 'restore', label: t('toolbox.restoreWindow'), disabled: !maximized.value },
  { key: 'move', label: t('toolbox.move'), disabled: maximized.value },
  { key: 'size', label: t('toolbox.size'), disabled: maximized.value || !props.resizable },
  { key: 'minimize', label: t('toolbox.minimizeWindow'), disabled: !props.minimizable || props.ownedModal },
  { key: 'maximize', label: t('toolbox.maximizeWindow'), disabled: maximized.value || !props.maximizable },
  { type: 'divider', key: 'layout-divider' },
  { key: 'center', label: t('toolbox.center') },
  { key: 'grow', label: t('toolbox.grow'), disabled: maximized.value || !props.resizable },
  { key: 'shrink', label: t('toolbox.shrink'), disabled: maximized.value || !props.resizable },
  { type: 'divider', key: 'close-divider' },
  { key: 'close', label: t('common.close', 'Close') },
])
function arrange(action: string) {
  menuOpen.value = false
  if (action === 'close') { emit('close'); return }
  if (action === 'maximize' || action === 'restore' || action === 'minimize') {
    emit('update:state', action === 'maximize' ? 'maximized' : action === 'minimize' ? 'minimized' : 'normal')
    return
  }
  if (action === 'move' || action === 'size') {
    keyboardStart = { ...box }; keyboardAction.value = action
    root.value?.focus(); return
  }
  if (action === 'center') {
    if (maximized.value) emit('update:state', 'normal')
    box.x = (viewport.width - box.width) / 2; box.y = (viewport.height - box.height) / 2
  }
  else { const delta = action === 'grow' ? 64 : -64; box.width += delta; box.height += delta }
  clamp()
}
watch(() => [props.active, props.sequence], async () => {
  if (!props.active || props.childWindowActive) return
  await nextTick()
  if (!root.value?.contains(document.activeElement)) root.value?.focus()
})
watch(maximized, async () => {
  const element = root.value
  if (!element || gesture || fullLayout.value || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const before = { left: element.style.left, top: element.style.top, width: element.style.width, height: element.style.height }
  stateAnimation?.cancel()
  await nextTick()
  if (!element.isConnected || gesture) return
  const after = { left: element.style.left, top: element.style.top, width: element.style.width, height: element.style.height }
  const animation = element.animate([before, after], { duration: 200, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' })
  stateAnimation = animation
  void animation.finished.then(() => { if (stateAnimation === animation) stateAnimation = null }, () => undefined)
})
function applyRequestedSize() {
  if (fullLayout.value) return
  const width = props.width || 720
  const height = props.height || 480
  box.x += (box.width - width) / 2
  box.y += (box.height - height) / 2
  box.width = width
  box.height = height
  clamp()
}
watch(() => props.presentation, () => {
  updateViewport()
  applyRequestedSize()
})
function toggleMaximize(event?: MouseEvent) {
  if (fullLayout.value || !props.maximizable || props.childWindowActive) return
  if (event && (!(event.target instanceof Element) || !event.target.closest('.display-status-titlebar') || event.target.closest('button'))) return
  emit('update:state', maximized.value ? 'normal' : 'maximized')
}
function getBounds() {
  if (!root.value?.getClientRects().length) return null
  const rect = root.value.getBoundingClientRect()
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
}
function setBounds(bounds: Partial<{ x: number; y: number; width: number; height: number }>) {
  if (props.childWindowActive) { emit('childAttention'); return false }
  if (fullLayout.value) return false
  for (const name of ['x', 'y', 'width', 'height'] as const) {
    if (bounds[name] !== undefined && !Number.isFinite(bounds[name])) throw new TypeError(`Invalid window ${name}`)
  }
  if (maximized.value) emit('update:state', 'normal')
  if (bounds.x !== undefined) box.x = bounds.x - viewport.x
  if (bounds.y !== undefined) box.y = bounds.y - viewport.y
  if (bounds.width !== undefined) box.width = bounds.width
  if (bounds.height !== undefined) box.height = bounds.height
  clamp()
  return true
}
defineExpose({ element: root, focus: () => root.value?.focus(), getBounds, setBounds })
watch(() => [props.width, props.height], applyRequestedSize)
onMounted(() => {
  updateViewport()
  if (props.active) root.value?.focus()
  window.addEventListener('resize', updateViewport)
  window.visualViewport?.addEventListener('resize', updateViewport)
  window.visualViewport?.addEventListener('scroll', updateViewport)
})
onBeforeUnmount(() => {
  stateAnimation?.cancel()
  window.removeEventListener('resize', updateViewport)
  window.visualViewport?.removeEventListener('resize', updateViewport)
  window.visualViewport?.removeEventListener('scroll', updateViewport)
})
</script>
<template>
  <div class="tool-window-layer">
    <div v-if="presentation === 'drawer'" class="tool-drawer-mask" :style="{ zIndex: layer - 1 }" @click="emit('close')" />
    <ConsoleFloatingWindow ref="frame" :title="title" :animate="false" :draggable="!fullLayout && !childWindowActive" :title-tabindex="fullLayout || childWindowActive ? undefined : 0" :title-label="`${title}: ${t('toolbox.moveWindow')}`" header-class="tool-window-header" class="tool-window" :class="[presentation, { active, maximized }]" :style="style" :aria-modal="modal || undefined" tabindex="-1" data-toolbox-local @pointerdown.capture="guardParent" @click.capture="guardParent" @focusin.capture="guardParent" @pointerdown="emit('focus')" @focusin="!active && emit('focus')" @dblclick="toggleMaximize" @keydown="keydown" @close="emit('close')" @header-pointerdown="start($event, 'move')" @header-pointermove="move" @header-pointerup="end" @header-pointercancel="end" @title-keydown="keyboardMove($event)">
      <template #actions>
        <n-button v-if="!fullLayout && minimizable && !ownedModal" quaternary circle size="tiny" :aria-label="t('toolbox.minimizeWindow')" @click="emit('update:state', 'minimized')"><template #icon><Minus /></template></n-button>
        <n-button v-if="!fullLayout && maximizable" quaternary circle size="tiny" :aria-label="t(maximized ? 'toolbox.restoreWindow' : 'toolbox.maximizeWindow')" @click="toggleMaximize()"><template #icon><Copy v-if="maximized" /><Square v-else /></template></n-button>
        <n-dropdown v-if="!fullLayout" :options="options" :show="menuOpen" trigger="click" placement="bottom-end" @update:show="menuOpen = $event" @select="arrange" :to="overlayTo" :z-index="4000" scrollable :menu-props="() => ({ 'data-toolbox-local': '', class: 'tool-window-menu', style: { maxHeight: 'calc(100dvh - 16px)', maxWidth: 'calc(100vw - 16px)' } })">
          <n-button quaternary circle size="tiny" :aria-label="t('toolbox.arrange')"><template #icon><Ellipsis /></template></n-button>
        </n-dropdown>
      </template>
      <div class="tool-window-content" :inert="childWindowActive"><slot /></div>
      <button v-for="handle in !fullLayout && !maximized && resizable && !childWindowActive ? handles : []" :key="handle" type="button" class="tool-resize" :class="`tool-resize-${handle}`" :tabindex="handle === 'se' ? 0 : -1" :aria-label="t('toolbox.resizeWindow')" @pointerdown="start($event, handle)" @pointermove="move" @pointerup="end" @pointercancel="end" @lostpointercapture="end" @keydown="keyboardMove($event, true)">
        <svg v-if="handle === 'se'" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M5 17 17 5M10 17l7-7M15 17l2-2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
      </button>
    </ConsoleFloatingWindow>
  </div>
</template>
<style scoped>
.tool-window-layer { position: absolute; inset: 0; pointer-events: none; }
.tool-window { position: absolute; display: flex; flex-direction: column; pointer-events: auto; color: var(--foreground); border: 1px solid var(--border-strong); box-sizing: border-box; overflow: hidden; }
.tool-window:focus-visible { outline: none; }
.tool-window.fullscreen, .tool-window.drawer { border-radius: 0; }
.tool-window.maximized { border-radius: 0; }
.tool-window:not(.active) :deep(.console-floating-title) { color: var(--onekvm-text-tertiary); }
.tool-window-header { flex-shrink: 0; }
.drawer .tool-window-header, .fullscreen .tool-window-header { cursor: default; }
.tool-window :focus-visible { outline: 2px solid var(--ring); outline-offset: -2px; }
.tool-window :deep(.n-input :is(input, textarea):focus-visible) { outline: none; }
.tool-window-content { flex: 1; min-height: 0; overflow: auto; padding: 16px; overscroll-behavior: contain; scroll-padding: 16px; }
.tool-resize { position: absolute; display: grid; place-items: end; padding: 0; border: 0; color: var(--muted-foreground, currentColor); background: transparent; touch-action: none; }
.tool-resize-n, .tool-resize-s { left: 16px; right: 16px; height: 5px; cursor: ns-resize; }
.tool-resize-n { top: 0; } .tool-resize-s { bottom: 0; }
.tool-resize-e, .tool-resize-w { top: 16px; bottom: 16px; width: 5px; cursor: ew-resize; }
.tool-resize-e { right: 0; } .tool-resize-w { left: 0; }
.tool-resize-nw, .tool-resize-ne, .tool-resize-sw, .tool-resize-se { width: 16px; height: 16px; }
.tool-resize-nw { left: 0; top: 0; cursor: nwse-resize; } .tool-resize-ne { right: 0; top: 0; cursor: nesw-resize; }
.tool-resize-sw { left: 0; bottom: 0; cursor: nesw-resize; } .tool-resize-se { right: 0; bottom: 0; cursor: nwse-resize; width: 32px; height: 32px; padding: 0 5px 5px 0; }
.tool-resize:hover { color: var(--foreground); }
.tool-drawer-mask { position: absolute; inset: 0; background: rgb(0 0 0 / 35%); pointer-events: auto; }
@media (pointer: coarse) {
  .tool-window-content { padding-bottom: max(16px, env(safe-area-inset-bottom)); }
  .tool-resize-n, .tool-resize-s { height: 10px; left: 24px; right: 24px; }
  .tool-resize-e, .tool-resize-w { width: 10px; top: 24px; bottom: 24px; }
  .tool-resize-nw, .tool-resize-ne, .tool-resize-sw { width: 24px; height: 24px; }
}
</style>
