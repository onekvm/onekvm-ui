import type { ToolbarIconId } from '@/api/client'
import { Activity, CircleUserRound, Disc3, Ellipsis, Gamepad2, Keyboard, KeyboardChord, Languages, Maximize, Monitor, MousePointer2, Power, Settings, TextCursorInput, Toolbox, Volume2 } from '@/icons'
import { t } from '@/i18n/runtime'

export const toolbarIconGlyph = {
  display: Monitor, mouse: MousePointer2, keyboard: Keyboard, virtual_keyboard: Keyboard,
  keyboard_text: TextCursorInput, ctrl_alt_del: KeyboardChord, gamepad: Gamepad2, power: Power,
  audio: Volume2, virtual_media: Disc3, performance: Activity, fullscreen: Maximize,
  toolbox: Toolbox, collection: Ellipsis, settings: Settings, language: Languages, account: CircleUserRound,
}
export function toolbarIconLabel(id: ToolbarIconId): string {
  const labels: Record<ToolbarIconId, string> = {
    display: t('screen.title', 'Screen'), mouse: t('mouse.title', 'Mouse'), keyboard: t('keyboard.title', 'Keyboard'),
    virtual_keyboard: t('keyboard.virtualKeyboard', 'Virtual Keyboard'), keyboard_text: t('keyboard.paste', 'Send text'), ctrl_alt_del: t('keyboard.ctrlaltdel', 'Ctrl+Alt+Del'),
    gamepad: t('gamepad.title', 'Gamepad'), power: t('power.title', 'Power'), audio: t('usbAudio.title', 'Audio'),
    virtual_media: t('virtualMedia.title', 'Virtual Media'), performance: t('toolbar.performance', 'Stats'), fullscreen: t('toolbar.fullscreen', 'Full screen'),
    toolbox: t('toolbox.title', 'Toolbox'), collection: t('toolbar.collectedIcons', 'Collected icons'), settings: t('settings.title', 'Settings'), language: t('settings.appearance.language', 'Language'), account: t('settings.account.title', 'Account'),
  }
  return labels[id]
}
