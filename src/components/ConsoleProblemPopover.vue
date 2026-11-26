<script setup lang="ts">
import { onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { X } from '@/icons'

import { t } from '@/i18n/runtime'
import { useOverlayMount } from '@/composables/useOverlayMount'
import {
  closeAnchoredProblem,
  problemAnchorPoint,
  type AnchoredProblem,
  type ProblemPopoverPlacement,
} from '@/lib/console-problem-anchor'
import type { ConsoleProblem, ConsoleProblemAnchor } from '@/lib/console-problems'
import ConsoleProblemContent from './ConsoleProblemContent.vue'

const props = defineProps<{
  problem: AnchoredProblem | null
  /** The toolbar button for an input, or null while it is not on screen. */
  target: (anchor: ConsoleProblemAnchor) => HTMLElement | null
  placement: ProblemPopoverPlacement
}>()

const overlayTo = useOverlayMount()
const point = ref<{ x: number; y: number } | null>(null)
// Keeps the content while the popover fades out.
const content = shallowRef<ConsoleProblem | null>(null)
let frame = 0

// The toolbar can move, wrap or change size; follow its button.
function follow() {
  frame = requestAnimationFrame(follow)
  const rect = props.problem ? props.target(props.problem.anchor)?.getBoundingClientRect() : undefined
  if (!rect || (!rect.width && !rect.height)) {
    point.value = null
    return
  }
  const next = problemAnchorPoint(rect, props.placement)
  if (point.value?.x !== next.x || point.value?.y !== next.y) point.value = next
}

watch(() => props.problem, (problem) => {
  cancelAnimationFrame(frame)
  frame = 0
  if (!problem) {
    point.value = null
    return
  }
  content.value = problem.problem
  follow()
}, { immediate: true })

onBeforeUnmount(() => cancelAnimationFrame(frame))
</script>

<template>
  <n-popover
    :show="Boolean(problem && point)"
    trigger="manual"
    :x="point?.x"
    :y="point?.y"
    :placement="placement"
    show-arrow
    arrow-point-to-center
    class="host-control-popover control-popover console-problem-popover"
    :theme-overrides="{ padding: '8px 12px' }"
    :to="overlayTo"
  >
    <div v-if="content" class="control-popover-scroll console-problem-popover-body" role="alert">
      <header class="control-popover-header">
        <component :is="content.icon" v-if="content.icon" class="console-problem-popover-icon" :size="16" aria-hidden="true" />
        <strong>{{ content.title() }}</strong>
        <div class="control-popover-header-actions">
          <n-button quaternary circle size="tiny" :aria-label="t('common.close', 'Close')" @click="closeAnchoredProblem()">
            <template #icon><X /></template>
          </n-button>
        </div>
      </header>
      <ConsoleProblemContent :problem="content" compact @done="closeAnchoredProblem()" />
    </div>
  </n-popover>
</template>

<style scoped>
.console-problem-popover-body {
  display: grid;
  gap: 10px;
  padding-bottom: 4px;
}

.console-problem-popover-icon {
  flex: none;
  color: var(--warning-color, #d4a017);
}
</style>
