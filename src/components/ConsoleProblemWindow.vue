<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'

import type { OneKVMStatus } from '@/api/client'
import { setAnchoredProblem, problemAnchors } from '@/lib/console-problem-anchor'
import {
  createProblemTracker,
  type ConsoleInputActivity,
  type ConsoleProblem,
} from '@/lib/console-problems'
import { hidReportIsPress, hidReportKind } from '@/lib/hid-status'
import { onekvm } from '@/lib/onekvm'
import {
  clampOverlayPosition,
  overlayDragHostRect,
  overlayGrabOffset,
  overlayPointerPosition,
  type OverlayPoint,
} from '@/lib/overlay-drag'
import { notify } from '@/composables/useNotifications'
import ConsoleFloatingWindow from './ConsoleFloatingWindow.vue'
import ConsoleProblemContent from './ConsoleProblemContent.vue'

const props = defineProps<{
  problems: readonly ConsoleProblem[]
  status: OneKVMStatus | null | undefined
  enabled: boolean
}>()

const shown = shallowRef<ConsoleProblem | null>(null)
const input: ConsoleInputActivity = { reportAt: 0, pressAt: 0, keyboardAt: 0, mouseAt: 0 }
let tracker = createProblemTracker(props.problems)
let unsubscribe: (() => void) | undefined

/** A toolbar popover that explains the problem replaces the window. */
const anchor = computed(() => shown.value?.anchors?.find(name => problemAnchors[name]) ?? null)
const floating = computed(() => (anchor.value ? null : shown.value))

function evaluate() {
  const next = tracker.update({ status: props.status, input, now: Date.now() })
  shown.value = props.enabled ? next : null
}

function close() {
  tracker.dismiss()
  shown.value = null
}

// Each problem shown also goes to the notification list.
watch(shown, (problem, previous) => {
  if (problem && problem.id !== previous?.id) notify('warning', problem.title())
})

watch([shown, anchor], ([problem, name]) => {
  setAnchoredProblem(problem && name ? { problem, anchor: name } : null, close)
}, { immediate: true })

watch(() => props.problems, (problems) => {
  tracker = createProblemTracker(problems)
  evaluate()
})
watch(() => [props.status, props.enabled], evaluate, { immediate: true })

const frame = ref<InstanceType<typeof ConsoleFloatingWindow> | null>(null)
const position = ref<OverlayPoint | null>(null)
let grab: OverlayPoint = { x: 0, y: 0 }
let dragPointer: number | null = null

function hostRect() {
  const parent = frame.value?.element?.offsetParent
  const stage = parent instanceof HTMLElement ? parent.querySelector(':scope > .console-stage') : null
  return overlayDragHostRect(
    parent instanceof HTMLElement ? parent.getBoundingClientRect() : null,
    stage instanceof HTMLElement ? stage.getBoundingClientRect() : null,
    { width: window.innerWidth, height: window.innerHeight },
  )
}

function startDrag(event: PointerEvent) {
  const element = frame.value?.element
  if (event.button !== 0 || dragPointer !== null || !element) return
  event.preventDefault()
  grab = overlayGrabOffset(event.clientX, event.clientY, element.getBoundingClientRect())
  dragPointer = event.pointerId
  window.addEventListener('pointermove', drag)
  window.addEventListener('pointerup', stopDrag)
  window.addEventListener('pointercancel', stopDrag)
}

function drag(event: PointerEvent) {
  const element = frame.value?.element
  if (event.pointerId !== dragPointer || !element) return
  event.preventDefault()
  const host = hostRect()
  position.value = clampOverlayPosition(
    overlayPointerPosition(event.clientX, event.clientY, host, grab),
    { width: element.offsetWidth, height: element.offsetHeight },
    host,
  )
}

function stopDrag(event?: PointerEvent) {
  if (event && event.pointerId !== dragPointer) return
  dragPointer = null
  window.removeEventListener('pointermove', drag)
  window.removeEventListener('pointerup', stopDrag)
  window.removeEventListener('pointercancel', stopDrag)
}

const windowStyle = computed(() => position.value
  ? { left: `${position.value.x}px`, top: `${position.value.y}px`, alignSelf: 'start', justifySelf: 'start' }
  : undefined)

onMounted(() => {
  unsubscribe = onekvm.subscribeHIDReports((report) => {
    const now = Date.now()
    input.reportAt = now
    if (hidReportIsPress(report)) input.pressAt = now
    const kind = hidReportKind(report)
    if (kind === 'keyboard') input.keyboardAt = now
    else if (kind === 'mouse') input.mouseAt = now
    if (!shown.value) evaluate()
  })
})

onBeforeUnmount(() => {
  unsubscribe?.()
  stopDrag()
  setAnchoredProblem(null)
})
</script>

<template>
  <ConsoleFloatingWindow
    ref="frame"
    :show="Boolean(floating)"
    :title="floating?.title() ?? ''"
    class="console-problem-window"
    :style="windowStyle"
    aria-live="assertive"
    @close="close"
    @header-pointerdown="startDrag"
  >
    <template v-if="floating?.icon" #title-icon>
      <component :is="floating.icon" :size="16" aria-hidden="true" />
    </template>
    <ConsoleProblemContent v-if="floating" :problem="floating" @done="close" />
  </ConsoleFloatingWindow>
</template>
