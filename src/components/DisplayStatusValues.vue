<script setup lang="ts">
import { computed } from 'vue'

import { t } from '@/i18n/runtime'

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
}>()

const resolution = computed(() => {
  if (props.videoWidth) return `${props.videoWidth} × ${props.videoHeight}`
  if (props.videoResolution) return `${props.videoResolution}p`
  return '-'
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
      <span>{{ t('screen.resolution', 'Resolution') }}</span>
      <strong>{{ resolution }}</strong>
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
      <span>{{ t('screen.targetFps', 'Target FPS') }}</span>
      <strong>{{ targetFps ? `${targetFps} FPS` : '-' }}</strong>
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
