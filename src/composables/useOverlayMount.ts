import { readonly, shallowRef } from 'vue'

import { overlayMountTarget } from '@/lib/overlay-target'

const mountTo = shallowRef<string | HTMLElement>('body')
let listening = false

function syncOverlayMount() {
  mountTo.value = overlayMountTarget(document.fullscreenElement)
}

export function useOverlayMount() {
  if (!listening && typeof document !== 'undefined') {
    listening = true
    document.addEventListener('fullscreenchange', syncOverlayMount)
    syncOverlayMount()
  }
  return readonly(mountTo)
}
