<script setup lang="ts">
import { useOverlayMount } from '@/composables/useOverlayMount'

defineProps<{ show: boolean }>()
const emit = defineEmits<{ 'after-leave': [] }>()
const mountTo = useOverlayMount()
</script>

<template>
  <Teleport :to="mountTo">
    <Transition name="win11-window" appear @after-leave="emit('after-leave')">
      <div v-if="show" class="console-window-transition tool-window-layer"><slot /></div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.console-window-transition { position: absolute; inset: 0; pointer-events: none; }
</style>
