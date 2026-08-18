<script setup lang="ts">
import { computed } from 'vue'

import { t } from '@/i18n/runtime'
import type { VideoFit } from '@/lib/video-fit'

const props = defineProps<{
  videoWidth: number
  videoHeight: number
  videoFps: number
  videoBitrate: number
  videoResolution: number
  targetFps: number
  codec: string
  transport: 'webrtc' | 'websocket' | 'mjpeg'
  machine: string
  variant: string
  videoFit: VideoFit
}>()

const emit = defineEmits<{
  'update:videoFit': [fit: VideoFit]
  'fit-menu-show': [show: boolean]
}>()

const fitOptions = computed(() => [
  { label: t('screen.fitOriginal', 'Original'), value: 'original' as const },
  { label: t('screen.fitStretch', 'Stretch'), value: 'stretch' as const },
])

function updateFit(value: string | number | null) {
  if (value !== 'original' && value !== 'stretch') return
  emit('update:videoFit', value)
}

const canvasSize = computed(() => {
  if (!props.videoWidth || !props.videoHeight) return '-'
  return `${props.videoWidth} × ${props.videoHeight}`
})

const targetResolution = computed(() => {
  if (props.videoResolution === 1080) return '1920 × 1080'
  if (props.videoResolution === 720) return '1280 × 720'
  if (props.videoResolution === 480) return '854 × 480'
  if (props.videoResolution > 0) return `${props.videoResolution}p`
  return t('screen.auto', 'Automatic')
})

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
        class="display-status-fit-select"
        size="tiny"
        menu-size="tiny"
        :value="videoFit"
        :options="fitOptions"
        :consistent-menu-width="false"
        :show-checkmark="false"
        :menu-props="{ class: 'display-fit-select-menu' }"
        @update:value="updateFit"
        @update:show="emit('fit-menu-show', $event)"
      />
    </div>
    <div>
      <span>{{ t('screen.canvasSize', 'Canvas size') }}</span>
      <strong>{{ canvasSize }}</strong>
    </div>
    <div>
      <span>{{ t('screen.targetResolution', 'Target resolution') }}</span>
      <strong>{{ targetResolution }}</strong>
    </div>
    <div>
      <span>{{ t('screen.targetFps', 'Target FPS') }}</span>
      <strong>{{ targetFps ? `${targetFps} FPS` : '-' }}</strong>
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
