<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import { Ellipsis } from '@/icons'
import { useOverlayMount } from '@/composables/useOverlayMount'
import { t } from '@/i18n/runtime'
import { DISMISS_CONTROL_OVERLAY_EVENT, dismissControlOverlays } from '@/lib/overlay-target'

const props = defineProps<{
  show: boolean
  count: number
  mobile: boolean
  childOpen: boolean
  placement: 'top-end' | 'bottom-end' | 'bottom-start' | 'right-start' | 'left-start'
}>()
const emit = defineEmits<{
  'update:show': [show: boolean]
  target: [target: HTMLElement | null]
}>()
const overlayTo = useOverlayMount()
const trigger = shallowRef<{ $el: HTMLButtonElement } | null>(null)
const list = shallowRef<HTMLElement | null>(null)

watch(list, target => emit('target', target), { flush: 'post' })

function close(restoreFocus = false) {
  if (!props.show) return
  emit('update:show', false)
  dismissControlOverlays()
  if (restoreFocus) void nextTick(() => trigger.value?.$el.focus())
}

function items() {
  return [...(list.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
    .filter(button => button.getClientRects().length > 0)
    .sort((a, b) => Number((a.closest('.toolbar-icon-slot') as HTMLElement)?.style.order)
      - Number((b.closest('.toolbar-icon-slot') as HTMLElement)?.style.order))
}

async function focusItem(last = false) {
  await nextTick()
  const buttons = items()
  ;(last ? buttons.at(-1) : buttons[0])?.focus()
}

function triggerKeydown(event: KeyboardEvent) {
  if (event.key === 'Tab' && props.show && !event.shiftKey) {
    event.preventDefault()
    void focusItem()
    return
  }
  if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return
  event.preventDefault()
  emit('update:show', true)
  void focusItem(event.key === 'ArrowUp')
}

function listKeydown(event: KeyboardEvent) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Tab'].includes(event.key)) return
  const buttons = items()
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
  if (index < 0) return
  event.preventDefault()
  let next = index + (event.key === 'ArrowUp' || (event.key === 'Tab' && event.shiftKey) ? -1 : 1)
  if (event.key === 'Home') next = 0
  if (event.key === 'End') next = buttons.length - 1
  if (event.key === 'Tab' && (next < 0 || next >= buttons.length)) close(true)
  else buttons[(next + buttons.length) % buttons.length]?.focus()
}

function clickOutside(event: MouseEvent) {
  // Original controls keep their own popovers, sheets and nested select menus.
  // Interacting with those must not remove their trigger from the collection.
  if (event.target instanceof Element && event.target.closest(
    '.host-control-popover, .n-dropdown-menu, .n-base-select-menu, .control-sheet-mask, .n-modal, .n-dialog, .n-drawer',
  )) return
  close()
}

function keydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !props.show || event.defaultPrevented) return
  if (props.childOpen && event.target instanceof Element && event.target.closest(
    '.control-sheet-mask, .n-modal, .n-dialog, .n-base-select-menu',
  )) return
  event.preventDefault()
  event.stopPropagation()
  close(true)
}

function dismiss() { emit('update:show', false) }
watch(() => props.show, open => {
  if (open && document.pointerLockElement) void document.exitPointerLock()
})
onMounted(() => {
  window.addEventListener('keydown', keydown)
  window.addEventListener(DISMISS_CONTROL_OVERLAY_EVENT, dismiss)
})
onBeforeUnmount(() => {
  emit('target', null)
  window.removeEventListener('keydown', keydown)
  window.removeEventListener(DISMISS_CONTROL_OVERLAY_EVENT, dismiss)
})
</script>

<template>
  <n-popover
    v-if="!mobile"
    trigger="manual"
    :show="show"
    :placement="placement"
    :to="overlayTo"
    :show-arrow="false"
    :width="280"
    style="max-width: calc(100vw - 24px)"
    display-directive="show"
    class="toolbar-collection host-menu"
    :theme-overrides="{ padding: '6px' }"
    @clickoutside="clickOutside"
  >
    <template #trigger>
      <n-tooltip :disabled="mobile || show" :to="overlayTo">
        <template #trigger>
          <n-button
            ref="trigger"
            quaternary
            size="small"
            :aria-label="`${t('toolbar.collectedIcons')} (${count})`"
            :aria-expanded="show"
            aria-haspopup="menu"
            data-toolbar-collection-trigger
            @click="show ? close() : emit('update:show', true)"
            @keydown="triggerKeydown"
          >
            <template #icon><Ellipsis /></template>
          </n-button>
        </template>
        {{ t('toolbar.collectedIcons') }} ({{ count }})
      </n-tooltip>
    </template>
    <div class="toolbar-collection-heading">{{ t('toolbar.collectedIcons') }}<span>{{ count }}</span></div>
    <div ref="list" class="toolbar-collected-list" role="menu" :aria-label="t('toolbar.collectedIcons')" @keydown="listKeydown" />
  </n-popover>
  <template v-else>
    <n-button
      ref="trigger"
      quaternary
      size="small"
      :aria-label="`${t('toolbar.collectedIcons')} (${count})`"
      :aria-expanded="show"
      aria-haspopup="dialog"
      data-toolbar-collection-trigger
      @click="show ? close() : emit('update:show', true)"
      @keydown="triggerKeydown"
    >
      <template #icon><Ellipsis /></template>
      <span class="toolbar-action-label">{{ t('toolbar.collectedIcons') }}</span>
    </n-button>
    <n-modal
      :show="show"
      :to="overlayTo"
      preset="card"
      class="toolbar-collection-sheet n-modal"
      role="dialog"
      aria-modal="true"
      :aria-label="t('toolbar.collectedIcons')"
      :title="`${t('toolbar.collectedIcons')} (${count})`"
      :style="{ width: 'min(380px, calc(100vw - 24px))' }"
      :mask-closable="!childOpen"
      :close-on-esc="false"
      display-directive="show"
      @update:show="!$event && close(true)"
    >
      <div ref="list" class="toolbar-collected-list" role="menu" :aria-label="t('toolbar.collectedIcons')" @keydown="listKeydown" />
    </n-modal>
  </template>
</template>

<style scoped>
.toolbar-collection-heading { display: flex; justify-content: space-between; padding: 8px 10px; color: var(--muted-foreground); font-size: 12px; }
.toolbar-collected-list { display: flex; flex-direction: column; gap: 2px; max-height: calc(100dvh - 120px); overflow-y: auto; }
.toolbar-collection-sheet .toolbar-collected-list { max-height: calc(100dvh - 180px); }
.toolbar-collected-list :deep(.toolbar-icon-slot) { width: 100%; }
.toolbar-collected-list :deep(.toolbar-icon-slot > :first-child),
.toolbar-collected-list :deep(.control-sheet-trigger) { width: 100%; }
.toolbar-collected-list :deep(.n-button) { width: 100%; min-height: 44px; justify-content: flex-start; padding: 0 10px; }
.toolbar-collected-list :deep(.n-button.device-indicator) { width: 100%; max-width: none; height: 44px !important; padding: 0 10px !important; }
.toolbar-collected-list :deep(.n-button__content) { flex: 1; justify-content: flex-start; min-width: 0; }
.toolbar-collected-list :deep(.toolbar-action-label) { display: block; overflow: hidden; text-overflow: ellipsis; font-size: 14px; }
.toolbar-collected-list :deep(.device-led) { top: 50%; right: 12px; bottom: auto; margin: 0; transform: translateY(-50%); }
.toolbar-collected-list :deep(button:focus-visible) { outline: 2px solid var(--ring); outline-offset: -2px; }
</style>
