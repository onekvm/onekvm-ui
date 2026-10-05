<script setup lang="ts">
import { computed, h, nextTick, onBeforeUnmount, onMounted, watch } from 'vue'
import { NAlert, NButton, NEmpty, NSpin, type DropdownOption } from 'naive-ui'
import { Pin, PinOff, Wrench } from '@lucide/vue'
import { useToolboxContext } from '@/composables/useToolbox'
import { useOverlayMount } from '@/composables/useOverlayMount'
import { DISMISS_CONTROL_OVERLAY_EVENT } from '@/lib/overlay-target'
import { t } from '@/i18n/runtime'
import ToolIcon from './ToolIcon.vue'
import PinnedToolList from './PinnedToolList.vue'

defineProps<{ mobile?: boolean; placement?: 'top-end' | 'bottom-end' | 'bottom-start' | 'right-start' | 'left-start' }>()
const toolbox = useToolboxContext()
const mountTo = useOverlayMount()
const pinned = (id: string) => toolbox.pins.some(pin => pin.toolId === id)
const options = computed<DropdownOption[]>(() => {
  const rows: DropdownOption[] = []
  if (toolbox.error) rows.push({
    type: 'render', key: 'catalog-error', render: () => h(NAlert, { type: 'error', showIcon: false }, {
      default: () => [toolbox.error, h(NButton, { size: 'small', loading: toolbox.loading, onClick: () => toolbox.refresh() }, { default: () => t('toolbox.retry') })],
    }),
  })
  if (toolbox.loading && !toolbox.tools.length) rows.push({ type: 'render', key: 'catalog-loading', render: () => h(NSpin, { size: 'small' }) })
  else if (!toolbox.tools.length && !toolbox.error) rows.push({ type: 'render', key: 'catalog-empty', render: () => h(NEmpty, { description: t('toolbox.empty') }) })
  if (toolbox.pinned.length) rows.push({ type: 'render', key: 'pinned-tools', render: () => h(PinnedToolList) })
  const otherTools = toolbox.tools.filter(tool => !pinned(tool.id))
  if (toolbox.pinned.length && otherTools.length) rows.push({
    type: 'render', key: 'other-tools-heading',
    render: () => h('div', { class: 'toolbox-other-heading' }, t('toolbox.otherTools')),
  })
  rows.push(...otherTools.map(tool => ({
    key: tool.id,
    icon: () => h(ToolIcon, { tool }),
    label: () => h('div', { class: 'toolbox-dropdown-row' }, [
      h('span', { class: 'toolbox-dropdown-label' }, [h('strong', tool.title), h('small', tool.extensionName)]),
      h(NButton, {
        text: true, size: 'small', class: 'toolbox-pin-toggle',
        'aria-label': `${pinned(tool.id) ? t('toolbox.unpin') : t('toolbox.pin')}: ${tool.title}`,
        'aria-pressed': pinned(tool.id),
        onClick: (event: MouseEvent) => { event.stopPropagation(); toolbox.togglePin(tool.id) },
        onKeydown: (event: KeyboardEvent) => { if (event.key === 'Enter' || event.key === ' ') event.stopPropagation() },
      }, { icon: () => h(pinned(tool.id) ? PinOff : Pin, { size: 16 }) }),
    ]),
  })))
  return rows
})
function closeMenu() { toolbox.menuOpen = false }
function triggerKeydown(event: KeyboardEvent) {
  if (event.key === 'Tab' && toolbox.menuOpen) {
    const button = document.querySelector<HTMLButtonElement>('.toolbox-dropdown button')
    if (button) { event.preventDefault(); button.focus() }
  } else if (!toolbox.menuOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
    event.preventDefault(); toolbox.menuOpen = true
  }
}
const menuProps = () => ({
  class: 'toolbox-dropdown', 'data-toolbox-local': '', 'aria-label': t('toolbox.title'),
  style: { maxWidth: 'calc(100vw - 24px)', maxHeight: 'calc(100dvh - 24px)' },
  onKeydown: (event: KeyboardEvent) => {
    if (event.key !== 'Tab') return
    const buttons = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (index < 0) return
    const next = buttons[index + (event.shiftKey ? -1 : 1)]
    event.preventDefault()
    if (next) next.focus()
    else document.querySelector<HTMLButtonElement>('[data-toolbox-trigger]')?.focus()
  },
})
watch(() => toolbox.menuOpen, async open => {
  if (open) {
    if (document.pointerLockElement) void document.exitPointerLock()
    void toolbox.refresh()
  } else {
    await nextTick()
    document.querySelector<HTMLButtonElement>('[data-toolbox-trigger]')?.focus()
  }
})
onMounted(() => window.addEventListener(DISMISS_CONTROL_OVERLAY_EVENT, closeMenu))
onBeforeUnmount(() => window.removeEventListener(DISMISS_CONTROL_OVERLAY_EVENT, closeMenu))
</script>
<template>
  <n-dropdown v-if="toolbox.allowed" trigger="click" :show="toolbox.menuOpen" :options="options" :theme-overrides="{ optionHeightMedium: '52px' }" :placement="placement || 'bottom-end'" :to="mountTo" scrollable :menu-props="menuProps" @update:show="toolbox.menuOpen = $event" @select="toolbox.open(String($event))">
    <n-tooltip :disabled="mobile || toolbox.menuOpen" :to="mountTo" style="pointer-events: none">
      <template #trigger>
        <n-button quaternary size="small" :aria-label="t('toolbox.title')" :aria-expanded="toolbox.menuOpen" aria-haspopup="menu" data-toolbox-local data-toolbox-trigger @keydown="triggerKeydown">
          <template #icon><Wrench /></template>
          <span v-if="mobile" class="toolbar-action-label">{{ t('toolbox.title') }}</span>
        </n-button>
      </template>
      {{ t('toolbox.title') }}
    </n-tooltip>
  </n-dropdown>
</template>
<style>
.toolbox-dropdown { min-width: min(300px, calc(100vw - 24px)); }
.toolbox-dropdown-row { display: flex; align-items: center; gap: 16px; height: 100%; min-height: 44px; line-height: 1.35; }
.toolbox-dropdown-label { display: grid; flex: 1; min-width: 0; }
.toolbox-dropdown-label strong { font-weight: 500; overflow: hidden; text-overflow: ellipsis; }
.toolbox-dropdown-label small { opacity: .65; font-size: 12px; }
.toolbox-dropdown .toolbox-pin-toggle { flex-shrink: 0; width: 44px; height: 44px; }
.toolbox-dropdown .toolbox-other-heading { margin: 2px 8px 0; padding: 9px 10px 4px; border-top: 1px solid var(--border); color: var(--onekvm-text-tertiary); font-size: 12px; line-height: 1.4; }
.toolbox-dropdown button:focus-visible { outline: 2px solid var(--ring); outline-offset: -2px; }
</style>
