<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { GripHorizontal, Monitor, Pin, PinOff } from '@lucide/vue'
import { useMessage } from 'naive-ui'

import { api } from '@/api/client'
import { t } from '@/i18n/runtime'
import { onekvm } from '@/lib/onekvm'
import type { VideoFit } from '@/lib/video-fit'

import DisplayStatusValues from './DisplayStatusValues.vue'

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
  canChangeVideo: boolean
}>()

const emit = defineEmits<{
  'update:show': [show: boolean]
  'update:videoFit': [fit: VideoFit]
}>()

const message = useMessage()
const popoverOpen = ref(false)
const pinned = ref(false)
const menuOpen = ref(false)
const saving = ref(false)
const resolution = ref(props.videoResolution)
const fps = ref(props.targetFps)

watch(() => props.videoResolution, (value) => { resolution.value = value })
watch(() => props.targetFps, (value) => { fps.value = value })
const panel = ref<HTMLElement | null>(null)
const position = ref({ x: 24, y: 58 })
let dragOffset = { x: 0, y: 0 }
let dragging = false

const panelStyle = computed(() => ({
  left: `${position.value.x}px`,
  top: `${position.value.y}px`,
}))

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
    await onekvm.reconnect()
  } catch (reason) {
    resolution.value = props.videoResolution
    fps.value = props.targetFps
    message.error(reason instanceof Error ? reason.message : String(reason))
  } finally {
    saving.value = false
  }
}

function updateResolution(value: number) {
  if (value === resolution.value) return
  resolution.value = value
  void patchVideo('video.resolution', value)
}

function updateFps(value: number) {
  if (value === fps.value) return
  fps.value = value
  void patchVideo('video.fps', value)
}

function clampPosition() {
  if (!panel.value) return
  const rect = panel.value.getBoundingClientRect()
  position.value = {
    x: Math.max(8, Math.min(window.innerWidth - rect.width - 8, position.value.x)),
    y: Math.max(50, Math.min(window.innerHeight - rect.height - 8, position.value.y)),
  }
}

async function placePanel() {
  await nextTick()
  if (!panel.value) return
  const rect = panel.value.getBoundingClientRect()
  position.value = {
    x: Math.max(8, window.innerWidth - rect.width - 18),
    y: 58,
  }
  clampPosition()
}

function pinPanel() {
  pinned.value = true
  popoverOpen.value = false
  emit('update:show', false)
  void placePanel()
}

function togglePin() {
  if (pinned.value) unpinPanel()
  else pinPanel()
}

function unpinPanel() {
  pinned.value = false
  popoverOpen.value = true
  emit('update:show', true)
}

function startDrag(event: PointerEvent) {
  if (event.button !== 0 || !panel.value || window.innerWidth < 768) return
  const rect = panel.value.getBoundingClientRect()
  dragOffset = { x: event.clientX - rect.left, y: event.clientY - rect.top }
  dragging = true
  window.addEventListener('pointermove', drag)
  window.addEventListener('pointerup', stopDrag, { once: true })
}

function drag(event: PointerEvent) {
  if (!dragging) return
  position.value = { x: event.clientX - dragOffset.x, y: event.clientY - dragOffset.y }
  clampPosition()
}

function stopDrag() {
  dragging = false
  window.removeEventListener('pointermove', drag)
}

onMounted(() => window.addEventListener('resize', clampPosition))

onBeforeUnmount(() => {
  window.removeEventListener('resize', clampPosition)
  window.removeEventListener('pointermove', drag)
})
</script>

<template>
  <n-popover
    :show="popoverOpen"
    trigger="click"
    placement="bottom-end"
    :show-arrow="false"
    class="control-popover display-status-control-popover"
    @update:show="updateShow"
  >
    <template #trigger><slot /></template>
    <div class="display-status-popover">
      <header class="control-popover-header">
        <strong>{{ t('settings.screen.title', 'Display') }}</strong>
        <div class="control-popover-header-actions">
          <n-tooltip to="body" :z-index="4000">
            <template #trigger>
              <n-button quaternary circle size="tiny" @click="togglePin">
                <template #icon>
                  <PinOff v-if="pinned" />
                  <Pin v-else />
                </template>
              </n-button>
            </template>
            {{ pinned ? t('screen.unpinStatus', 'Unpin display status') : t('screen.pinStatus', 'Pin display status') }}
          </n-tooltip>
        </div>
      </header>
      <DisplayStatusValues
        :canvas-width="canvasWidth"
        :canvas-height="canvasHeight"
        :video-fps="videoFps"
        :video-bitrate="videoBitrate"
        :video-resolution="resolution"
        :target-fps="fps"
        :codec="codec"
        :transport="transport"
        :machine="machine"
        :variant="variant"
        :video-fit="videoFit"
        :video-disabled="!canChangeVideo || saving"
        @update:video-fit="emit('update:videoFit', $event)"
        @update:video-resolution="updateResolution"
        @update:target-fps="updateFps"
        @menu-show="menuOpen = $event"
      />
    </div>
  </n-popover>

  <Teleport to="body">
    <section
      v-if="pinned"
      ref="panel"
      class="display-status-window"
      :style="panelStyle"
      role="dialog"
      :aria-label="t('settings.screen.title', 'Display')"
    >
      <header class="display-status-titlebar" @pointerdown="startDrag">
        <GripHorizontal :size="15" class="floating-window-grip" />
        <Monitor :size="15" />
        <strong>{{ t('settings.screen.title', 'Display') }}</strong>
        <div class="control-popover-header-actions" @pointerdown.stop>
          <n-tooltip to="body" :z-index="4000">
            <template #trigger>
              <n-button quaternary circle size="tiny" :aria-label="t('screen.unpinStatus', 'Unpin display status')" @click="unpinPanel">
                <template #icon><PinOff /></template>
              </n-button>
            </template>
            {{ t('screen.unpinStatus', 'Unpin display status') }}
          </n-tooltip>
        </div>
      </header>

      <div class="display-status-content">
        <DisplayStatusValues
          :canvas-width="canvasWidth"
          :canvas-height="canvasHeight"
          :video-fps="videoFps"
          :video-bitrate="videoBitrate"
          :video-resolution="resolution"
          :target-fps="fps"
          :codec="codec"
          :transport="transport"
          :machine="machine"
          :variant="variant"
          :video-fit="videoFit"
          :video-disabled="!canChangeVideo || saving"
          @update:video-fit="emit('update:videoFit', $event)"
          @update:video-resolution="updateResolution"
          @update:target-fps="updateFps"
          @menu-show="menuOpen = $event"
        />
      </div>
    </section>
  </Teleport>
</template>
