<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue'
import { Database } from '@/icons'
import { t } from '@/i18n/runtime'
import { registerConsoleWindowLayer } from '@/composables/useConsoleWindowLayer'
import { PHONE_UI_QUERY } from '@/lib/mobile-viewport'
import ToolWindow from './toolbox/ToolWindow.vue'

const emit = defineEmits<{ close: [] }>()
const group = registerConsoleWindowLayer()
const viewportQuery = window.matchMedia(PHONE_UI_QUERY)
const mobile = shallowRef(viewportQuery.matches)
const state = shallowRef<'normal' | 'maximized' | 'minimized'>('normal')
const sequence = shallowRef(0)
const visible = computed(() => state.value !== 'minimized')
let restoreState: 'normal' | 'maximized' = 'normal'

function focus() {
  if (state.value === 'minimized') state.value = restoreState
  group.raise()
  sequence.value++
}

function setState(next: 'normal' | 'maximized' | 'minimized') {
  if (next === 'minimized') restoreState = state.value === 'maximized' ? 'maximized' : 'normal'
  state.value = next
  if (next !== 'minimized') focus()
}

function updateViewport() { mobile.value = viewportQuery.matches }
onMounted(() => viewportQuery.addEventListener('change', updateViewport))
onBeforeUnmount(() => {
  viewportQuery.removeEventListener('change', updateViewport)
  group.dispose()
})
defineExpose({ focus })
</script>

<template>
    <ToolWindow v-show="visible" class="virtual-media-window" :title="t('virtualMedia.title', 'Virtual Media')"
      :presentation="mobile ? 'fullscreen' : 'window'" content-layout="edge-to-edge" :width="820" :height="600"
      :layer="group.layer.value" :active="group.active.value" :sequence="sequence" :state="state"
      @focus="focus" @update:state="setState" @close="emit('close')">
      <template #title-icon><Database :size="18" /></template>
      <slot />
    </ToolWindow>
</template>

<style scoped>
.virtual-media-window :deep(.tool-window-content) { container: virtual-media / inline-size; }
</style>
