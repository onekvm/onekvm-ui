import { computed, onMounted, readonly, shallowRef, toValue, type MaybeRefOrGetter } from 'vue'

import { t } from '@/i18n/runtime'
import { detectH265WebRTCVideoSupport, h265SupportForTransport, type EncodedVideoTransport } from '@/lib/video-transport'
import { detectH265WebSocketVideoSupport } from '@/lib/websocket-video-support'

export function useVideoCodecSupport(transport: MaybeRefOrGetter<EncodedVideoTransport>) {
  const h265WebRTCSupported = shallowRef<boolean | null>(null)
  const h265WebSocketSupported = shallowRef<boolean | null>(null)
  const h265Supported = computed(() => h265SupportForTransport(
    toValue(transport), h265WebRTCSupported.value, h265WebSocketSupported.value,
  ))
  const h265Option = computed(() => ({
    label: h265Supported.value === null
      ? t('screen.h265Checking', 'H.265 (checking…)')
      : h265Supported.value
        ? 'H.265'
        : t('screen.h265Unavailable', 'H.265 (unavailable with this protocol)'),
    value: 'h265',
    disabled: h265Supported.value !== true,
  }))
  const allCodecOptions = computed<Array<{ label: string; value: string; disabled?: boolean }>>(() => [
    { label: t('screen.auto', 'Automatic'), value: 'auto' },
    { label: 'H.264', value: 'h264' },
    h265Option.value,
    { label: 'MJPEG', value: 'mjpeg' },
  ])

  onMounted(() => {
    void detectH265WebRTCVideoSupport().then((supported) => {
      h265WebRTCSupported.value = supported
    })
    void detectH265WebSocketVideoSupport().then((supported) => {
      h265WebSocketSupported.value = supported
    })
  })

  return {
    h265WebRTCSupported: readonly(h265WebRTCSupported),
    h265WebSocketSupported: readonly(h265WebSocketSupported),
    allCodecOptions,
  }
}
