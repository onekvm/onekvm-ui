import { onBeforeUnmount, onMounted, ref } from 'vue'

import { onekvm, type TransportState } from '@/lib/onekvm'

export function useTransport() {
  const state = ref<TransportState>({
    connection: 'idle',
    controlReady: false,
    videoMode: 'webrtc',
    websocketFallbackAvailable: false,
    websocketFallbackOffered: false,
    errorKind: '',
    error: '',
  })
  let unsubscribe: (() => void) | undefined

  onMounted(() => {
    unsubscribe = onekvm.subscribe((next) => {
      state.value = next
    })
  })
  onBeforeUnmount(() => unsubscribe?.())

  return { state }
}
