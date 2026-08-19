<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Activity, GripHorizontal, X } from '@lucide/vue'

import { t } from '@/i18n/runtime'
import { useVideoStreamHistory } from '@/composables/useVideoStreamHistory'

import DisplayStatusValues from './DisplayStatusValues.vue'

const props = defineProps<{
  canvasWidth: number
  canvasHeight: number
  videoFps: number
  videoBitrate: number
  targetFps: number
  codec: string
  transport: 'webrtc' | 'websocket' | 'mjpeg'
  inputWidth: number
  inputHeight: number
}>()

const emit = defineEmits<{
  close: []
}>()

const { samples } = useVideoStreamHistory(() => props.videoFps, () => props.videoBitrate)
const panel = ref<HTMLElement | null>(null)
const position = ref({ x: 24, y: 58 })
let dragOffset = { x: 0, y: 0 }
let dragging = false

const panelStyle = computed(() => ({
  left: `${position.value.x}px`,
  top: `${position.value.y}px`,
}))

function hostRect() {
  const host = panel.value?.offsetParent
  if (host instanceof HTMLElement) return host.getBoundingClientRect()
  return new DOMRect(0, 0, window.innerWidth, window.innerHeight)
}

function clampPosition() {
  if (!panel.value) return
  const host = hostRect()
  const rect = panel.value.getBoundingClientRect()
  position.value = {
    x: Math.max(8, Math.min(host.width - rect.width - 8, position.value.x)),
    y: Math.max(50, Math.min(host.height - rect.height - 8, position.value.y)),
  }
}

async function placePanel() {
  await nextTick()
  if (!panel.value) return
  const host = hostRect()
  const rect = panel.value.getBoundingClientRect()
  position.value = {
    x: Math.max(8, host.width - rect.width - 18),
    y: 58,
  }
  clampPosition()
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
  const host = hostRect()
  position.value = {
    x: event.clientX - host.left - dragOffset.x,
    y: event.clientY - host.top - dragOffset.y,
  }
  clampPosition()
}

function stopDrag() {
  dragging = false
  window.removeEventListener('pointermove', drag)
}

onMounted(() => {
  window.addEventListener('resize', clampPosition)
  void placePanel()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', clampPosition)
  window.removeEventListener('pointermove', drag)
})

watch(() => [props.canvasWidth, props.canvasHeight], () => clampPosition())
</script>

<template>
  <section
    ref="panel"
    class="video-performance-overlay"
    :style="panelStyle"
    role="dialog"
    :aria-label="t('screen.performance', 'Performance')"
  >
    <header class="display-status-titlebar" @pointerdown="startDrag">
      <GripHorizontal :size="15" class="floating-window-grip" />
      <Activity :size="15" />
      <strong>{{ t('screen.performance', 'Performance') }}</strong>
      <div class="control-popover-header-actions" @pointerdown.stop>
        <n-tooltip to=".console-workspace" :z-index="4000">
          <template #trigger>
            <n-button
              quaternary
              circle
              size="tiny"
              :aria-label="t('screen.hidePerformance', 'Hide performance overlay')"
              @click="emit('close')"
            >
              <template #icon><X /></template>
            </n-button>
          </template>
          {{ t('screen.hidePerformance', 'Hide performance overlay') }}
        </n-tooltip>
      </div>
    </header>
    <div class="display-status-content">
      <DisplayStatusValues
        :canvas-width="canvasWidth"
        :canvas-height="canvasHeight"
        :video-fps="videoFps"
        :video-bitrate="videoBitrate"
        :stream-samples="samples"
        :target-fps="targetFps"
        :codec="codec"
        :transport="transport"
        :input-width="inputWidth"
        :input-height="inputHeight"
      />
    </div>
  </section>
</template>
