<script setup lang="ts">
import PerformanceBitrateMetric from './PerformanceBitrateMetric.vue'
import { Square, X } from '@/icons'
import { useTemplateRef } from 'vue'
import { t } from '@/i18n/runtime'
import { COMPACT_CHART_HEIGHT, COMPACT_CHART_WIDTH, formatCompactBitrate, formatCompactResolution } from '@/lib/performance-compact'
import { formatLatencyUs } from '@/lib/video-stream-chart'

defineProps<{
  videoFps: number
  videoBitrate: number
  bitrateHint: string
  inputWidth: number
  inputHeight: number
  codec: string
  videoLatencyUs: number
  audioLatencyUs?: number
  audioEnabled?: boolean
  chart: { fps: string; fpsArea: string; bitrate: string }
  docked?: boolean
}>()
const emit = defineEmits<{
  drag: [event: PointerEvent]
  expand: []
  close: []
  undock: []
}>()
const element = useTemplateRef<HTMLElement>('element')
defineExpose({ element })
</script>

<template>
  <div
    ref="element"
    class="performance-compact-bar"
    :class="{ 'is-docked': docked }"
    :aria-label="t('screen.performance', 'Performance')"
    tabindex="0"
    @pointerdown.stop="emit('drag', $event)"
    @keydown.enter.prevent="emit('expand')"
    @keydown.escape.prevent="docked && emit('undock')"
  >
    <svg class="performance-compact-chart" :viewBox="`0 0 ${COMPACT_CHART_WIDTH} ${COMPACT_CHART_HEIGHT}`" :width="COMPACT_CHART_WIDTH" :height="COMPACT_CHART_HEIGHT" aria-hidden="true">
      <path v-if="chart.fpsArea" class="performance-compact-chart-fps-fill" :d="chart.fpsArea" />
      <path v-if="chart.bitrate" class="performance-compact-chart-bitrate" :d="chart.bitrate" />
      <path v-if="chart.fps" class="performance-compact-chart-fps" :d="chart.fps" />
    </svg>
    <span class="performance-compact-metric"><span>FPS</span><strong>{{ videoFps }}</strong></span>
    <span class="performance-compact-sep" />
    <span class="performance-compact-metric" :aria-label="`${t('screen.videoLatency', 'Video latency')}: ${formatLatencyUs(videoLatencyUs)}`"><span>{{ t('screen.performanceCompact.videoLatency', 'V. lat.') }}</span><strong>{{ formatLatencyUs(videoLatencyUs) }}</strong></span>
    <template v-if="audioEnabled">
      <span class="performance-compact-sep" />
      <span class="performance-compact-metric" :aria-label="`${t('screen.audioLatencyColumn', 'Audio latency')}: ${formatLatencyUs(audioLatencyUs ?? 0)}`"><span>{{ t('screen.performanceCompact.audioLatency', 'A. lat.') }}</span><strong>{{ formatLatencyUs(audioLatencyUs ?? 0) }}</strong></span>
    </template>
    <span class="performance-compact-sep" />
    <span class="performance-compact-metric performance-compact-resolution"><span>{{ t('screen.performanceCompact.resolution', 'Res.') }}</span><strong>{{ formatCompactResolution(inputWidth, inputHeight) }}</strong></span>
    <span class="performance-compact-sep" />
    <PerformanceBitrateMetric compact :value="formatCompactBitrate(videoBitrate)" :hint="bitrateHint" />
    <span class="performance-compact-sep" />
    <span class="performance-compact-metric performance-compact-codec"><span>{{ t('screen.codec', 'Codec') }}</span><strong>{{ codec || '—' }}</strong></span>
    <div v-if="!docked" class="performance-window-actions host-window-actions" @pointerdown.stop @keydown.stop>
      <n-button quaternary circle size="tiny" :aria-label="t('screen.performanceExpand', 'Expand performance overlay')" @click="emit('expand')"><template #icon><Square :size="11" /></template></n-button>
      <n-button quaternary circle size="tiny" :aria-label="t('screen.hidePerformance', 'Hide performance overlay')" @click="emit('close')"><template #icon><X :size="13" /></template></n-button>
    </div>
  </div>
</template>
