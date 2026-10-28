<script setup lang="ts">
import { computed, nextTick } from 'vue'
import { GripVertical, PinOff } from '@/icons'
import { useToolboxContext } from '@/composables/useToolbox'
import { useSortableListDrag } from '@/composables/useSortableListDrag'
import { t } from '@/i18n/runtime'
import ToolIcon from './ToolIcon.vue'

const toolbox = useToolboxContext()
const { dragId: draggedId, overId: targetId, startDrag, moveDrag, endDrag, cancelDrag } = useSortableListDrag({
  attribute: 'data-pin-id',
  disabled: () => !toolbox.menuOpen,
  commit: (from, to) => toolbox.reorderPin(from, to),
})
const pinned = computed(() => {
  const entries = [...toolbox.pinned]
  const from = entries.findIndex(entry => entry.tool.id === draggedId.value)
  const to = entries.findIndex(entry => entry.tool.id === targetId.value)
  if (from >= 0 && to >= 0 && from !== to) {
    const [entry] = entries.splice(from, 1)
    entries.splice(to, 0, entry!)
  }
  return entries
})

function moveWithKeyboard(event: KeyboardEvent, id: string) {
  const direction = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
  if (!direction || draggedId.value) return
  event.preventDefault()
  event.stopPropagation()
  const index = pinned.value.findIndex(entry => entry.tool.id === id)
  const target = pinned.value[index + direction]
  if (target) {
    const handle = event.currentTarget as HTMLElement
    toolbox.reorderPin(id, target.tool.id)
    void nextTick(() => { if (handle.isConnected) handle.focus({ preventScroll: true }) })
  }
}
</script>

<template>
  <div class="toolbox-pinned-section" role="group" :aria-label="t('toolbox.pinned')" @click.stop>
    <div class="toolbox-section-heading">
      <span>{{ t('toolbox.pinned') }}</span>
      <small>{{ t('toolbox.reorder') }}</small>
    </div>
    <TransitionGroup name="toolbox-pin-sort" tag="div" class="toolbox-pinned-list" @pointermove="moveDrag" @pointerup="endDrag" @pointercancel="cancelDrag" @lostpointercapture="cancelDrag">
    <div v-for="({ tool }, index) in pinned" :key="tool.id" class="toolbox-pinned-row" :class="{ 'is-dragging': draggedId === tool.id }" :data-pin-id="tool.id">
      <button type="button" class="toolbox-drag-handle" :aria-label="`${t('toolbox.reorder')}: ${tool.title}, ${index + 1}/${pinned.length}. ${t('toolbox.reorderHint')}`" @pointerdown="startDrag($event, tool.id)" @keydown="moveWithKeyboard($event, tool.id)">
        <GripVertical :size="16" aria-hidden="true" />
      </button>
      <button type="button" class="toolbox-pinned-open" :aria-busy="toolbox.openingIds.includes(tool.id)" @click="toolbox.open(tool.id, $event.currentTarget as HTMLElement)">
        <ToolIcon :tool="tool" :loading="toolbox.openingIds.includes(tool.id)" />
        <span class="toolbox-dropdown-label"><strong>{{ tool.title }}</strong><small>{{ tool.subtitle }}</small></span>
      </button>
      <n-button text class="toolbox-pin-toggle" :aria-label="`${t('toolbox.unpin')}: ${tool.title}`" @click.stop="toolbox.togglePin(tool.id)">
        <template #icon><PinOff :size="16" /></template>
      </n-button>
    </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toolbox-pinned-section { padding: 4px 4px 6px; }
.toolbox-section-heading { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 6px 10px 8px; color: var(--onekvm-text-tertiary); font-size: 12px; line-height: 1.4; }
.toolbox-section-heading small { font-size: 11px; white-space: nowrap; }
.toolbox-pinned-row { display: flex; align-items: center; min-height: 48px; border-radius: 6px; }
.toolbox-pinned-row:hover, .toolbox-pinned-row:focus-within { background: var(--accent); }
.toolbox-pinned-list { position: relative; }
.toolbox-pinned-row.is-dragging { opacity: .3; background: var(--accent); }
.toolbox-pinned-row.is-drag-ghost { color: var(--popover-foreground); background: var(--popover); outline: 1px solid var(--primary); box-shadow: var(--onekvm-shadow-popover); }
.toolbox-pin-sort-move { transition: transform 180ms var(--win11-ease-out); }
.toolbox-drag-handle, .toolbox-pinned-open { border: 0; background: none; color: inherit; cursor: pointer; }
.toolbox-drag-handle { display: grid; place-items: center; flex: 0 0 32px; height: 44px; padding: 0; color: var(--onekvm-text-tertiary); cursor: grab; touch-action: none; }
.toolbox-drag-handle:active { cursor: grabbing; }
.toolbox-pinned-open { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; min-height: 44px; padding: 4px 0; text-align: left; }
.toolbox-dropdown-label { display: grid; min-width: 0; line-height: 1.35; }
.toolbox-dropdown-label strong { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.toolbox-dropdown-label small { overflow: hidden; color: var(--onekvm-text-tertiary); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.toolbox-pin-toggle { flex: 0 0 40px; height: 44px; margin-right: 2px; }
.toolbox-pinned-section :is(button, .n-button):focus-visible { outline: 2px solid var(--ring); outline-offset: -2px; }
@media (prefers-reduced-motion: reduce) {
  .toolbox-pin-sort-move { transition: none; }
}
</style>
