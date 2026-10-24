<script setup lang="ts">
import { shallowRef, useId, watch } from 'vue'
import { CircleHelp } from '@/icons'
import { useOverlayMount } from '@/composables/useOverlayMount'

const props = defineProps<{ label: string; text: string; active: boolean }>()
const overlayTo = useOverlayMount()
const textId = useId()
const hovered = shallowRef(false)
const focused = shallowRef(false)

function reset() {
  hovered.value = false
  focused.value = false
}

function focusHelp(event: MouseEvent) {
  ;(event.currentTarget as HTMLButtonElement).focus({ preventScroll: true })
  focused.value = true
}

function dismissHelp(event: KeyboardEvent) {
  if (!hovered.value && !focused.value) return
  reset()
  event.preventDefault()
  event.stopPropagation()
}

watch(() => props.active, (active) => { if (!active) reset() })
</script>

<template>
  <n-tooltip :to="overlayTo" :show="active && (hovered || focused)" style="max-width: min(300px, calc(100vw - 32px))">
    <template #trigger>
      <button
        type="button"
        class="display-setting-help"
        :aria-label="label"
        :aria-describedby="textId"
        @mouseenter="hovered = true"
        @mouseleave="hovered = false"
        @focus="focused = true"
        @blur="focused = false"
        @click="focusHelp"
        @keydown.esc="dismissHelp"
      ><CircleHelp :size="14" aria-hidden="true" /></button>
    </template>
    <span :id="textId" class="display-setting-help-text">{{ text }}</span>
  </n-tooltip>
</template>

<style scoped>
.display-setting-help {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--onekvm-text-secondary);
  cursor: help;
}
.display-setting-help:hover { color: var(--foreground); background: var(--secondary-hover); }
.display-setting-help:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
.display-setting-help-text { white-space: pre-line; }
@media (pointer: coarse), (max-width: 760px) {
  .display-setting-help { width: 44px; height: 44px; }
}
</style>
