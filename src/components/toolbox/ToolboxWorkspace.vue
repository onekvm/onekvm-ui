<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useToolboxContext, type ToolInstance } from '@/composables/useToolbox'
import { useOverlayMount } from '@/composables/useOverlayMount'
import { toolbarLauncherActive } from '@/lib/toolbar-dock'
import type { ToolPresentation } from '@/extensions/toolboxRuntime'
import ToolWindow from './ToolWindow.vue'
import ExtensionToolView from './ExtensionToolView.vue'
import { t } from '@/i18n/runtime'
const toolbox = useToolboxContext()
const mountTo = useOverlayMount()
const mobile = ref(toolbarLauncherActive(window.innerWidth, window.innerHeight))
const ordered = computed(() => [...toolbox.instances].sort((a, b) => a.sequence - b.sequence))
function presentation(instance: ToolInstance): ToolPresentation {
  return mobile.value ? 'fullscreen' : instance.tool.item.presentation
}
function resize() { mobile.value = toolbarLauncherActive(window.innerWidth, window.innerHeight) }
onMounted(() => window.addEventListener('resize', resize))
onBeforeUnmount(() => window.removeEventListener('resize', resize))
</script>
<template>
  <Teleport :to="mountTo">
    <TransitionGroup name="win11-window" tag="div" class="toolbox-workspace">
      <ToolWindow v-for="(instance, index) in ordered" :key="instance.cacheKey" v-show="!mobile || toolbox.activeId === instance.id"
        :title="toolbox.tools.find(t => t.id === instance.id)?.title || instance.tool.title" :presentation="presentation(instance)"
        :width="instance.windowSize?.width || instance.tool.item.size?.width || (instance.tool.item.presentation === 'drawer' ? 480 : 720)" :height="instance.windowSize?.height || instance.tool.item.size?.height"
        :layer="2300 + index * 2" :sequence="instance.sequence" :active="toolbox.activeId === instance.id"
        @focus="toolbox.focus(instance.id)" @close="toolbox.close(instance.id)">
        <ExtensionToolView :instance="instance" :presentation="presentation(instance)" />
      </ToolWindow>
    </TransitionGroup>
    <button v-if="mobile && toolbox.minimizedId" type="button" class="toolbox-record-return" data-toolbox-local @click="toolbox.focus(toolbox.minimizedId)">
      <span class="toolbox-record-dot" aria-hidden="true" />{{ t('toolbox.returnToRecording') }}
    </button>
  </Teleport>
</template>
<style scoped>
.toolbox-workspace { position: fixed; inset: 0; pointer-events: none; z-index: 1900; }
.toolbox-record-return { position: fixed; top: calc(env(safe-area-inset-top, 0px) + 12px); left: 50%; transform: translateX(-50%); z-index: 2399; min-height: 44px; max-width: calc(100vw - 32px); display: flex; align-items: center; gap: 8px; padding: 8px 14px; border: 1px solid var(--border); border-radius: var(--radius-large); color: var(--foreground); background: var(--onekvm-surface-overlay); box-shadow: var(--onekvm-shadow-panel); pointer-events: auto; }
.toolbox-record-dot { width: 8px; height: 8px; flex: none; border-radius: 50%; background: #e53935; }
</style>
