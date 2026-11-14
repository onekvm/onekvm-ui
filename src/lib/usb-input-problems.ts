import { api } from '@/api/client'
import { t } from '@/i18n/runtime'
import { Usb } from '@/icons'

import { recentInput, recentPress, type ConsoleProblem, type ConsoleProblemAction } from './console-problems'
import { usbInputDisconnected, usbInputStalled } from './hid-status'

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

const shared = {
  icon: Usb,
  intro: () => t('deviceStatus.hidCheckIntro', 'Check the following:'),
  checks: () => [
    t('deviceStatus.hidCheckCable', 'The USB cable is connected to the target computer and carries data, not only charging.'),
    t('deviceStatus.hidCheckPower', 'The target computer is on and not asleep or hibernating.'),
    t('deviceStatus.hidCheckDirect', 'The cable goes straight to a USB port on the computer, not through a hub, dock or monitor.'),
    t('deviceStatus.hidCheckBios', 'In BIOS or during startup, USB keyboard support (Legacy USB) is enabled in the BIOS.'),
  ],
  note: () => t('deviceStatus.usbResetInterrupts', 'Resetting USB briefly disconnects the keyboard, mouse, virtual media and audio.'),
  actions: [resetUsb],
} satisfies Partial<ConsoleProblem>

export const USB_INPUT_PROBLEMS: readonly ConsoleProblem[] = [
  {
    ...shared,
    id: 'usb-input-disconnected',
    title: () => t('deviceStatus.hidDisconnectedTitle', 'USB keyboard and mouse are not connected'),
    active: ({ status }) => usbInputDisconnected(status?.hid),
    // Pointer motion over the video alone does not show it.
    relevant: recentPress,
  },
  {
    ...shared,
    id: 'usb-input-stalled',
    title: () => t('deviceStatus.hidStalledTitle', 'Keyboard and mouse are not responding'),
    active: ({ status }) => usbInputStalled(status?.hid),
    relevant: recentInput,
  },
]
