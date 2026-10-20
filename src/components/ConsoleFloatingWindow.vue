<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, useSlots, watch } from 'vue'
import { NButton, NCard, NTooltip } from 'naive-ui'
import { X } from '@/icons'
import { t } from '@/i18n/runtime'
import { useOverlayMount } from '@/composables/useOverlayMount'
import { registerConsoleWindowLayer } from '@/composables/useConsoleWindowLayer'

defineOptions({ inheritAttrs: false })
const props = withDefaults(defineProps<{
  title: string
  show?: boolean
  animate?: boolean
  chromeVisible?: boolean
  draggable?: boolean
  titleTabindex?: number
  titleLabel?: string
  closeLabel?: string
  headerClass?: string
  layer?: number
}>(), { show: true, animate: true, chromeVisible: true, draggable: true })
const emit = defineEmits<{
  close: []
  'header-pointerdown': [event: PointerEvent]
  'header-pointermove': [event: PointerEvent]
  'header-pointerup': [event: PointerEvent]
  'header-pointercancel': [event: PointerEvent]
  'title-keydown': [event: KeyboardEvent]
}>()
const slots = useSlots()
const element = ref<HTMLElement | null>(null)
const mountTo = useOverlayMount()
const overlayTo = computed(() => mountTo.value as string | HTMLElement)
const stack = shallowRef<ReturnType<typeof registerConsoleWindowLayer> | null>(null)
watch(() => props.show && props.layer === undefined, managed => {
  if (managed) stack.value ||= registerConsoleWindowLayer()
  else { stack.value?.dispose(); stack.value = null }
}, { immediate: true })
onBeforeUnmount(() => stack.value?.dispose())
function activate() {
  if (!stack.value) return
  stack.value.raise()
  if (!element.value?.contains(document.activeElement)) element.value?.focus({ preventScroll: true })
}
defineExpose({ element })
</script>
<template>
  <Transition name="win11-window" :css="animate" appear>
    <section v-if="show" ref="element" class="console-floating-window host-window-frame" role="dialog" :aria-label="title" tabindex="-1" v-bind="$attrs" :style="{ zIndex: layer ?? stack?.layer.value }" @pointerdown.capture="activate" @focusin.capture="stack?.raise()">
      <NCard :bordered="false" class="console-floating-card" :content-style="{ padding: '0', display: 'flex', flexDirection: 'column', minHeight: '0' }">
        <div v-if="slots.chrome" v-show="chromeVisible" class="console-floating-chrome"><slot name="chrome" /></div>
          <header v-show="!slots.chrome || !chromeVisible" class="display-status-titlebar host-window-titlebar" :class="[headerClass, { 'is-static': !draggable }]" @pointerdown="emit('header-pointerdown', $event)" @pointermove="emit('header-pointermove', $event)" @pointerup="emit('header-pointerup', $event)" @pointercancel="emit('header-pointercancel', $event)" @lostpointercapture="emit('header-pointercancel', $event)">
            <span v-if="slots['title-icon']" class="console-floating-title-icon"><slot name="title-icon" /></span>
            <strong class="console-floating-title" :tabindex="titleTabindex" :aria-label="titleLabel" @keydown="emit('title-keydown', $event)">{{ title }}</strong>
            <slot name="header-extra" />
            <div class="performance-window-actions host-window-actions" @pointerdown.stop>
              <slot name="actions" />
              <NTooltip :to="overlayTo" :z-index="4000" style="pointer-events: none">
                <template #trigger>
                  <NButton quaternary circle size="tiny" class="console-window-button" :aria-label="closeLabel || t('common.close', 'Close')" @click="emit('close')"><template #icon><X /></template></NButton>
                </template>
                {{ closeLabel || t('common.close', 'Close') }}
              </NTooltip>
            </div>
          </header>
        <slot />
      </NCard>
    </section>
  </Transition>
</template>
<style scoped>
.console-floating-window { overflow: hidden; isolation: isolate; box-sizing: border-box; border: 1px solid var(--border-strong); color: var(--foreground); }
.console-floating-card { height: 100%; min-height: 0; background: transparent; color: inherit; border-radius: inherit; }
.display-status-titlebar { flex-shrink: 0; }
.display-status-titlebar.is-static { cursor: default; }
.console-floating-title-icon { display: inline-flex; flex: none; }
.console-floating-title-icon:empty { display: none; }
.console-floating-title { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.console-floating-window :focus-visible { outline: 2px solid var(--ring); outline-offset: -2px; }
@media (pointer: coarse), (max-width: 760px), (max-height: 500px) and (max-width: 1100px) {
  .console-window-button, .performance-window-actions :deep(.n-button) { width: 44px; height: 44px; }
  .display-status-titlebar { min-height: 44px; height: auto; padding-top: env(safe-area-inset-top); }
}
</style>
