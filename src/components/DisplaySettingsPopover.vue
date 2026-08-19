<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useMessage } from 'naive-ui'

import { api } from '@/api/client'
import { t } from '@/i18n/runtime'
import { onekvm } from '@/lib/onekvm'
import type { VideoFit } from '@/lib/video-fit'
import { isVideoResolutionValue, videoResolutionOptions } from '@/lib/video-resolution'

const props = defineProps<{
  videoResolution: number
  targetFps: number
  videoFit: VideoFit
  canChangeVideo: boolean
}>()

const emit = defineEmits<{
  'update:show': [show: boolean]
  'update:videoFit': [fit: VideoFit]
}>()

const message = useMessage()
const popoverOpen = ref(false)
const menuOpen = ref(false)
const saving = ref(false)
const resolution = ref(props.videoResolution)
const fps = ref(props.targetFps)

watch(() => props.videoResolution, (value) => { resolution.value = value })
watch(() => props.targetFps, (value) => { fps.value = value })

const fitOptions = computed(() => [
  { label: t('screen.fitOriginal', 'Original'), value: 'original' as const },
  { label: t('screen.fitStretch', 'Stretch'), value: 'stretch' as const },
])
const resolutionOptions = computed(() =>
  videoResolutionOptions(t('screen.auto', 'Automatic')),
)
const fpsOptions = [10, 15, 24, 30, 45, 60].map((value) => ({
  label: `${value} FPS`,
  value,
}))
const videoDisabled = computed(() => !props.canChangeVideo || saving.value)

function updateShow(show: boolean) {
  if (!show && menuOpen.value) return
  popoverOpen.value = show
  emit('update:show', show)
}

async function patchVideo(key: 'video.resolution' | 'video.fps', value: number) {
  if (!props.canChangeVideo || saving.value) return
  saving.value = true
  try {
    await api.patchConfig(key, String(value))
    if (key === 'video.resolution') {
      await onekvm.reconnect()
    }
  } catch (reason) {
    resolution.value = props.videoResolution
    fps.value = props.targetFps
    message.error(reason instanceof Error ? reason.message : String(reason))
  } finally {
    saving.value = false
  }
}

function updateFit(value: string | number | null) {
  if (value !== 'original' && value !== 'stretch') return
  emit('update:videoFit', value)
}

function updateResolution(value: string | number | null) {
  if (typeof value !== 'number' || !isVideoResolutionValue(value)) return
  if (value === resolution.value) return
  resolution.value = value
  void patchVideo('video.resolution', value)
}

function updateFps(value: string | number | null) {
  if (typeof value !== 'number' || value < 1) return
  if (value === fps.value) return
  fps.value = value
  void patchVideo('video.fps', value)
}
</script>

<template>
  <n-popover
    :show="popoverOpen"
    trigger="click"
    placement="bottom-end"
    :show-arrow="false"
    class="control-popover display-status-control-popover"
    to=".console-workspace"
    @update:show="updateShow"
  >
    <template #trigger><slot /></template>
    <div class="display-status-popover">
      <header class="control-popover-header">
        <strong>{{ t('settings.screen.title', 'Display') }}</strong>
      </header>
      <div class="display-status-values">
        <div>
          <span>{{ t('screen.fitMode', 'Display mode') }}</span>
          <n-select
            class="display-status-select"
            size="tiny"
            menu-size="tiny"
            :value="videoFit"
            :options="fitOptions"
            :consistent-menu-width="false"
            :show-checkmark="false"
            to=".console-workspace"
            :menu-props="{ class: 'display-fit-select-menu' }"
            @update:value="updateFit"
            @update:show="menuOpen = $event"
          />
        </div>
        <div>
          <span>{{ t('screen.targetResolution', 'Target resolution') }}</span>
          <n-select
            class="display-status-select"
            size="tiny"
            menu-size="tiny"
            :value="resolution"
            :options="resolutionOptions"
            :disabled="videoDisabled"
            :consistent-menu-width="false"
            :show-checkmark="false"
            to=".console-workspace"
            :menu-props="{ class: 'display-fit-select-menu' }"
            @update:value="updateResolution"
            @update:show="menuOpen = $event"
          />
        </div>
        <div>
          <span>{{ t('screen.targetFps', 'Target FPS') }}</span>
          <n-select
            class="display-status-select"
            size="tiny"
            menu-size="tiny"
            :value="fps"
            :options="fpsOptions"
            :disabled="videoDisabled"
            :consistent-menu-width="false"
            :show-checkmark="false"
            to=".console-workspace"
            :menu-props="{ class: 'display-fit-select-menu' }"
            @update:value="updateFps"
            @update:show="menuOpen = $event"
          />
        </div>
      </div>
    </div>
  </n-popover>
</template>
