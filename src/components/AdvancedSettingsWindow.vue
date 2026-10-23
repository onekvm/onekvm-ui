<script setup lang="ts">
import { computed, defineAsyncComponent, h, onBeforeUnmount, shallowRef } from 'vue'
import { Settings } from '@/icons'
import { t } from '@/i18n/runtime'
import type { OneKVMStatus } from '@/api/client'
import type { MediaTransferState } from '@/lib/media-transfer'
import { useOverlayMount } from '@/composables/useOverlayMount'
import { registerConsoleWindowLayer } from '@/composables/useConsoleWindowLayer'
import ToolWindow from './toolbox/ToolWindow.vue'
import AdvancedSettingsLoading from './AdvancedSettingsLoading.vue'

const props = defineProps<{
  status: OneKVMStatus | null
  canChangeVideo: boolean
  videoSessionId: string
  mediaTransfer: MediaTransferState
}>()
const emit = defineEmits<{ close: []; 'restore-media-transfer': []; focus: [] }>()
const Page = defineAsyncComponent({
  loader: () => import('./AdvancedSettingsPage.vue'),
  loadingComponent: () => h(AdvancedSettingsLoading, { embedded: true }),
  delay: 200,
})
const mountTo = useOverlayMount()
const group = registerConsoleWindowLayer()
const state = shallowRef<'normal' | 'maximized' | 'minimized'>('normal')
let restoreState: 'normal' | 'maximized' = 'normal'
const sequence = shallowRef(0)
const route = shallowRef('system')
const visible = computed(() => state.value !== 'minimized')
function focus() {
  if (state.value === 'minimized') state.value = restoreState
  group.raise()
  sequence.value++
  emit('focus')
}
function setState(next: 'normal' | 'maximized' | 'minimized') {
  if (next === 'minimized') restoreState = state.value === 'maximized' ? 'maximized' : 'normal'
  state.value = next
  if (next !== 'minimized') focus()
}
onBeforeUnmount(group.dispose)
defineExpose({ focus })
</script>
<template>
  <Teleport :to="mountTo">
    <ToolWindow v-show="visible" class="advanced-settings-window" :title="t('settings.advancedSettings.title')"
      presentation="window" content-layout="edge-to-edge" :width="1060" :height="720"
      :layer="group.layer.value" :active="group.active.value" :sequence="sequence" :state="state"
      @focus="focus" @update:state="setState" @close="emit('close')">
      <template #title-icon><Settings :size="18" /></template>
      <Page :embedded="true" :status="props.status" :route="route" :can-change-video="canChangeVideo"
        :video-session-id="videoSessionId" :media-transfer="mediaTransfer"
        @navigate="route = $event" @close="emit('close')" @restore-media-transfer="emit('restore-media-transfer')" />
    </ToolWindow>
  </Teleport>
</template>
<style scoped>
.advanced-settings-window :deep(.tool-window-content) { height: 100%; overflow: hidden; }
.advanced-settings-window :deep(.advanced-settings-root) { width: 100%; }
</style>
