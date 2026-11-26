<script setup lang="ts">
import { inject } from 'vue'
import { toolbarItemLabelKey } from '@/composables/useToolbarLayout'
defineOptions({ inheritAttrs: false })
defineProps<{
  collected: boolean
  target: HTMLElement | null
  order: number
}>()
const emit = defineEmits<{ activate: [] }>()
const itemLabel = inject(toolbarItemLabelKey, () => false)
const labelAttr = (id: unknown) => typeof id === 'string' && itemLabel(id) ? '' : undefined
</script>

<template>
  <Teleport :to="target ?? 'body'" :disabled="!collected || !target">
    <div v-show="!collected || target" v-bind="$attrs" class="toolbar-icon-slot" :data-toolbar-label="labelAttr($attrs['data-toolbar-item'])" :style="{ order }" @click="emit('activate')">
      <slot />
    </div>
  </Teleport>
</template>
