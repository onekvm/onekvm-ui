<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import { useMessage } from 'naive-ui'

import type { OneKVMStatus } from '@/api/client'
import { useOverlayMount } from '@/composables/useOverlayMount'
import { t } from '@/i18n/runtime'
import { cameraShare, type CameraShareState, type CameraSource } from '@/lib/camera-share'
import { DISMISS_CONTROL_OVERLAY_EVENT } from '@/lib/overlay-target'
import ControlOverlay from './ControlOverlay.vue'

const props = defineProps<{
  status: OneKVMStatus | null
  placement?: 'top-end' | 'bottom-end' | 'right-start' | 'left-start'
  sheet?: boolean
}>()

const emit = defineEmits<{ 'update:show': [show: boolean] }>()

const message = useMessage()
const overlayTo = useOverlayMount()
const popoverOpen = shallowRef(false)
const sourceMenuOpen = shallowRef(false)
const share = shallowRef<CameraShareState>(cameraShare.state())
const devices = shallowRef<{ label: string; value: string }[]>([])
const screenSupported = cameraShare.screenSupported()
const preview = shallowRef<HTMLVideoElement | null>(null)
const unsubscribe = cameraShare.subscribe(state => { share.value = state })
onBeforeUnmount(unsubscribe)

const camera = computed(() => props.status?.camera)
const busy = computed(() => !share.value.sharing && Boolean(camera.value?.session))
const host = computed(() => share.value.host ?? camera.value ?? null)
const statusText = computed(() => {
  if (share.value.error === 'connection') return t('camera.connectionLost', 'Camera connection lost. Reconnecting…')
  if (busy.value) return t('camera.busy', 'Another session is sharing its camera.')
  if (!share.value.sharing) return t('camera.hint', 'Shares a camera, screen or video file from this browser with the controlled device as a USB camera. Apps on the controlled device must support H.264 cameras. Only one session can share at a time.')
  if (host.value?.streaming) {
    return t('camera.streaming', 'The controlled device is using the camera: {width}×{height}, {fps} fps')
      .replace('{width}', String(host.value.width))
      .replace('{height}', String(host.value.height))
      .replace('{fps}', String(host.value.fps))
  }
  return t('camera.waiting', 'The picture is sent once an app on the controlled device opens the camera.')
})

watch(() => [preview.value, share.value.stream] as const, ([video, stream]) => {
  if (!video) return
  if (video.srcObject !== stream) video.srcObject = stream
  if (stream) void video.play().catch(() => undefined)
}, { immediate: true })

const sourceOptions = computed(() => [
  ...devices.value.map(device => ({ value: `camera:${device.value}`, label: device.label })),
  ...(screenSupported ? [{ value: 'screen', label: t('camera.sourceScreen', 'Screen') }] : []),
  {
    value: 'file',
    label: share.value.fileName
      ? t('camera.sourceFileNamed', 'Video file: {name}').replace('{name}', share.value.fileName)
      : t('camera.sourceFile', 'Video file…'),
  },
])

const sourceValue = computed(() => {
  if (share.value.source !== 'camera') return share.value.source
  const selected = `camera:${share.value.deviceId}`
  if (sourceOptions.value.some(option => option.value === selected)) return selected
  return sourceOptions.value[0]?.value.startsWith('camera:') ? sourceOptions.value[0].value : null
})

watch(popoverOpen, open => { if (open) void loadDevices() })

async function loadDevices() {
  try {
    const list = await cameraShare.devices()
    devices.value = list.map((device, index) => ({
      value: device.deviceId,
      label: device.label || `${t('camera.title', 'Camera')} ${index + 1}`,
    }))
  } catch {
    devices.value = []
  }
}

function updateShow(open: boolean) {
  if (!open && sourceMenuOpen.value) return
  popoverOpen.value = open
  emit('update:show', open)
}

function forceClose() {
  sourceMenuOpen.value = false
  updateShow(false)
}

onMounted(() => window.addEventListener(DISMISS_CONTROL_OVERLAY_EVENT, forceClose))
onBeforeUnmount(() => window.removeEventListener(DISMISS_CONTROL_OVERLAY_EVENT, forceClose))

async function requestShare(value: boolean) {
  if (share.value.starting || value === share.value.sharing) return
  if (!value) {
    cameraShare.stop()
    return
  }
  if (busy.value) {
    message.warning(t('camera.busy', 'Another session is sharing its camera.'))
    return
  }
  try {
    const granted = await cameraShare.start()
    if (!granted) message.warning(t('camera.busy', 'Another session is sharing its camera.'))
    else void loadDevices()
  } catch {
    reportError()
  }
}

function requestSource(value: string) {
  if (value === 'file') {
    // The picker outlives this popover, so its input is not part of it.
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'video/*'
    input.addEventListener('change', () => {
      const file = input.files?.[0]
      if (file) void changeSource('file', { file })
    }, { once: true })
    input.click()
    return
  }
  if (value === 'screen') void changeSource('screen')
  else if (value !== sourceValue.value) void changeSource('camera', { deviceId: value.slice('camera:'.length) })
}

async function changeSource(source: CameraSource, options: { deviceId?: string; file?: File } = {}) {
  try {
    await cameraShare.selectSource(source, options)
  } catch {
    reportError()
  }
}

function reportError() {
  const { error, errorMessage } = cameraShare.state()
  if (!error) return
  if (error === 'codec') message.warning(t('camera.codecUnsupported', 'This browser cannot encode H.264 video. Use a recent version of Chrome, Edge, Firefox or Safari.'))
  else if (error === 'file') message.warning(t('camera.fileUnplayable', 'This video file cannot be played. Choose another file.'))
  else if (error === 'permission') message.warning(t('camera.permissionDenied', 'Camera access was not granted. Allow it in your browser and try again.'))
  else if (error === 'unavailable') message.warning(t('camera.unavailable', 'This camera cannot be opened. Close other apps using it or choose another camera.'))
  else if (error === 'disabled') message.warning(t('camera.disabled', 'The USB camera is turned off in USB settings.'))
  else if (error === 'busy') message.warning(t('camera.busy', 'Another session is sharing its camera.'))
  else message.error(errorMessage || t('camera.connectionFailed', 'Could not connect to the camera service.'))
}
</script>

<template>
  <ControlOverlay
    :show="popoverOpen"
    :sheet="sheet"
    :placement="placement"
    popover-class="control-popover display-status-control-popover"
    to=".console-workspace"
    @update:show="updateShow"
  >
    <slot />
    <template #title>{{ t('camera.title', 'Camera') }}</template>
    <template #panel>
    <div class="display-status-popover">
      <header class="control-popover-header">
        <strong>{{ t('camera.title', 'Camera') }}</strong>
      </header>
      <div class="display-status-values">
        <div>
          <span>{{ t('camera.share', 'Share camera') }}</span>
          <n-switch
            size="small"
            :value="share.sharing"
            :loading="share.starting"
            :disabled="share.starting || (busy && !share.sharing)"
            :aria-label="t('camera.share', 'Share camera')"
            @update:value="requestShare"
          />
        </div>
        <div class="usb-audio-format">
          <span>{{ t('camera.source', 'Source') }}</span>
          <n-select
            :value="sourceValue"
            :options="sourceOptions"
            :size="sheet ? 'medium' : 'tiny'"
            :menu-size="sheet ? 'medium' : 'tiny'"
            :disabled="share.starting"
            :to="overlayTo"
            :menu-props="{ class: 'display-fit-select-menu' }"
            :aria-label="t('camera.source', 'Source')"
            @update:value="requestSource"
            @update:show="sourceMenuOpen = $event"
          />
        </div>
      </div>
      <video
        v-if="share.stream"
        ref="preview"
        class="camera-preview"
        muted
        playsinline
        :aria-label="t('camera.preview', 'Camera preview')"
      />
      <p class="usb-audio-hint" role="status">{{ statusText }}</p>
    </div>
    </template>
  </ControlOverlay>
</template>

<style scoped>
.camera-preview {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  margin-top: 8px;
  border-radius: 6px;
  background: #000;
  object-fit: cover;
}
</style>
