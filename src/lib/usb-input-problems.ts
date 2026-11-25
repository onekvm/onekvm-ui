import type { OneKVMStatus } from '@/api/client'
import { api } from '@/api/client'
import { t } from '@/i18n/runtime'
import { Usb } from '@/icons'

import {
  recentInput,
  recentKeyboard,
  recentMouse,
  recentPress,
  type ConsoleProblem,
  type ConsoleProblemAction,
  type ConsoleProblemAnchor,
} from './console-problems'
import { usbInputDisconnected, usbInputKindStalled } from './hid-status'

const resetUsb: ConsoleProblemAction = {
  id: 'reset-usb',
  primary: true,
  label: () => t('deviceStatus.resetUsb', 'Reset USB'),
  run: async () => {
    await api.resetUSB()
    return t('deviceStatus.usbResetSuccess', 'USB has been reset.')
  },
  failure: () => t('deviceStatus.usbResetFailed', 'Failed to reset USB.'),
}

const connectionChecks = () => [
  t('deviceStatus.hidCheckCable', 'The USB cable is connected to the target computer and carries data, not only charging.'),
  t('deviceStatus.hidCheckPower', 'The target computer is on and not asleep or hibernating.'),
  t('deviceStatus.hidCheckDirect', 'The cable goes straight to a USB port on the computer, not through a hub, dock or monitor.'),
]

const shared = {
  icon: Usb,
  intro: () => t('deviceStatus.hidCheckIntro', 'Check the following:'),
  checks: () => [
    ...connectionChecks(),
    t('deviceStatus.hidCheckBios', 'In BIOS or during startup, USB keyboard support (Legacy USB) is enabled in the BIOS.'),
  ],
  note: () => t('deviceStatus.usbResetInterrupts', 'Resetting USB briefly disconnects the keyboard, mouse, virtual media and audio.'),
  actions: [resetUsb],
} satisfies Partial<ConsoleProblem>

const keyboardStalled = (status: OneKVMStatus | null | undefined) => usbInputKindStalled('keyboard', status?.hid)
const mouseStalled = (status: OneKVMStatus | null | undefined) => usbInputKindStalled('mouse', status?.hid)

/** The host has not enumerated the gadget; every USB input is affected. */
export const USB_INPUT_DISCONNECTED: ConsoleProblem = {
  ...shared,
  id: 'usb-input-disconnected',
  title: () => t('deviceStatus.hidDisconnectedTitle', 'USB keyboard and mouse are not connected'),
  active: ({ status }) => usbInputDisconnected(status?.hid),
  // Pointer motion over the video alone does not show it.
  relevant: recentPress,
  anchors: ['mouse', 'keyboard'],
}

export const USB_INPUT_PROBLEMS: readonly ConsoleProblem[] = [
  USB_INPUT_DISCONNECTED,
  {
    ...shared,
    id: 'usb-input-stalled',
    title: () => t('deviceStatus.hidStalledTitle', 'Keyboard and mouse are not responding'),
    active: ({ status }) => keyboardStalled(status) && mouseStalled(status),
    relevant: recentInput,
    anchors: ['mouse', 'keyboard'],
  },
  {
    ...shared,
    id: 'usb-mouse-stalled',
    title: () => t('deviceStatus.mouseStalledTitle', 'The mouse is not responding'),
    checks: () => [
      ...connectionChecks(),
      t('deviceStatus.hidCheckBiosMouse', 'In BIOS or during startup the computer may read only the keyboard; the mouse works once the system has started.'),
    ],
    active: ({ status }) => mouseStalled(status) && !keyboardStalled(status),
    relevant: recentMouse,
    anchors: ['mouse'],
  },
  {
    ...shared,
    id: 'usb-keyboard-stalled',
    title: () => t('deviceStatus.keyboardStalledTitle', 'The keyboard is not responding'),
    active: ({ status }) => keyboardStalled(status) && !mouseStalled(status),
    relevant: recentKeyboard,
    anchors: ['keyboard'],
  },
]

const IDLE_INPUT = { reportAt: 0, pressAt: 0, keyboardAt: 0, mouseAt: 0 }

/**
 * The USB input problem a toolbar popover explains while it holds. Without
 * an input, only a gadget the host has not connected applies.
 */
export function usbInputProblemFor(
  anchor: ConsoleProblemAnchor | undefined,
  status: OneKVMStatus | null | undefined,
): ConsoleProblem | null {
  const context = { status, input: IDLE_INPUT, now: 0 }
  const candidates = anchor ? USB_INPUT_PROBLEMS.filter(problem => problem.anchors?.includes(anchor)) : [USB_INPUT_DISCONNECTED]
  return candidates.find(problem => problem.active(context)) ?? null
}
