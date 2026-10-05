<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { Ellipsis } from '@lucide/vue'
import { t } from '@/i18n/runtime'
import { readSafeAreaInsets } from '@/lib/fullscreen-inset'
import { clampOverlayPosition, resizeAnchoredBox } from '@/lib/overlay-drag'
import ConsoleFloatingWindow from '../ConsoleFloatingWindow.vue'
import type { ToolPresentation } from '@/extensions/toolboxRuntime'
const props = defineProps<{
  title: string; presentation: ToolPresentation; width?: number; height?: number; layer: number; active: boolean; sequence: number
}>()
const emit = defineEmits<{ focus: []; close: [] }>()
const frame = ref<InstanceType<typeof ConsoleFloatingWindow> | null>(null)
const root = computed(() => frame.value?.element || null)
const viewport = reactive({ width: window.innerWidth, height: window.innerHeight, x: 0, y: 0 })
const box = reactive({ x: 48, y: 64, width: props.width || 720, height: props.height || 480 })
let gesture: { kind: 'move' | 'resize'; id: number; x: number; y: number; box: typeof box } | null = null
const modal = computed(() => props.presentation !== 'window')
const style = computed(() => ({
  left: `${viewport.x + (props.presentation === 'drawer' ? Math.max(0, viewport.width - box.width) : modal.value ? 0 : box.x)}px`,
  top: `${viewport.y + (modal.value ? 0 : box.y)}px`,
  width: `${props.presentation === 'fullscreen' ? viewport.width : box.width}px`,
  height: `${modal.value ? viewport.height : box.height}px`,
  zIndex: props.layer,
}))
function clamp() {
  box.width = Math.min(Math.max(240, box.width), Math.max(1, viewport.width - (modal.value ? 0 : 16)))
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
function start(event: PointerEvent, kind: 'move' | 'resize') {
  if (modal.value || event.button !== 0 || (kind === 'move' && (event.target as Element).closest('button'))) return
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
    Object.assign(box, resizeAnchoredBox('se', gesture.box.x + gesture.box.width + dx, gesture.box.y + gesture.box.height + dy, gesture.box, Math.min(240, viewport.width - 16), Math.min(180, viewport.height - 16), viewport))
  }
}
function end() { gesture = null }
function keyboardMove(event: KeyboardEvent, resize = false) {
  if (modal.value || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return
  const delta = event.shiftKey ? 1 : 16
  const dx = event.key === 'ArrowLeft' ? -delta : event.key === 'ArrowRight' ? delta : 0
  const dy = event.key === 'ArrowUp' ? -delta : event.key === 'ArrowDown' ? delta : 0
  if (resize) { box.width += dx; box.height += dy } else { box.x += dx; box.y += dy }
  clamp()
  event.preventDefault()
  event.stopPropagation()
}
function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); event.stopPropagation(); emit('close') }
  if (event.key !== 'Tab' || !modal.value || !root.value) return
  const items = [...root.value.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"], a[href]')].filter(e => e.getClientRects().length)
  const first = items[0]
  const last = items.at(-1)
  if (event.shiftKey && (document.activeElement === first || document.activeElement === root.value)) { last?.focus(); event.preventDefault() }
  else if (!event.shiftKey && document.activeElement === last) { first?.focus(); event.preventDefault() }
}
const options = computed(() => [
  { key: 'center', label: t('toolbox.center') },
  { key: 'grow', label: t('toolbox.grow') },
  { key: 'shrink', label: t('toolbox.shrink') },
])
function arrange(action: string) {
  if (action === 'center') { box.x = (viewport.width - box.width) / 2; box.y = (viewport.height - box.height) / 2 }
  else { const delta = action === 'grow' ? 64 : -64; box.width += delta; box.height += delta }
  clamp()
}
watch(() => [props.active, props.sequence], async () => {
  if (!props.active) return
  await nextTick()
  if (!root.value?.contains(document.activeElement)) root.value?.focus()
})
function applyRequestedSize() {
  if (modal.value) return
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
watch(() => [props.width, props.height], applyRequestedSize)
onMounted(() => {
  updateViewport()
  if (props.active) root.value?.focus()
  window.addEventListener('resize', updateViewport)
  window.visualViewport?.addEventListener('resize', updateViewport)
  window.visualViewport?.addEventListener('scroll', updateViewport)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', updateViewport)
  window.visualViewport?.removeEventListener('resize', updateViewport)
  window.visualViewport?.removeEventListener('scroll', updateViewport)
})
</script>
<template>
  <div class="tool-window-layer">
    <div v-if="presentation === 'drawer'" class="tool-drawer-mask" :style="{ zIndex: layer - 1 }" @click="emit('close')" />
    <ConsoleFloatingWindow ref="frame" :title="title" :animate="false" :draggable="!modal" :title-tabindex="modal ? undefined : 0" :title-label="`${title}: ${t('toolbox.moveWindow')}`" header-class="tool-window-header" class="tool-window" :class="[presentation, { active }]" :style="style" :aria-modal="modal || undefined" tabindex="-1" data-toolbox-local @pointerdown="emit('focus')" @focusin="!active && emit('focus')" @keydown="keydown" @close="emit('close')" @header-pointerdown="start($event, 'move')" @header-pointermove="move" @header-pointerup="end" @header-pointercancel="end" @title-keydown="keyboardMove($event)">
      <template #actions>
        <n-dropdown v-if="!modal" :options="options" trigger="click" @select="arrange" :to="root || undefined">
          <n-button quaternary circle size="tiny" :aria-label="t('toolbox.arrange')"><template #icon><Ellipsis /></template></n-button>
        </n-dropdown>
      </template>
      <div class="tool-window-content"><slot /></div>
      <button v-if="!modal" type="button" class="tool-resize" :aria-label="t('toolbox.resizeWindow')" @pointerdown="start($event, 'resize')" @pointermove="move" @pointerup="end" @pointercancel="end" @lostpointercapture="end" @keydown="keyboardMove($event, true)">
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M5 17 17 5M10 17l7-7M15 17l2-2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
      </button>
    </ConsoleFloatingWindow>
  </div>
</template>
<style scoped>
.tool-window-layer { position: absolute; inset: 0; pointer-events: none; }
.tool-window { position: absolute; display: flex; flex-direction: column; pointer-events: auto; color: var(--foreground); border: 1px solid var(--border-strong); box-sizing: border-box; overflow: hidden; }
.tool-window:focus-visible { outline: none; }
.tool-window.fullscreen, .tool-window.drawer { border-radius: 0; }
.tool-window-header { flex-shrink: 0; }
.drawer .tool-window-header, .fullscreen .tool-window-header { cursor: default; }
.tool-window :focus-visible { outline: 2px solid var(--ring); outline-offset: -2px; }
.tool-window :deep(.n-input :is(input, textarea):focus-visible) { outline: none; }
.tool-window-content { flex: 1; min-height: 0; overflow: auto; padding: 16px; overscroll-behavior: contain; scroll-padding: 16px; }
.tool-resize { position: absolute; bottom: 0; right: 0; display: grid; place-items: end; width: 40px; height: 40px; padding: 0 5px 5px 0; border: 0; color: var(--muted-foreground, currentColor); background: transparent; cursor: se-resize; touch-action: none; }
.tool-resize:hover { color: var(--foreground); }
.tool-drawer-mask { position: absolute; inset: 0; background: rgb(0 0 0 / 35%); pointer-events: auto; }
@media (pointer: coarse) { .tool-window-content { padding-bottom: max(16px, env(safe-area-inset-bottom)); } }
</style>
