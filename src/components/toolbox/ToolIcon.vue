<script setup lang="ts">
import { computed } from 'vue'
import { icons, LoaderCircle, Wrench } from '@lucide/vue'
import { extensionAssetURL } from '@/api/client'
import type { ToolboxTool } from '@/composables/useToolbox'
const props = defineProps<{ tool: ToolboxTool; loading?: boolean }>()
const icon = computed(() => props.tool.item.icon || props.tool.extension.icon)
const lucide = computed(() => {
  if (icon.value?.source !== 'lucide') return Wrench
  const name = icon.value.name.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('')
  return (icons as Record<string, typeof Wrench>)[name] || Wrench
})
const src = computed(() => icon.value?.source === 'custom' ? extensionAssetURL(props.tool.extension, icon.value.path) : '')
</script>
<template>
  <span class="tool-icon">
    <img v-if="src" :src="src" alt="" width="18" height="18" />
    <component v-else :is="lucide" :size="18" aria-hidden="true" />
    <LoaderCircle v-if="loading" class="tool-icon-spinner" :size="12" aria-hidden="true" />
  </span>
</template>
<style scoped>
.tool-icon { position: relative; display: inline-flex; width: 18px; height: 18px; align-items: center; justify-content: center; flex: none; }
.tool-icon-spinner { position: absolute; right: -5px; bottom: -5px; padding: 1px; border-radius: 50%; background: var(--onekvm-surface-overlay); color: var(--primary); animation: tool-icon-spin .8s linear infinite; }
@keyframes tool-icon-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .tool-icon-spinner { animation: none; } }
</style>
