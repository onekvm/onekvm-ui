import { reactive, shallowRef } from 'vue'

import type { ConsoleProblem, ConsoleProblemAnchor } from './console-problems'

/** Toolbar buttons on screen now; the toolbar keeps this current. */
export const problemAnchors = reactive<Record<ConsoleProblemAnchor, boolean>>({ mouse: false, keyboard: false })

export interface AnchoredProblem {
  problem: ConsoleProblem
  anchor: ConsoleProblemAnchor
}

/** The problem a toolbar popover shows in place of the floating window. */
export const anchoredProblem = shallowRef<AnchoredProblem | null>(null)
let closeProblem: (() => void) | undefined

/** Hand a problem to its toolbar popover; `close` dismisses it. */
export function setAnchoredProblem(next: AnchoredProblem | null, close?: () => void) {
  const current = anchoredProblem.value
  if (current?.problem.id === next?.problem.id && current?.anchor === next?.anchor) return
  anchoredProblem.value = next
  closeProblem = next ? close : undefined
}

/** The user closed the popover that showed the problem. */
export function closeAnchoredProblem() {
  const close = closeProblem
  anchoredProblem.value = null
  closeProblem = undefined
  close?.()
}

export type ProblemPopoverPlacement = 'top-end' | 'bottom-end' | 'bottom-start' | 'right-start' | 'left-start'

/**
 * Where a popover opened from a toolbar button would start: the button
 * corner it aligns to, so the arrow sits as it does on the button's own
 * popover.
 */
export function problemAnchorPoint(
  rect: Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom'>,
  placement: ProblemPopoverPlacement,
): { x: number; y: number } {
  const [side, align] = placement.split('-')
  const x = side === 'left' || (side !== 'right' && align === 'start') ? rect.left : rect.right
  const y = side === 'top' ? rect.top : side === 'bottom' ? rect.bottom : rect.top
  return { x: Math.round(x), y: Math.round(y) }
}
