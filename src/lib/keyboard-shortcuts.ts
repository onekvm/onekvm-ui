import type { KeyboardShortcut } from '@/api/client'
import { KeyboardCodes, ModifierCodes } from '@/input/keyboard'
import { onekvm } from '@/lib/onekvm'

export const MAX_SHORTCUT_KEYS = 5
export const MAX_SHORTCUTS = 32
export const LOCAL_SHORTCUTS_KEY = 'onekvm-keyboard-shortcuts'

const modifierLabels: Record<string, string> = {
  ControlLeft: 'Ctrl L',
  ControlRight: 'Ctrl R',
  ShiftLeft: 'Shift L',
  ShiftRight: 'Shift R',
  AltLeft: 'Alt L',
  AltRight: 'Alt R',
  MetaLeft: 'Win L',
  MetaRight: 'Win R',
}

const namedLabels: Record<string, string> = {
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Space: 'Space',
  Escape: 'Esc',
  Backspace: 'Backspace',
  ContextMenu: 'Menu',
  PrintScreen: 'Print Screen',
  ScrollLock: 'Scroll Lock',
  CapsLock: 'Caps Lock',
  NumLock: 'Num Lock',
  PageUp: 'Page Up',
  PageDown: 'Page Down',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
}

export function shortcutKeyLabel(code: string) {
  if (modifierLabels[code]) return modifierLabels[code]
  if (namedLabels[code]) return namedLabels[code]
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`
  return code
}

const modifiers = ['ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight']
const letters = Array.from({ length: 26 }, (_, index) => `Key${String.fromCharCode(65 + index)}`)
const digits = Array.from({ length: 10 }, (_, index) => `Digit${index}`)
const functionKeys = Array.from({ length: 24 }, (_, index) => `F${index + 1}`)
const editing = ['Escape', 'Tab', 'CapsLock', 'Space', 'Enter', 'Backspace', 'Insert', 'Delete', 'Home', 'End', 'PageUp', 'PageDown']
const arrows = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
const symbols = ['Backquote', 'Minus', 'Equal', 'BracketLeft', 'BracketRight', 'Backslash', 'IntlBackslash', 'Semicolon', 'Quote', 'Comma', 'Period', 'Slash']
const system = ['PrintScreen', 'ScrollLock', 'Pause', 'ContextMenu', 'Help']
const numpad = ['NumLock', 'NumpadDivide', 'NumpadMultiply', 'NumpadSubtract', 'NumpadAdd', 'NumpadEnter', ...Array.from({ length: 10 }, (_, index) => `Numpad${index}`), 'NumpadDecimal', 'NumpadEqual']

function options(codes: string[]) {
  return codes.map((value) => ({ label: shortcutKeyLabel(value), value }))
}

export function shortcutKeyOptions(labels: Record<string, string>) {
  return [
    { type: 'group', label: labels.modifiers, key: 'modifiers', children: options(modifiers) },
    { type: 'group', label: labels.letters, key: 'letters', children: options(letters) },
    { type: 'group', label: labels.numbers, key: 'numbers', children: options(digits) },
    { type: 'group', label: labels.functionKeys, key: 'function', children: options(functionKeys) },
    { type: 'group', label: labels.editing, key: 'editing', children: options(editing) },
    { type: 'group', label: labels.arrows, key: 'arrows', children: options(arrows) },
    { type: 'group', label: labels.symbols, key: 'symbols', children: options(symbols) },
    { type: 'group', label: labels.system, key: 'system', children: options(system) },
    { type: 'group', label: labels.numpad, key: 'numpad', children: options(numpad) },
  ]
}

export function normalizeShortcuts(value: unknown): KeyboardShortcut[] {
  if (!Array.isArray(value)) return []
  const names = new Set<string>()
  const result: KeyboardShortcut[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const name = typeof record.name === 'string' ? record.name.trim().slice(0, 64) : ''
    if (!Array.isArray(record.keys)) continue
    const nameKey = name.toLocaleLowerCase()
    if (nameKey && names.has(nameKey)) continue
    const keys = Array.from(new Set(record.keys.filter((key): key is string =>
      typeof key === 'string' && (ModifierCodes.has(key) || KeyboardCodes.has(key)),
    ))).slice(0, MAX_SHORTCUT_KEYS)
    if (!keys.length) continue
    if (nameKey) names.add(nameKey)
    result.push({ name, keys })
    if (result.length === MAX_SHORTCUTS) break
  }
  return result
}

export function loadLocalShortcuts() {
  try {
    return normalizeShortcuts(JSON.parse(localStorage.getItem(LOCAL_SHORTCUTS_KEY) || '[]'))
  } catch {
    return []
  }
}

export function saveLocalShortcuts(shortcuts: KeyboardShortcut[]) {
  localStorage.setItem(LOCAL_SHORTCUTS_KEY, JSON.stringify(normalizeShortcuts(shortcuts)))
}

export function shortcutChordLabel(shortcut: KeyboardShortcut) {
  return shortcut.keys.map(shortcutKeyLabel).join(' + ')
}

let shortcutReleaseTimer = 0

export function sendShortcut(shortcut: KeyboardShortcut) {
  let modifiersMask = 0
  const keys: number[] = []
  for (const code of shortcut.keys.slice(0, MAX_SHORTCUT_KEYS)) {
    const modifier = ModifierCodes.get(code)
    if (modifier) modifiersMask |= modifier
    else {
      const key = KeyboardCodes.get(code)
      if (key && !keys.includes(key)) keys.push(key)
    }
  }
  if (!modifiersMask && !keys.length) return
  window.clearTimeout(shortcutReleaseTimer)
  onekvm.sendKeyboard(keys, modifiersMask)
  shortcutReleaseTimer = window.setTimeout(() => onekvm.sendKeyboard([]), 100)
}
