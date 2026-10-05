import type { KeyboardLayout } from '@/api/client'

export type KeyboardLayer = 'letters' | 'numbers' | 'fn'

export type VirtualKey = {
  label: string
  code: string
  units?: number
  modifier?: number
  gapAfter?: boolean
  kind?: 'hid' | 'layer'
  layer?: KeyboardLayer
  flex?: number
  row?: 'home' | 'nav' | 'arrows'
}

export function key(label: string, code: string, units = 1, modifier?: number, gapAfter = false): VirtualKey {
  return { label, code, units, modifier, gapAfter }
}

export function mobileKey(label: string, code: string, extra: Partial<VirtualKey> = {}): VirtualKey {
  return { label, code, units: extra.units ?? 1, kind: extra.kind ?? 'hid', ...extra }
}

export const functionRow: VirtualKey[] = [
  key('Esc', 'Escape', 1, undefined, true),
  key('F1', 'F1'), key('F2', 'F2'), key('F3', 'F3'), key('F4', 'F4', 1, undefined, true),
  key('F5', 'F5'), key('F6', 'F6'), key('F7', 'F7'), key('F8', 'F8', 1, undefined, true),
  key('F9', 'F9'), key('F10', 'F10'), key('F11', 'F11'), key('F12', 'F12', 1, undefined, true),
  key('PrtSc', 'PrintScreen'), key('Pause', 'Pause'),
]

export const baseMainRows: VirtualKey[][] = [
  [
    key('`', 'Backquote'), key('1', 'Digit1'), key('2', 'Digit2'), key('3', 'Digit3'),
    key('4', 'Digit4'), key('5', 'Digit5'), key('6', 'Digit6'), key('7', 'Digit7'),
    key('8', 'Digit8'), key('9', 'Digit9'), key('0', 'Digit0'), key('-', 'Minus'),
    key('=', 'Equal'), key('Backspace', 'Backspace', 2),
  ],
  [
    key('Tab', 'Tab', 1.5), key('Q', 'KeyQ'), key('W', 'KeyW'), key('E', 'KeyE'),
    key('R', 'KeyR'), key('T', 'KeyT'), key('Y', 'KeyY'), key('U', 'KeyU'),
    key('I', 'KeyI'), key('O', 'KeyO'), key('P', 'KeyP'), key('[', 'BracketLeft'),
    key(']', 'BracketRight'), key('\\', 'Backslash', 1.5),
  ],
  [
    key('Caps', 'CapsLock', 1.75), key('A', 'KeyA'), key('S', 'KeyS'), key('D', 'KeyD'),
    key('F', 'KeyF'), key('G', 'KeyG'), key('H', 'KeyH'), key('J', 'KeyJ'),
    key('K', 'KeyK'), key('L', 'KeyL'), key(';', 'Semicolon'), key("'", 'Quote'),
    key('Enter', 'Enter', 2.25),
  ],
  [
    key('Shift', 'ShiftLeft', 2.25, 2), key('Z', 'KeyZ'), key('X', 'KeyX'), key('C', 'KeyC'),
    key('V', 'KeyV'), key('B', 'KeyB'), key('N', 'KeyN'), key('M', 'KeyM'),
    key(',', 'Comma'), key('.', 'Period'), key('/', 'Slash'), key('Shift', 'ShiftRight', 2.75, 32),
  ],
  [
    key('Ctrl', 'ControlLeft', 1.5, 1), key('Meta', 'MetaLeft', 1.25, 8),
    key('Alt', 'AltLeft', 1.25, 4), key('Space', 'Space', 6.25),
    key('Alt', 'AltRight', 1.25, 64), key('Menu', 'Menu', 1.25),
    key('Ctrl', 'ControlRight', 1.5, 16),
  ],
]

export const navigationRows: VirtualKey[][] = [
  [key('Ins', 'Insert'), key('Home', 'Home'), key('PgUp', 'PageUp')],
  [key('Del', 'Delete'), key('End', 'End'), key('PgDn', 'PageDown')],
  [key('↑', 'ArrowUp')],
  [key('←', 'ArrowLeft'), key('↓', 'ArrowDown'), key('→', 'ArrowRight')],
]

export const layoutLabels: Partial<Record<KeyboardLayout, Record<string, string>>> = {
  de: {
    KeyY: 'Z', KeyZ: 'Y', Minus: 'ß', Equal: '´', BracketLeft: 'Ü', BracketRight: '+',
    Semicolon: 'Ö', Quote: 'Ä', Backslash: '#', Slash: '-',
  },
  fr: {
    Backquote: '²', Digit1: '&', Digit2: 'É', Digit3: '"', Digit4: "'", Digit5: '(',
    Digit6: '-', Digit7: 'È', Digit8: '_', Digit9: 'Ç', Digit0: 'À', Minus: ')',
    KeyQ: 'A', KeyW: 'Z', BracketLeft: '^', BracketRight: '$', Backslash: '*',
    KeyA: 'Q', Semicolon: 'M', Quote: 'Ù', KeyZ: 'W', KeyM: ',', Comma: ';',
    Period: ':', Slash: '!',
  },
  es: {
    Backquote: 'º', Minus: "'", Equal: '¡', BracketLeft: '`', BracketRight: '+',
    Backslash: 'Ç', Semicolon: 'Ñ', Quote: '´', Slash: '-',
  },
  it: {
    Backquote: '\\', Minus: "'", Equal: 'Ì', BracketLeft: 'È', BracketRight: '+',
    Backslash: 'Ù', Semicolon: 'Ò', Quote: 'À', Slash: '-',
  },
  ru: {
    KeyQ: 'Й', KeyW: 'Ц', KeyE: 'У', KeyR: 'К', KeyT: 'Е', KeyY: 'Н', KeyU: 'Г',
    KeyI: 'Ш', KeyO: 'Щ', KeyP: 'З', BracketLeft: 'Х', BracketRight: 'Ъ',
    KeyA: 'Ф', KeyS: 'Ы', KeyD: 'В', KeyF: 'А', KeyG: 'П', KeyH: 'Р', KeyJ: 'О',
    KeyK: 'Л', KeyL: 'Д', Semicolon: 'Ж', Quote: 'Э', KeyZ: 'Я', KeyX: 'Ч',
    KeyC: 'С', KeyV: 'М', KeyB: 'И', KeyN: 'Т', KeyM: 'Ь', Comma: 'Б', Period: 'Ю',
  },
  jp: {
    Equal: '^', BracketLeft: '@', BracketRight: '[', Backslash: ']', Quote: ':',
  },
  ko: {
    KeyQ: 'ㅂ', KeyW: 'ㅈ', KeyE: 'ㄷ', KeyR: 'ㄱ', KeyT: 'ㅅ', KeyY: 'ㅛ', KeyU: 'ㅕ',
    KeyI: 'ㅑ', KeyO: 'ㅐ', KeyP: 'ㅔ', KeyA: 'ㅁ', KeyS: 'ㄴ', KeyD: 'ㅇ', KeyF: 'ㄹ',
    KeyG: 'ㅎ', KeyH: 'ㅗ', KeyJ: 'ㅓ', KeyK: 'ㅏ', KeyL: 'ㅣ', KeyZ: 'ㅋ', KeyX: 'ㅌ',
    KeyC: 'ㅊ', KeyV: 'ㅍ', KeyB: 'ㅠ', KeyN: 'ㅜ', KeyM: 'ㅡ',
  },
}

export const mobileModifierRow: VirtualKey[] = [
  mobileKey('Esc', 'Escape'),
  mobileKey('Ctrl', 'ControlLeft', { modifier: 1 }),
  mobileKey('Alt', 'AltLeft', { modifier: 4 }),
  mobileKey('Win', 'MetaLeft', { modifier: 8 }),
  mobileKey('Tab', 'Tab'),
  mobileKey('Fn', 'LayerFn', { kind: 'layer', layer: 'fn' }),
]

export function applyKeyLabels(rows: VirtualKey[][], labels: Record<string, string>): VirtualKey[][] {
  return rows.map((row) => row.map((item) => (
    item.kind === 'layer' ? item : { ...item, label: labels[item.code] || item.label }
  )))
}

export function nextKeyboardLayer(current: KeyboardLayer, target: KeyboardLayer): KeyboardLayer {
  return current === target ? 'letters' : target
}

export function mobileLayerRows(layer: KeyboardLayer): VirtualKey[][] {
  if (layer === 'numbers') return mobileNumberRows
  if (layer === 'fn') return mobileFnRows
  return mobileLetterRows
}

const mobileLetterRows: VirtualKey[][] = [
  [
    mobileKey('Q', 'KeyQ'), mobileKey('W', 'KeyW'), mobileKey('E', 'KeyE'),
    mobileKey('R', 'KeyR'), mobileKey('T', 'KeyT'), mobileKey('Y', 'KeyY'),
    mobileKey('U', 'KeyU'), mobileKey('I', 'KeyI'), mobileKey('O', 'KeyO'),
    mobileKey('P', 'KeyP'),
  ],
  [
    mobileKey('A', 'KeyA', { row: 'home' }), mobileKey('S', 'KeyS', { row: 'home' }),
    mobileKey('D', 'KeyD', { row: 'home' }), mobileKey('F', 'KeyF', { row: 'home' }),
    mobileKey('G', 'KeyG', { row: 'home' }), mobileKey('H', 'KeyH', { row: 'home' }),
    mobileKey('J', 'KeyJ', { row: 'home' }), mobileKey('K', 'KeyK', { row: 'home' }),
    mobileKey('L', 'KeyL', { row: 'home' }),
  ],
  [
    mobileKey('⇧', 'ShiftLeft', { modifier: 2, flex: 1.35 }),
    mobileKey('Z', 'KeyZ'), mobileKey('X', 'KeyX'), mobileKey('C', 'KeyC'),
    mobileKey('V', 'KeyV'), mobileKey('B', 'KeyB'), mobileKey('N', 'KeyN'),
    mobileKey('M', 'KeyM'),
    mobileKey('⌫', 'Backspace', { flex: 1.35 }),
  ],
  [
    mobileKey('123', 'LayerNumbers', { kind: 'layer', layer: 'numbers', flex: 1.3 }),
    mobileKey('Space', 'Space', { flex: 5.2 }),
    mobileKey('↵', 'Enter', { flex: 1.45 }),
  ],
]

const mobileNumberRows: VirtualKey[][] = [
  [
    mobileKey('1', 'Digit1'), mobileKey('2', 'Digit2'), mobileKey('3', 'Digit3'),
    mobileKey('4', 'Digit4'), mobileKey('5', 'Digit5'), mobileKey('6', 'Digit6'),
    mobileKey('7', 'Digit7'), mobileKey('8', 'Digit8'), mobileKey('9', 'Digit9'),
    mobileKey('0', 'Digit0'),
  ],
  [
    mobileKey('`', 'Backquote'), mobileKey('-', 'Minus'), mobileKey('=', 'Equal'),
    mobileKey('[', 'BracketLeft'), mobileKey(']', 'BracketRight'), mobileKey('\\', 'Backslash'),
  ],
  [
    mobileKey(',', 'Comma'), mobileKey('.', 'Period'), mobileKey('/', 'Slash'),
    mobileKey(';', 'Semicolon'), mobileKey("'", 'Quote'), mobileKey('Caps', 'CapsLock'),
  ],
  [
    mobileKey('ABC', 'LayerLetters', { kind: 'layer', layer: 'letters', flex: 1.3 }),
    mobileKey('←', 'ArrowLeft'),
    mobileKey('↓', 'ArrowDown'),
    mobileKey('↑', 'ArrowUp'),
    mobileKey('→', 'ArrowRight'),
    mobileKey('⌫', 'Backspace', { flex: 1.35 }),
  ],
]

const mobileFnRows: VirtualKey[][] = [
  [
    mobileKey('F1', 'F1'), mobileKey('F2', 'F2'), mobileKey('F3', 'F3'),
    mobileKey('F4', 'F4'), mobileKey('F5', 'F5'), mobileKey('F6', 'F6'),
  ],
  [
    mobileKey('F7', 'F7'), mobileKey('F8', 'F8'), mobileKey('F9', 'F9'),
    mobileKey('F10', 'F10'), mobileKey('F11', 'F11'), mobileKey('F12', 'F12'),
  ],
  [
    mobileKey('Ins', 'Insert'), mobileKey('Home', 'Home'), mobileKey('PgUp', 'PageUp'),
    mobileKey('Del', 'Delete'), mobileKey('End', 'End'), mobileKey('PgDn', 'PageDown'),
  ],
  [
    mobileKey('ABC', 'LayerLetters', { kind: 'layer', layer: 'letters', flex: 1.3 }),
    mobileKey('PrtSc', 'PrintScreen'),
    mobileKey('Pause', 'Pause'),
    mobileKey('←', 'ArrowLeft'),
    mobileKey('↓', 'ArrowDown'),
    mobileKey('↑', 'ArrowUp'),
    mobileKey('→', 'ArrowRight'),
  ],
]

export function mobileRowClass(row: VirtualKey[]) {
  if (row[0]?.row === 'home') return 'is-home'
  if (row[0]?.row === 'nav') return 'is-nav'
  if (row[0]?.row === 'arrows') return 'is-arrows'
  return undefined
}
