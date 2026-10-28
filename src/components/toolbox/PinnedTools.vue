<script setup lang="ts">
import { computed, h, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { type DropdownOption } from 'naive-ui'
import { Ellipsis, Pin, PinOff } from '@/icons'
import { useToolboxContext } from '@/composables/useToolbox'
import { useOverlayMount } from '@/composables/useOverlayMount'
import { useToolbarPinCapacity } from '@/composables/useToolbarPinCapacity'
import { DISMISS_CONTROL_OVERLAY_EVENT } from '@/lib/overlay-target'
import { t } from '@/i18n/runtime'
import ToolIcon from './ToolIcon.vue'

const props = defineProps<{ mobile?: boolean; vertical?: boolean; placement?: 'top-end' | 'bottom-end' | 'bottom-start' | 'right-start' | 'left-start' }>()
const emit = defineEmits<{ overlay: [open: boolean] }>()
const toolbox = useToolboxContext()
const mountTo = useOverlayMount()
const overflowOpen = ref(false)
const contextToolId = shallowRef('')
const contextPosition = shallowRef({ x: 0, y: 0 })
const contextTrigger = shallowRef<HTMLElement | null>(null)
const contextTool = computed(() => toolbox.pinned.find(({ tool }) => tool.id === contextToolId.value)?.tool)
const contextOptions = computed<DropdownOption[]>(() => [{
  key: 'unpin', label: t('toolbox.unpin'), icon: () => h(PinOff, { size: 16 }),
}])
const root = useTemplateRef<HTMLElement>('root')
const capacity = useToolbarPinCapacity(root, () => toolbox.pinned.length, () => Boolean(props.mobile), () => Boolean(props.vertical))
const visible = computed(() => toolbox.pinned.slice(0, capacity.value))
const overflow = computed(() => toolbox.pinned.slice(visible.value.length))
const menuProps = () => ({ class: 'host-menu', style: { maxHeight: 'calc(100dvh - 24px)' }, 'data-toolbox-local': '' })
const overflowOptions = computed<DropdownOption[]>(() => overflow.value.map(({ tool }) => ({ key: tool.id, label: tool.title, icon: () => h(ToolIcon, { tool, loading: toolbox.openingIds.includes(tool.id) }) })))
function openContextMenu(event: MouseEvent, id: string) {
  const trigger = event.currentTarget as HTMLElement
  const rect = trigger.getBoundingClientRect()
  contextTrigger.value = trigger
  contextPosition.value = event.clientX || event.clientY
    ? { x: event.clientX, y: event.clientY }
    : { x: rect.left, y: rect.bottom }
  overflowOpen.value = false
  contextToolId.value = id
  if (document.pointerLockElement) void document.exitPointerLock()
}
function contextKeydown(event: KeyboardEvent, id: string) {
  if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return
  event.preventDefault()
  const trigger = event.currentTarget as HTMLElement
  const rect = trigger.getBoundingClientRect()
  contextTrigger.value = trigger
  contextPosition.value = { x: rect.left, y: rect.bottom }
  overflowOpen.value = false
  contextToolId.value = id
}
function closeContextMenu(restoreFocus = false) {
  contextToolId.value = ''
  if (restoreFocus) contextTrigger.value?.focus()
}
function unpinContextTool() {
  const id = contextToolId.value
  closeContextMenu()
  if (!toolbox.pins.some(pin => pin.toolId === id)) return
  toolbox.togglePin(id)
  void nextTick(() => {
    const buttons = [...document.querySelectorAll<HTMLElement>('.toolbar-pin-button, [data-toolbox-trigger], [data-toolbar-collection-trigger]')]
    buttons.find(button => button.getClientRects().length)?.focus()
  })
}
const contextMenuProps = () => ({
  ...menuProps(), class: 'host-menu toolbar-pin-context-menu', 'aria-label': contextTool.value?.title,
  onKeydown: (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    closeContextMenu(true)
  },
})
function dismiss() { overflowOpen.value = false; closeContextMenu() }
watch([overflowOpen, contextToolId], ([overflow, context]) => emit('overlay', overflow || Boolean(context)))
watch(contextTool, tool => { if (!tool) closeContextMenu() })
onMounted(() => window.addEventListener(DISMISS_CONTROL_OVERLAY_EVENT, dismiss))
onBeforeUnmount(() => { window.removeEventListener(DISMISS_CONTROL_OVERLAY_EVENT, dismiss); emit('overlay', false) })
</script>
<template>
  <div v-if="toolbox.pinned.length" ref="root" class="toolbar-pinned-tools" :class="{ 'is-mobile': mobile, 'is-vertical': vertical }" role="group" :aria-label="t('toolbox.pinned')" data-toolbox-local>
    <span v-if="mobile" class="toolbar-pinned-heading"><Pin :size="14" />{{ t('toolbox.pinned') }}</span>
    <div class="toolbar-pinned-buttons">
      <n-tooltip v-for="{ tool } in visible" :key="tool.id" :to="mountTo" :disabled="mobile || contextToolId === tool.id" :placement="placement?.startsWith('left') ? 'left' : placement?.startsWith('right') ? 'right' : placement?.startsWith('top') ? 'top' : 'bottom'" style="pointer-events: none">
        <template #trigger>
          <n-button quaternary size="small" class="toolbar-pin-button" :class="{ 'is-open': toolbox.instances.some(instance => instance.id === tool.id) }" :aria-label="tool.title" :aria-pressed="toolbox.instances.some(instance => instance.id === tool.id)" :aria-busy="toolbox.openingIds.includes(tool.id)" :data-tool-id="tool.id" @click="toolbox.open(tool.id, $event.currentTarget as HTMLElement)" @contextmenu.prevent.stop="openContextMenu($event, tool.id)" @keydown="contextKeydown($event, tool.id)">
            <template #icon><ToolIcon :tool="tool" :loading="toolbox.openingIds.includes(tool.id)" /></template>
            <span v-if="mobile">{{ tool.title }}</span>
          </n-button>
        </template>
        {{ tool.title }}
      </n-tooltip>
      <n-dropdown v-if="overflow.length" trigger="click" :show="overflowOpen" :options="overflowOptions" :to="mountTo" :placement="placement || 'bottom-end'" scrollable :menu-props="menuProps" @update:show="overflowOpen = $event" @select="toolbox.open(String($event)); overflowOpen = false">
        <n-button quaternary size="small" :aria-label="`${t('toolbox.morePins')} (${overflow.length})`"><template #icon><Ellipsis :size="16" /></template><span v-if="mobile">{{ t('toolbox.morePins') }}</span></n-button>
      </n-dropdown>
    </div>
  </div>
  <n-dropdown
    trigger="manual"
    :show="Boolean(contextToolId)"
    :x="contextPosition.x"
    :y="contextPosition.y"
    :options="contextOptions"
    :to="mountTo"
    placement="bottom-start"
    :menu-props="contextMenuProps"
    @clickoutside="closeContextMenu()"
    @update:show="!$event && closeContextMenu()"
    @select="unpinContextTool"
  />
</template>
<style scoped>
.toolbar-pinned-tools { display: flex; align-items: center; flex-shrink: 0; padding-left: 7px; margin-left: 4px; border-left: 1px solid var(--border); }
.toolbar-pinned-buttons { display: flex; align-items: center; gap: 4px; }
.toolbar-pinned-tools:not(.is-mobile) :deep(.n-button) { width: 30px; height: 30px; min-width: 30px; padding: 0; }
.toolbar-pinned-tools:not(.is-mobile) :deep(.n-button__icon) { margin: 0; }
.toolbar-pin-button.is-open { color: var(--primary); background: var(--accent); }
.toolbar-pinned-tools :deep(button:focus-visible) { outline: 2px solid var(--ring); outline-offset: -2px; }
.toolbar-pinned-tools.is-vertical { width: 100%; padding: 7px 0 0; margin: 0; border-left: 0; border-top: 1px solid var(--border); }
.is-vertical .toolbar-pinned-buttons { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); width: 100%; justify-items: center; }
.toolbar-pinned-tools.is-mobile { display: grid; width: 100%; padding: 8px 0; margin: 0; border-left: 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); gap: 4px; }
.toolbar-pinned-heading { display: flex; align-items: center; gap: 6px; padding: 4px 8px; font-size: 12px; color: var(--onekvm-text-tertiary); }
.is-mobile .toolbar-pinned-buttons { display: grid; width: 100%; grid-template-columns: minmax(0, 1fr); }
</style>
