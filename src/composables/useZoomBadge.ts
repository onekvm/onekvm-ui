import { onBeforeUnmount, shallowRef, watch, type Ref } from 'vue'

import { ZOOM_BADGE_HIDE_MS, ZOOM_BADGE_SCALE_MIN } from '@/lib/zoom-badge'

export function useZoomBadge(
  scale: () => number,
  interacting: Readonly<Ref<boolean>>,
  hideAfterMs = ZOOM_BADGE_HIDE_MS,
) {
  const shown = shallowRef(false)
  let timer = 0

  function clear() {
    if (!timer) return
    window.clearTimeout(timer)
    timer = 0
  }

  watch(
    [scale, interacting],
    ([next, busy]) => {
      if (next <= ZOOM_BADGE_SCALE_MIN) {
        clear()
        shown.value = false
        return
      }
      shown.value = true
      clear()
      if (busy) return
      timer = window.setTimeout(() => {
        shown.value = false
        timer = 0
      }, hideAfterMs)
    },
    { immediate: true },
  )

  onBeforeUnmount(clear)

  return { shown }
}
