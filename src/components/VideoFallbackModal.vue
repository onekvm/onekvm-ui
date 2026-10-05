<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'
import { RefreshCw, VideoOff, WifiOff } from '@lucide/vue'

import { t } from '@/i18n/runtime'
import type { VideoFallbackPrompt } from '@/lib/video-transport'

type FallbackAction = '' | 'websocket' | 'webrtc' | 'h264'

const props = defineProps<{
  show: boolean
  prompt: VideoFallbackPrompt
  loading: FallbackAction
  error?: string
}>()

const emit = defineEmits<{
  'use-websocket': []
  'retry-webrtc': []
  'switch-h264': []
}>()

const COUNTDOWN_SECONDS = 5
const seconds = shallowRef(COUNTDOWN_SECONDS)
let countdownTimer = 0
let countdownDeadline = 0

const hasCountdown = computed(
  () => props.prompt === 'webrtc-unsupported' || props.prompt === 'webrtc-failed',
)
const title = computed(() => {
  if (props.prompt === 'webrtc-unsupported') {
    return t('screen.webrtcUnsupportedTitle', 'This browser does not support WebRTC')
  }
  if (props.prompt === 'webrtc-failed') {
    return t('screen.webrtcConnectionFailedTitle', 'WebRTC connection failed')
  }
  return t('screen.h265UnsupportedTitle', 'H.265 is unavailable with this connection')
})
const detail = computed(() => {
  if (props.prompt === 'webrtc-unsupported') {
    return t(
      'screen.webrtcUnsupportedDetail',
      'OneKVM will use a WebSocket connection instead. Video and control latency may be higher.',
    )
  }
  if (props.prompt === 'webrtc-failed') {
    return t(
      'screen.webrtcConnectionFailedDetail',
      'WebRTC is temporarily unavailable. OneKVM will retry automatically, or you can switch to WebSocket; video and control latency may be higher.',
    )
  }
  return t(
    'screen.h265UnsupportedDetail',
    'This browser cannot play the current H.265 stream with this protocol. Switch to H.264 to continue. This reconnects the stream and affects all clients; H.264 may use more bandwidth.',
  )
})
const countdownLabel = computed(() => {
  const value = props.prompt === 'webrtc-failed'
    ? t('screen.webrtcRetryCountdown', 'Retrying WebRTC in {seconds}s')
    : t('screen.websocketFallbackCountdown', 'Using WebSocket in {seconds}s')
  return value.replace('{seconds}', String(seconds.value))
})
const primaryLabel = computed(() => {
  if (props.prompt === 'webrtc-unsupported') {
    return t('screen.useWebSocketNow', 'Use WebSocket now')
  }
  if (props.prompt === 'webrtc-failed') return t('screen.retryNow', 'Retry now')
  return t('screen.switchToH264', 'Switch to H.264')
})
const primaryLoading = computed(() => (
  (props.prompt === 'webrtc-unsupported' && props.loading === 'websocket')
  || (props.prompt === 'webrtc-failed' && props.loading === 'webrtc')
  || (props.prompt === 'h265-unsupported' && props.loading === 'h264')
))
const promptIcon = computed(() => {
  if (props.prompt === 'webrtc-failed') return RefreshCw
  if (props.prompt === 'h265-unsupported') return VideoOff
  return WifiOff
})

function stopCountdown() {
  window.clearInterval(countdownTimer)
  countdownTimer = 0
}

function runPrimaryAction() {
  if (!props.show || props.loading) return
  stopCountdown()
  if (props.prompt === 'webrtc-unsupported') emit('use-websocket')
  else if (props.prompt === 'webrtc-failed') emit('retry-webrtc')
  else if (props.prompt === 'h265-unsupported') emit('switch-h264')
}

function useWebSocket() {
  if (!props.show || props.loading) return
  stopCountdown()
  emit('use-websocket')
}

function tickCountdown() {
  const next = Math.max(0, Math.ceil((countdownDeadline - Date.now()) / 1000))
  seconds.value = next
  if (next > 0) return
  runPrimaryAction()
}

function startCountdown() {
  stopCountdown()
  seconds.value = COUNTDOWN_SECONDS
  countdownDeadline = Date.now() + COUNTDOWN_SECONDS * 1000
  countdownTimer = window.setInterval(tickCountdown, 250)
}

watch(
  [() => props.show, () => props.prompt, () => props.loading],
  ([show, _prompt, loading]) => {
    if (show && hasCountdown.value && !loading) startCountdown()
    else stopCountdown()
  },
  { immediate: true },
)

onBeforeUnmount(stopCountdown)
</script>

<template>
  <n-modal
    :show="show"
    to=".console-workspace"
    preset="card"
    class="connection-problem-modal"
    :title="title"
    :closable="false"
    :mask-closable="false"
    :close-on-esc="false"
    :auto-focus="false"
  >
    <div class="connection-problem-content" aria-live="assertive">
      <component :is="promptIcon" :size="42" aria-hidden="true" />
      <p>{{ detail }}</p>
      <p
        v-if="hasCountdown && !loading"
        class="video-fallback-countdown"
        role="timer"
        aria-live="off"
      >
        {{ countdownLabel }}
      </p>
      <code v-if="error">{{ error }}</code>
    </div>
    <template #footer>
      <div class="connection-problem-actions">
        <n-button
          v-if="prompt === 'webrtc-failed'"
          :disabled="Boolean(loading)"
          :loading="loading === 'websocket'"
          @click="useWebSocket"
        >
          {{ t('screen.useWebSocket', 'Switch to WebSocket') }}
        </n-button>
        <n-button
          type="primary"
          :disabled="Boolean(loading)"
          :loading="primaryLoading"
          @click="runPrimaryAction"
        >
          {{ primaryLabel }}
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<style scoped>
.video-fallback-countdown {
  color: var(--onekvm-text-secondary);
  font-size: 13px;
  font-feature-settings: "tnum" 1;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
</style>
