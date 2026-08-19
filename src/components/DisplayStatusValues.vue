<script setup lang="ts">
import { computed } from 'vue'

import { t } from '@/i18n/runtime'
import type { VideoFit } from '@/lib/video-fit'

const props = defineProps<{
  canvasWidth: number
  canvasHeight: number
  videoFps: number
  videoBitrate: number
  videoResolution: number
  targetFps: number
  codec: string
  transport: 'webrtc' | 'websocket' | 'mjpeg'
  machine: string
  variant: string
  videoFit: VideoFit
  videoDisabled: boolean
}>()

const emit = defineEmits<{
  'update:videoFit': [fit: VideoFit]
  'update:videoResolution': [resolution: number]
  'update:targetFps': [fps: number]
  'menu-show': [show: boolean]
}>()

const fitOptions = computed(() => [
  { label: t('screen.fitOriginal', 'Original'), value: 'original' as const },
  { label: t('screen.fitStretch', 'Stretch'), value: 'stretch' as const },
])

const resolutionOptions = computed(() => [
  { label: t('screen.auto', 'Automatic'), value: 0 },
  { label: '1920 x 1080', value: 1080 },
  { label: '1280 x 720', value: 720 },
  { label: '854 x 480', value: 480 },
])

const fpsOptions = [10, 15, 24, 30, 45, 60].map((value) => ({
  label: `${value} FPS`,
  value,
}))

const canvasSize = computed(() => {
  if (!props.canvasWidth || !props.canvasHeight) return '-'
  return `${props.canvasWidth} × ${props.canvasHeight}`
})

function updateFit(value: string | number | null) {
  if (value !== 'original' && value !== 'stretch') return
  emit('update:videoFit', value)
}

function updateResolution(value: string | number | null) {
  if (typeof value !== 'number') return
  if (value !== 0 && value !== 1080 && value !== 720 && value !== 480) return
  emit('update:videoResolution', value)
}

function updateFps(value: string | number | null) {
  if (typeof value !== 'number' || value < 1) return
  emit('update:targetFps', value)
}

const deviceVariant = computed(() => {
  const machine = props.machine === 'nanokvm' ? 'NanoKVM' : props.machine || '-'
  if (!props.variant) return machine
  const normalized = props.variant.toLowerCase()
  const variant = normalized === 'pcie' ? 'PCIe' : normalized === 'cube' ? 'Cube' : props.variant
  return `${machine} ${variant}`
})

const protocol = computed(() => {
  if (props.transport === 'webrtc') return 'WebRTC'
  if (props.transport === 'websocket') return 'WebSocket'
  if (props.transport === 'mjpeg') return t('screen.protocolHttpMjpeg', 'HTTP (MJPEG only)')
  return '-'
})
</script>

<template>
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
        :menu-props="{ class: 'display-fit-select-menu' }"
        @update:value="updateFit"
        @update:show="emit('menu-show', $event)"
      />
    </div>
    <div>
      <span>{{ t('screen.targetResolution', 'Target resolution') }}</span>
      <n-select
        class="display-status-select"
        size="tiny"
        menu-size="tiny"
        :value="videoResolution"
        :options="resolutionOptions"
        :disabled="videoDisabled"
        :consistent-menu-width="false"
        :show-checkmark="false"
        :menu-props="{ class: 'display-fit-select-menu' }"
        @update:value="updateResolution"
        @update:show="emit('menu-show', $event)"
      />
    </div>
    <div>
      <span>{{ t('screen.targetFps', 'Target FPS') }}</span>
      <n-select
        class="display-status-select"
        size="tiny"
        menu-size="tiny"
        :value="targetFps"
        :options="fpsOptions"
        :disabled="videoDisabled"
        :consistent-menu-width="false"
        :show-checkmark="false"
        :menu-props="{ class: 'display-fit-select-menu' }"
        @update:value="updateFps"
        @update:show="emit('menu-show', $event)"
      />
    </div>
    <div>
      <span>{{ t('screen.canvasSize', 'Canvas size') }}</span>
      <strong>{{ canvasSize }}</strong>
    </div>
    <div>
      <span>{{ t('screen.currentFps', 'Current FPS') }}</span>
      <strong>{{ videoFps }} FPS</strong>
    </div>
    <div>
      <span>{{ t('screen.bitrate', 'Bitrate') }}</span>
      <strong>{{ videoBitrate }} kbps</strong>
    </div>
    <div>
      <span>{{ t('screen.codec', 'Codec') }}</span>
      <strong>{{ codec || '-' }}</strong>
    </div>
    <div>
      <span>{{ t('screen.protocol', 'Protocol') }}</span>
      <strong>{{ protocol }}</strong>
    </div>
    <div>
      <span>{{ t('screen.deviceVariant', 'Device variant') }}</span>
      <strong>{{ deviceVariant }}</strong>
    </div>
  </div>
</template>
