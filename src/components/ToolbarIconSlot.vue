<script setup lang="ts">
defineOptions({ inheritAttrs: false })
defineProps<{
  collected: boolean
  target: HTMLElement | null
  order: number
}>()
const emit = defineEmits<{ activate: [] }>()
</script>

<template>
  <Teleport :to="target ?? 'body'" :disabled="!collected || !target">
    <div v-show="!collected || target" v-bind="$attrs" class="toolbar-icon-slot" :style="{ order }" @click="emit('activate')">
      <slot />
    </div>
  </Teleport>
</template>
