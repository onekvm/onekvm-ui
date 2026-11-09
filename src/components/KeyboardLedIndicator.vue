<script setup lang="ts">
import { Keyboard } from '@/icons'

defineProps<{
  capsLock?: boolean
  numLock?: boolean
  scrollLock?: boolean
}>()

function lockState(value: boolean | undefined) {
  if (value === undefined) return 'unknown'
  return value ? 'on' : 'off'
}
</script>

<template>
  <span class="keyboard-leds-glyph" aria-hidden="true">
    <Keyboard :size="16" />
    <span class="keyboard-leds-lights">
      <i :data-state="lockState(capsLock)" />
      <i :data-state="lockState(numLock)" />
      <i :data-state="lockState(scrollLock)" />
    </span>
  </span>
</template>

<style scoped>
.keyboard-leds-glyph {
  position: relative;
  display: inline-grid;
  width: 18px;
  height: 18px;
  place-items: center;
}

.keyboard-leds-lights {
  position: absolute;
  right: -3px;
  bottom: -2px;
  display: inline-flex;
  gap: 1px;
  padding: 2px;
  border: 1px solid var(--onekvm-toolbar);
  border-radius: 3px;
  background: var(--onekvm-toolbar);
}

.keyboard-leds-lights i {
  display: block;
  width: 3px;
  height: 3px;
  border-radius: 1px;
  background: var(--border-strong);
}

.keyboard-leds-lights i[data-state="on"] {
  background: var(--success);
  box-shadow: 0 0 4px color-mix(in srgb, var(--success) 70%, transparent);
}

.keyboard-leds-lights i[data-state="unknown"] {
  opacity: .58;
}
</style>
