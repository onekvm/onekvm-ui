<script setup lang="ts">
import { computed, type Component } from 'vue'
import {
  ArrowBigUp, ArrowBigUpDash, ArrowDown, ArrowLeft, ArrowRight,
  ArrowRightToLine, ArrowUp, ChevronUp, Command,
  CornerDownLeft, Delete, Grid2X2, Menu, Option, Space,
} from '@lucide/vue'
import type { VirtualKey, VirtualKeyboardMode } from '@/lib/virtual-keyboard'

const props = defineProps<{ item: VirtualKey; mode: VirtualKeyboardMode; compact?: boolean }>()

const icons: Record<string, Component> = {
  Backspace: Delete,
  Enter: CornerDownLeft,
  Tab: ArrowRightToLine,
  CapsLock: ArrowBigUpDash,
  ShiftLeft: ArrowBigUp,
  ShiftRight: ArrowBigUp,
  Space,
  Menu,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
}
const macModifierIcons: Record<string, Component> = {
  ControlLeft: ChevronUp,
  ControlRight: ChevronUp,
  AltLeft: Option,
  AltRight: Option,
}
const iconOnly = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])
const systemKeys = new Set(['PrintScreen', 'Pause'])
const compactIconOnly = new Set(['ShiftLeft', 'ShiftRight', 'Backspace', 'Enter', 'Space'])
const icon = computed(() => {
  const code = props.item.code
  if (code === 'MetaLeft' || code === 'MetaRight') return props.mode === 'mac' ? Command : Grid2X2
  return (props.mode === 'mac' && macModifierIcons[code]) || icons[code]
})
const showLabel = computed(() => !iconOnly.has(props.item.code)
  && !(props.compact && compactIconOnly.has(props.item.code)))
</script>

<template>
  <span class="keyboard-key-content" :class="{
    'is-stacked': compact && icon && showLabel,
    'is-system-key': systemKeys.has(item.code),
    'is-compact-label': compact && !icon && !systemKeys.has(item.code) && item.label.length > 3,
  }">
    <component v-if="icon" :is="icon" :size="compact ? 18 : 14" aria-hidden="true" />
    <span v-if="showLabel">{{ item.label }}</span>
  </span>
</template>

<style scoped>
.keyboard-key-content {
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  justify-content: center;
  gap: 4px;
  vertical-align: middle;
}
.keyboard-key-content svg { flex-shrink: 0; }
.keyboard-key-content > span { white-space: nowrap; }
.keyboard-key-content.is-system-key { font-size: 11px; }
.keyboard-key-content.is-compact-label { font-size: 12px; }
.keyboard-key-content.is-stacked { flex-direction: column; gap: 2px; }
.keyboard-key-content.is-stacked svg { width: 14px; height: 14px; }
.keyboard-key-content.is-stacked > span { font-size: 10px; line-height: 1; }
@media (orientation: landscape) {
  .keyboard-key-content.is-stacked { flex-direction: row; gap: 4px; }
  .keyboard-key-content.is-stacked > span { font-size: 11px; }
}
</style>
