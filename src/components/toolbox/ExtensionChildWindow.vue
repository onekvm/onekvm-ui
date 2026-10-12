<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, provide, shallowRef, useTemplateRef, watch } from 'vue'
import type { ChildWindowRegistration, ExtensionToolHostV1 } from '@/extensions/toolboxRuntime'
import { toolWindowOwnerKey, type ToolChildWindow } from '@/lib/tool-child-windows'
import ToolWindow from './ToolWindow.vue'

const props = withDefaults(defineProps<{
  host: ExtensionToolHostV1; open: boolean; title: string; width?: number; height?: number
  modal?: boolean; resizable?: boolean; maximizable?: boolean
  beforeClose?: () => boolean | Promise<boolean>
}>(), { modal: true, resizable: true, maximizable: true })
const emit = defineEmits<{ close: [] }>()
const frame = useTemplateRef<InstanceType<typeof ToolWindow>>('frame')
const state = shallowRef<'normal' | 'maximized' | 'minimized'>('normal')
const registration = shallowRef<ChildWindowRegistration | null>(null)
const layer = computed(() => registration.value?.layer.value || 2302)
const attention = shallowRef(false)
let attentionTimer = 0
let resolveClose: ((closed: boolean) => void) | null = null
let closing: Promise<boolean> | null = null
let returnFocus: HTMLElement | null = null
const owner = inject<ToolChildWindow | null>(toolWindowOwnerKey, null)
const child: ToolChildWindow = { owner, get modal() { return props.modal }, focus, close }
provide(toolWindowOwnerKey, child)

function focus(flash = false) {
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
function release() {
  const restoreFocus = registration.value?.visible.value !== false
  registration.value?.dispose()
  registration.value = null
  resolveClose?.(true)
  resolveClose = null
  closing = null
  if (restoreFocus && returnFocus?.isConnected) void nextTick(() => {
    if (returnFocus?.isConnected && !returnFocus.closest('[inert]')) returnFocus.focus({ preventScroll: true })
    returnFocus = null
  })
  else returnFocus = null
}
function close(force = false): Promise<boolean> {
  if (!props.open && !frame.value?.element?.isConnected) return Promise.resolve(true)
  if (closing) {
    if (force) void registration.value?.closeChildren(true).then(() => emit('close'))
    return closing
  }
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
  if (!registration.value) registration.value = props.host.registerChildWindow(child)
  await nextTick()
  if (props.open) focus()
}, { immediate: true })
onBeforeUnmount(() => { window.clearTimeout(attentionTimer); release() })
</script>

<template>
  <Teleport :to="host.overlayTarget.value">
    <div v-show="registration?.visible.value !== false" class="owned-window-host">
    <Transition name="win11-window" @after-leave="release">
      <ToolWindow v-if="open" ref="frame" class="extension-child-window" :class="{ 'window-attention': attention }"
        :title="title" presentation="window" :width="width || 440" :height="height || 430" :owned-modal="modal"
        :resizable="resizable" :maximizable="maximizable" :minimizable="false" :layer="layer" :active="registration?.active.value || false" :sequence="layer"
        :child-window-active="registration?.blocked.value || false" @child-attention="registration?.attention()" @focus="registration?.activate()"
        v-model:state="state" @close="close">
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
