import type { ConsoleProblem } from './console-problems'
import { USB_INPUT_PROBLEMS } from './usb-input-problems'

/**
 * Problems the console dialog explains, highest priority first. Add a
 * definition here; `ConsoleProblemWindow` shows it without further UI work.
 */
export const CONSOLE_PROBLEMS: readonly ConsoleProblem[] = [
  ...USB_INPUT_PROBLEMS,
]
