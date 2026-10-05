<script setup lang="ts">
import { computed, shallowRef, useTemplateRef } from 'vue'
import { GripVertical, PinOff } from '@lucide/vue'
import { useToolboxContext } from '@/composables/useToolbox'
import { t } from '@/i18n/runtime'
import ToolIcon from './ToolIcon.vue'

const toolbox = useToolboxContext()
const section = useTemplateRef<HTMLElement>('section')
const draggedId = shallowRef('')
const targetId = shallowRef('')
const pinned = computed(() => toolbox.pinned)

function targetAt(event: PointerEvent) {
  const row = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-pin-id]')
  return row && section.value?.contains(row) ? row.dataset.pinId || '' : ''
}

function startDrag(event: PointerEvent, id: string) {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  event.stopPropagation()
  event.preventDefault()
  ;(event.currentTarget as HTMLElement).focus()
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  draggedId.value = id
}

function moveDrag(event: PointerEvent) {
  if (!draggedId.value) return
  event.preventDefault()
  targetId.value = targetAt(event)
}

function stopDrag(event: PointerEvent) {
  if (!draggedId.value) return
  const target = targetAt(event)
  if (target) toolbox.reorderPin(draggedId.value, target)
  draggedId.value = ''
  targetId.value = ''
}

function cancelDrag() {
  draggedId.value = ''
  targetId.value = ''
}

function moveWithKeyboard(event: KeyboardEvent, id: string) {
  const direction = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
  if (!direction) return
  event.preventDefault()
  event.stopPropagation()
  const index = pinned.value.findIndex(entry => entry.tool.id === id)
  const target = pinned.value[index + direction]
  if (target) toolbox.reorderPin(id, target.tool.id)
}

function dropSide(id: string) {
  if (!draggedId.value || !targetId.value || draggedId.value === id || targetId.value !== id) return ''
  const source = pinned.value.findIndex(entry => entry.tool.id === draggedId.value)
  const target = pinned.value.findIndex(entry => entry.tool.id === id)
  return source < target ? 'drop-after' : 'drop-before'
}
</script>

<template>
  <div ref="section" class="toolbox-pinned-section" role="group" :aria-label="t('toolbox.pinned')" @click.stop>
    <div class="toolbox-section-heading">
      <span>{{ t('toolbox.pinned') }}</span>
      <small>{{ t('toolbox.reorder') }}</small>
    </div>
    <div v-for="({ tool }, index) in pinned" :key="tool.id" class="toolbox-pinned-row" :class="[{ 'is-dragging': draggedId === tool.id }, dropSide(tool.id)]" :data-pin-id="tool.id">
      <button type="button" class="toolbox-drag-handle" :aria-label="`${t('toolbox.reorder')}: ${tool.title}, ${index + 1}/${pinned.length}. ${t('toolbox.reorderHint')}`" @pointerdown="startDrag($event, tool.id)" @pointermove="moveDrag" @pointerup="stopDrag" @pointercancel="cancelDrag" @lostpointercapture="cancelDrag" @keydown="moveWithKeyboard($event, tool.id)">
        <GripVertical :size="16" aria-hidden="true" />
      </button>
      <button type="button" class="toolbox-pinned-open" :aria-busy="toolbox.openingIds.includes(tool.id)" @click="toolbox.open(tool.id, $event.currentTarget as HTMLElement)">
        <ToolIcon :tool="tool" :loading="toolbox.openingIds.includes(tool.id)" />
        <span class="toolbox-dropdown-label"><strong>{{ tool.title }}</strong><small>{{ tool.extensionName }}</small></span>
      </button>
      <n-button text class="toolbox-pin-toggle" :aria-label="`${t('toolbox.unpin')}: ${tool.title}`" @click.stop="toolbox.togglePin(tool.id)">
        <template #icon><PinOff :size="16" /></template>
      </n-button>
    </div>
  </div>
</template>

<style scoped>
.toolbox-pinned-section { padding: 4px 4px 6px; }
.toolbox-section-heading { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 6px 10px 8px; color: var(--onekvm-text-tertiary); font-size: 12px; line-height: 1.4; }
.toolbox-section-heading small { font-size: 11px; white-space: nowrap; }
.toolbox-pinned-row { display: flex; align-items: center; min-height: 48px; border-radius: 6px; }
.toolbox-pinned-row:hover, .toolbox-pinned-row:focus-within { background: var(--accent); }
.toolbox-pinned-row.is-dragging { opacity: .48; }
.toolbox-pinned-row.drop-before { box-shadow: inset 0 2px var(--primary); }
.toolbox-pinned-row.drop-after { box-shadow: inset 0 -2px var(--primary); }
.toolbox-drag-handle, .toolbox-pinned-open { border: 0; background: none; color: inherit; cursor: pointer; }
.toolbox-drag-handle { display: grid; place-items: center; flex: 0 0 32px; height: 44px; padding: 0; color: var(--onekvm-text-tertiary); cursor: grab; touch-action: none; }
.toolbox-drag-handle:active { cursor: grabbing; }
.toolbox-pinned-open { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; min-height: 44px; padding: 4px 0; text-align: left; }
.toolbox-dropdown-label { display: grid; min-width: 0; line-height: 1.35; }
.toolbox-dropdown-label strong { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.toolbox-dropdown-label small { opacity: .65; font-size: 12px; }
.toolbox-pin-toggle { flex: 0 0 40px; height: 44px; margin-right: 2px; }
.toolbox-pinned-section :is(button, .n-button):focus-visible { outline: 2px solid var(--ring); outline-offset: -2px; }
</style>
