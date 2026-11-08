<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, provide, shallowRef, useTemplateRef, watch } from 'vue'
import type { ChildWindowRegistration, ExtensionToolHostV1 } from '@/extensions/toolboxRuntime'
import { toolWindowOwnerKey, type ToolChildWindow } from '@/lib/tool-child-windows'
import { CONSOLE_WINDOW_LAYER } from '@/lib/console-window-stack'
import { registerConsoleWindowLayer } from '@/composables/useConsoleWindowLayer'
import ToolWindow from './ToolWindow.vue'
import ToolIcon from './ToolIcon.vue'

const props = withDefaults(defineProps<{
  host: ExtensionToolHostV1; open: boolean; title: string; width?: number; height?: number
  modal?: boolean; resizable?: boolean; maximizable?: boolean
  independent?: boolean
  // edge-to-edge: no content padding (e.g. a video filling the window)
  contentLayout?: 'padded' | 'edge-to-edge'
  beforeClose?: () => boolean | Promise<boolean>
}>(), { modal: true, resizable: true, maximizable: true, contentLayout: 'padded' })
const emit = defineEmits<{ close: []; closed: [] }>()
const iconTool = computed(() => {
  const extension = props.host.extension.value
  return { extension, item: extension.toolbox?.items.find(item => `${extension.id}/${item.id}` === props.host.toolId) }
})
const frame = useTemplateRef<InstanceType<typeof ToolWindow>>('frame')
const state = shallowRef<'normal' | 'maximized' | 'minimized'>('normal')
const restoreState = shallowRef<'normal' | 'maximized'>('normal')
const independentLayer = props.independent ? registerConsoleWindowLayer() : null
const registration = shallowRef<ChildWindowRegistration | null>(null)
const layer = computed(() => independentLayer?.layer.value || registration.value?.layer.value || CONSOLE_WINDOW_LAYER + 2)
const attention = shallowRef(false)
let attentionTimer = 0
let resolveClose: ((closed: boolean) => void) | null = null
let closing: Promise<boolean> | null = null
let returnFocus: HTMLElement | null = null
const inheritedOwner = inject<ToolChildWindow | null>(toolWindowOwnerKey, null)
const owner = props.independent ? null : inheritedOwner
// Pages (e.g. an extension's settings page) have no toolbox window manager:
// the window is then a standalone floating window above the page.
const managed = computed(() => !props.independent && typeof props.host.registerChildWindow === 'function')
const overlay = computed(() => props.host.overlayTarget?.value || 'body')
const child: ToolChildWindow = { owner, get modal() { return props.modal }, focus, close }
provide(toolWindowOwnerKey, child)

async function focus(flash = false) {
  if (state.value === 'minimized') { state.value = restoreState.value; await nextTick() }
  independentLayer?.raise()
  if (registration.value?.blocked.value) { registration.value.attention(); return }
  registration.value?.activate()
  const root = frame.value?.element
  if (!root) return
  if (!root.contains(document.activeElement)) {
    const content = root.querySelector('.tool-window-content')
    const first = content?.querySelector<HTMLElement>('input:not(:disabled), textarea:not(:disabled), [role=checkbox], button:not(:disabled)')
    ;(first || root).focus({ preventScroll: true })
  }
  if (flash) {
    window.clearTimeout(attentionTimer)
    attention.value = true
    attentionTimer = window.setTimeout(() => { attention.value = false }, 500)
  }
}
watch(state, (next, previous) => {
  if (next === 'minimized') restoreState.value = previous === 'maximized' ? 'maximized' : 'normal'
})
function activate() {
  if (state.value === 'minimized') { void focus(); return }
  independentLayer?.raise()
  registration.value?.activate()
}
function afterLeave() { release(); emit('closed') }
function release() {
  const restoreFocus = registration.value?.visible.value !== false
  registration.value?.dispose()
  registration.value = null
  resolveClose?.(true)
  resolveClose = null
  closing = null
  const opener = returnFocus
  returnFocus = null
  if (restoreFocus && opener?.isConnected) void nextTick(() => {
    if (opener.isConnected && !opener.closest('[inert]')) opener.focus({ preventScroll: true })
  })
}
function close(force = false): Promise<boolean> {
  if (closing) {
    if (force) void registration.value?.closeChildren(true).then(() => emit('close'))
    return closing
  }
  if (!props.open && !frame.value?.element?.isConnected) return Promise.resolve(true)
  closing = new Promise(resolve => { resolveClose = resolve })
  void (async () => {
    if ((!force && props.beforeClose && !await props.beforeClose()) || (registration.value && !await registration.value.closeChildren(force))) {
      resolveClose?.(false); resolveClose = null; closing = null
      return
    }
    emit('close')
  })().catch(() => { resolveClose?.(false); resolveClose = null; closing = null })
  return closing
}
watch(() => props.open, async open => {
  if (!open) return
  returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  if (!registration.value && managed.value) registration.value = props.host.registerChildWindow(child)
  await nextTick()
  if (props.open) focus()
}, { immediate: true })
onBeforeUnmount(() => { window.clearTimeout(attentionTimer); release(); independentLayer?.dispose() })
function setState(next: 'normal' | 'maximized') {
  if (registration.value?.blocked.value) { registration.value.attention(); return false }
  if (next === 'maximized' && !props.maximizable) return false
  state.value = next
  return true
}
defineExpose({
  focus, close,
  state: computed(() => state.value),
  setState,
  getBounds: () => frame.value?.getBounds() || null,
  setBounds: (bounds: Partial<{ x: number; y: number; width: number; height: number }>) => frame.value?.setBounds(bounds) || false,
})
</script>

<template>
  <Teleport :to="overlay">
    <div v-show="registration?.visible.value !== false && state !== 'minimized'" class="owned-window-host">
    <!-- The animation runs on the inner window, so Vue needs the duration. -->
    <Transition name="win11-window" appear :duration="{ enter: 250, leave: 167 }" @after-leave="afterLeave">
      <ToolWindow v-if="open" ref="frame" class="extension-child-window" :class="{ 'window-attention': attention }"
        :title="title" presentation="window" :width="width || 440" :height="height || 430" :owned-modal="modal"
        :resizable="resizable" :maximizable="maximizable" :content-layout="contentLayout" :minimizable="independent" :layer="layer" :active="independentLayer ? independentLayer.active.value : managed ? registration?.active.value || false : true" :sequence="layer"
        :child-window-active="registration?.blocked.value || false" @child-attention="registration?.attention()" @focus="activate"
        v-model:state="state" @close="close">
        <template #title-icon><ToolIcon :tool="iconTool" /></template>
        <template v-if="$slots['header-extra']" #header-extra><slot name="header-extra" /></template>
        <slot />
      </ToolWindow>
    </Transition>
    </div>
  </Teleport>
</template>

<style scoped>
.owned-window-host { position: absolute; inset: 0; pointer-events: none; }
.window-attention :deep(.tool-window) { border-color: var(--primary); }
.window-attention :deep(.display-status-titlebar) { animation: window-attention 500ms ease-out; }
@keyframes window-attention { 0%, 100% { background: var(--onekvm-surface-overlay); } 50% { background: var(--accent); } }
@media (prefers-reduced-motion: reduce) { .window-attention :deep(.display-status-titlebar) { animation: none; background: var(--accent); } }
</style>
