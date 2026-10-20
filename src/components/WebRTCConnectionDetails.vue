<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef, useId } from 'vue'
import { t } from '@/i18n/runtime'
import { formatCandidateEndpoint, type WebRTCConnectionStats } from '@/lib/webrtc-connection-stats'

const props = defineProps<{ stats?: WebRTCConnectionStats | null }>()
const hovered = shallowRef(false)
const focused = shallowRef(false)
const dismissed = shallowRef(false)
const detailsId = useId()
const show = computed(() => !dismissed.value && (hovered.value || focused.value))
const rows = computed(() => {
  const stats = props.stats
  const candidateDetails = (side: 'local' | 'remote') => {
    const value = stats?.[side] ?? null
    const meta = [value?.type, value?.protocol?.toUpperCase(), value?.relayProtocol?.toUpperCase()].filter(Boolean)
    return [formatCandidateEndpoint(value), ...meta].join(' · ')
  }
  const ms = (value: number | null | undefined) => value == null ? '—' : `${Number(value.toFixed(2))} ms`
  return [
    ['connectionState', stats?.connectionState ?? '—'],
    ['iceState', stats?.iceState ?? '—'],
    ['dtlsState', stats?.dtlsState ?? '—'],
    ['local', candidateDetails('local')],
    ['remote', candidateDetails('remote')],
    ['rtt', ms(stats?.rttMs)],
    ['jitter', ms(stats?.jitterMs)],
    ['packetsLost', stats?.packetsLost?.toString() ?? '—'],
  ]
})

function updateHover(value: boolean) {
  hovered.value = value
  if (value) dismissed.value = false
}
function dismiss(event: KeyboardEvent) {
  if (event.key === 'Escape' && show.value) dismissed.value = true
}
onMounted(() => document.addEventListener('keydown', dismiss))
onBeforeUnmount(() => document.removeEventListener('keydown', dismiss))
</script>

<template>
  <n-tooltip
    trigger="hover"
    placement="bottom-end"
    :show="show"
    :keep-alive-on-hover="true"
    to=".console-workspace"
    :z-index="4000"
    :style="{ maxWidth: 'min(400px, calc(100vw - 32px))', maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto' }"
    @update:show="updateHover"
  >
    <template #trigger>
      <strong
        class="webrtc-details-trigger"
        tabindex="0"
        :aria-label="t('screen.webrtcDetails.title')"
        :aria-describedby="show ? detailsId : undefined"
        @focus="focused = true; dismissed = false"
        @blur="focused = false"
        @keydown.esc.stop="dismissed = true"
      >WebRTC</strong>
    </template>
    <div :id="detailsId" class="webrtc-details">
      <strong>{{ t('screen.webrtcDetails.title') }}</strong>
      <span v-if="!stats" class="webrtc-details-waiting">{{ t('screen.streamChartEmpty') }}</span>
      <dl v-else>
        <template v-for="[key, value] in rows" :key="key">
          <dt>{{ t(`screen.webrtcDetails.${key}`) }}</dt>
          <dd>{{ value }}</dd>
        </template>
      </dl>
    </div>
  </n-tooltip>
</template>

<style scoped>
.webrtc-details-trigger { cursor: help; }
.webrtc-details-trigger:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; border-radius: 3px; }
.webrtc-details { font-size: 12px; line-height: 1.5; user-select: text; }
.webrtc-details > strong { display: block; margin-bottom: 8px; }
.webrtc-details-waiting { display: block; }
.webrtc-details dl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 5px 16px; margin: 0; }
.webrtc-details dt { opacity: 0.7; }
.webrtc-details dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
</style>
