import { computed, onBeforeUnmount, reactive, shallowRef, watch, type Ref } from 'vue'

import {
  IDENTITY_VIEW,
  clampPan,
  contentPointFromScreen,
  distance,
  midpoint,
  nudgeContentCursor,
  oneToOneZoom,
  panBy,
  viewForCursor,
  viewOverflows,
  viewportTransform,
  zoomAround,
  type ContentPoint,
  type ViewportView,
} from '@/lib/viewport-zoom'

type PointerPoint = { x: number; y: number }

export function useViewportZoom(
  surface: Readonly<Ref<HTMLElement | null>>,
  stage: Readonly<Ref<HTMLElement | null>>,
  enabled: Readonly<Ref<boolean>>,
) {
  const view = reactive<ViewportView>({ ...IDENTITY_VIEW })
  const cursor = reactive<ContentPoint>({ x: 0, y: 0 })
  const interacting = shallowRef(false)
  const pointers = new Map<number, PointerPoint>()
  let pinchDistance = 0
  let lastPan: PointerPoint | null = null
  let removeListeners = () => undefined
  let stageObserver: ResizeObserver | undefined

  const style = computed(() => {
    const transform = viewportTransform(view)
    return transform ? { transform } : undefined
  })

  function stageSize() {
    const rect = (surface.value ?? stage.value)?.getBoundingClientRect()
    return { width: rect?.width ?? 0, height: rect?.height ?? 0 }
  }

  function stagePoint(event: PointerEvent) {
    const rect = (surface.value ?? stage.value)?.getBoundingClientRect()
    return {
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
    }
  }

  function apply(next: ViewportView) {
    const size = stageSize()
    const clamped = clampPan(next, size.width, size.height)
    view.scale = clamped.scale
    view.x = clamped.x
    view.y = clamped.y
  }

  function syncCursorToCenter() {
    const size = stageSize()
    const next = contentPointFromScreen(view, size.width / 2, size.height / 2)
    cursor.x = next.x
    cursor.y = next.y
  }

  function syncInteracting() {
    interacting.value = pointers.size > 0
  }

  function reset() {
    pointers.clear()
    pinchDistance = 0
    lastPan = null
    interacting.value = false
    view.scale = 1
    view.x = 0
    view.y = 0
    const size = stageSize()
    cursor.x = size.width / 2
    cursor.y = size.height / 2
  }

  function followLook(dx: number, dy: number) {
    const size = stageSize()
    if (size.width <= 0 || size.height <= 0) return
    if (!viewOverflows(view.scale)) return
    const next = nudgeContentCursor(cursor, dx, dy, view.scale, size.width, size.height)
    cursor.x = next.x
    cursor.y = next.y
    apply(viewForCursor(next, view.scale, size.width, size.height))
  }

  function zoomToOneToOne(sourceWidth: number, sourceHeight: number) {
    const size = stageSize()
    const scale = oneToOneZoom(sourceWidth, sourceHeight, size.width, size.height)
    if (!viewOverflows(scale)) {
      reset()
      return
    }
    apply(zoomAround({ ...IDENTITY_VIEW }, scale, size.width / 2, size.height / 2))
    syncCursorToCenter()
    apply(viewForCursor(cursor, view.scale, size.width, size.height))
  }

  function pointerList() {
    return [...pointers.values()]
  }

  function onDown(event: PointerEvent) {
    if (!enabled.value) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.preventDefault()
    const point = stagePoint(event)
    pointers.set(event.pointerId, point)
    syncInteracting()
    try {
      surface.value?.setPointerCapture(event.pointerId)
    } catch {
      // Best-effort.
    }
    const active = pointerList()
    if (active.length >= 2) {
      const [first, second] = active
      pinchDistance = distance(first.x, first.y, second.x, second.y)
      lastPan = null
      return
    }
    lastPan = viewOverflows(view.scale) ? point : null
  }

  function onMove(event: PointerEvent) {
    if (!enabled.value || !pointers.has(event.pointerId)) return
    event.preventDefault()
    const point = stagePoint(event)
    pointers.set(event.pointerId, point)
    const active = pointerList()
    if (active.length >= 2 && pinchDistance > 0) {
      const [first, second] = active
      const nextDistance = distance(first.x, first.y, second.x, second.y)
      const mid = midpoint(first.x, first.y, second.x, second.y)
      apply(zoomAround(view, view.scale * (nextDistance / pinchDistance), mid.x, mid.y))
      pinchDistance = nextDistance
      syncCursorToCenter()
      return
    }
    if (active.length === 1 && lastPan && viewOverflows(view.scale)) {
      apply(panBy(view, point.x - lastPan.x, point.y - lastPan.y, stageSize().width, stageSize().height))
      lastPan = point
      syncCursorToCenter()
    }
  }

  function onUp(event: PointerEvent) {
    if (!pointers.has(event.pointerId)) return
    pointers.delete(event.pointerId)
    syncInteracting()
    const active = pointerList()
    if (active.length < 2) pinchDistance = 0
    lastPan = active.length === 1 && viewOverflows(view.scale) ? active[0] : null
  }

  function bind() {
    removeListeners()
    removeListeners = () => undefined
    const target = surface.value
    if (!target || !enabled.value) return
    target.addEventListener('pointerdown', onDown)
    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', onUp)
    target.addEventListener('pointercancel', onUp)
    removeListeners = () => {
      target.removeEventListener('pointerdown', onDown)
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', onUp)
      target.removeEventListener('pointercancel', onUp)
    }
  }

  function observeStage() {
    stageObserver?.disconnect()
    stageObserver = undefined
    const target = surface.value ?? stage.value
    if (!target) return
    stageObserver = new ResizeObserver(() => {
      if (!enabled.value) return
      apply(view)
      if (viewOverflows(view.scale)) syncCursorToCenter()
    })
    stageObserver.observe(target)
  }

  watch([surface, enabled], (current) => {
    if (!current[1]) reset()
    bind()
  }, { immediate: true, flush: 'post' })

  watch([stage, surface], () => observeStage(), { immediate: true, flush: 'post' })

  onBeforeUnmount(() => {
    stageObserver?.disconnect()
    removeListeners()
    reset()
  })

  return { view, cursor, interacting, style, reset, followLook, zoomToOneToOne }
}
