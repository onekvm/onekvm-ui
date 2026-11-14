import type { Component } from 'vue'

import type { OneKVMStatus } from '@/api/client'

/** Input this recent makes a problem this user's to see. */
export const RECENT_INPUT_MS = 5000

export interface ConsoleInputActivity {
  /** Last keyboard, mouse or gamepad report sent by this browser. */
  reportAt: number
  /** Last key press, click, wheel turn or gamepad button. */
  pressAt: number
}

export interface ConsoleProblemContext {
  status: OneKVMStatus | null | undefined
  input: ConsoleInputActivity
  now: number
}

export interface ConsoleProblemAction {
  id: string
  label: () => string
  primary?: boolean
  /** Resolves with an optional confirmation; the dialog then closes. */
  run: () => Promise<string | void>
  failure?: () => string
}

/**
 * One problem the console dialog can explain. Copy is read when shown, so
 * the current language applies.
 */
export interface ConsoleProblem {
  id: string
  icon?: Component
  title: () => string
  intro?: () => string
  checks?: () => readonly string[]
  note?: () => string
  actions?: readonly ConsoleProblemAction[]
  /** The condition holds. Closing hides it until the condition clears. */
  active: (context: ConsoleProblemContext) => boolean
  /** Tell this user now; defaults to every viewer while active. */
  relevant?: (context: ConsoleProblemContext) => boolean
}

export const recentInput = (context: ConsoleProblemContext) =>
  context.now - context.input.reportAt <= RECENT_INPUT_MS

export const recentPress = (context: ConsoleProblemContext) =>
  context.now - context.input.pressAt <= RECENT_INPUT_MS

type TrackedProblem = Pick<ConsoleProblem, 'id' | 'active' | 'relevant'>

export interface ConsoleProblemTracker<P extends TrackedProblem> {
  /** The problem to show, earliest in the list first. */
  update(context: ConsoleProblemContext): P | null
  /** Close the shown problem until its condition clears. */
  dismiss(): void
}

export function createProblemTracker<P extends TrackedProblem>(
  problems: readonly P[],
): ConsoleProblemTracker<P> {
  let shown: P | null = null
  const dismissed = new Set<string>()
  return {
    update(context) {
      for (const problem of problems) {
        if (!problem.active(context)) dismissed.delete(problem.id)
      }
      if (shown && !shown.active(context)) shown = null
      shown ??= problems.find(problem =>
        problem.active(context)
        && !dismissed.has(problem.id)
        && (problem.relevant?.(context) ?? true),
      ) ?? null
      return shown
    },
    dismiss() {
      if (shown) dismissed.add(shown.id)
      shown = null
    },
  }
}
