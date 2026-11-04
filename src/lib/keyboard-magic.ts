import { shallowRef } from 'vue'

export const MAGIC_KEY_CODES = [
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'ShiftLeft',
  'ShiftRight',
  'MetaLeft',
  'MetaRight',
  'ContextMenu',
] as const

export type MagicHintState = { active: boolean; codes: string[] }

export type MagicEffect = {
  handled: boolean
  down: string[]
  releaseMods: string[]
  up: string[]
  hint: MagicHintState
}

export type KeyboardMapOptions = {
  rightControlAsMeta: boolean
  swapCommandCtrl: boolean
}

const idleHint = (): MagicHintState => ({ active: false, codes: [] })

const modifiers = new Set([
  'AltLeft',
  'AltRight',
  'ControlLeft',
  'ControlRight',
  'MetaLeft',
  'MetaRight',
  'OSLeft',
  'OSRight',
  'ShiftLeft',
  'ShiftRight',
])

export const magicHint = shallowRef<MagicHintState>(idleHint())

export function sanitizeMagicKey(value: string | null | undefined) {
  return value && (MAGIC_KEY_CODES as readonly string[]).includes(value) ? value : ''
}

export function clientModifierNames() {
  const nav = typeof navigator === 'undefined' ? undefined : navigator
  const platform = nav?.platform ?? ''
  const agent = nav?.userAgent ?? ''
  const apple = /Mac|iPhone|iPad/.test(platform) || /Mac OS X/.test(agent)
  const windows = /Win/.test(platform) || /Windows/.test(agent)
  return {
    alt: apple ? 'Option' : 'Alt',
    meta: apple ? 'Command' : windows ? 'Win' : 'Meta',
    offerMeta: !apple && !windows,
  }
}

export type ChordNameSet = {
  alt: string
  left: string
  menu: string
  meta: string
  off: string
  right: string
}

export function magicKeyLabel(code: string, names: ChordNameSet) {
  if (!code) return names.off
  if (code === 'ContextMenu' || code === 'Menu') return names.menu
  const side = code.endsWith('Left') ? names.left : code.endsWith('Right') ? names.right : ''
  const base = code.startsWith('Control') ? 'Ctrl'
    : code.startsWith('Alt') ? names.alt
    : code.startsWith('Shift') ? 'Shift'
    : code.startsWith('Meta') || code.startsWith('OS') ? names.meta
    : code
  return side ? `${side} ${base}` : base
}

const shortKeys: Record<string, string> = {
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  Backspace: 'Backspace',
  CapsLock: 'Caps',
  Delete: 'Del',
  End: 'End',
  Enter: 'Enter',
  Escape: 'Esc',
  Home: 'Home',
  Insert: 'Ins',
  PageDown: 'PgDn',
  PageUp: 'PgUp',
  Pause: 'Pause',
  PrintScreen: 'PrtSc',
  Space: 'Space',
  Tab: 'Tab',
}

export function chordKeyLabel(code: string, names: ChordNameSet) {
  if (/^(Control|Alt|Shift|Meta|OS)/.test(code)) return magicKeyLabel(code, names)
  if (shortKeys[code]) return shortKeys[code]
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Digit\d$/.test(code)) return code.slice(5)
  if (/^Numpad\d$/.test(code)) return code.slice(6)
  if (/^F\d+$/.test(code)) return code
  return code
}

export function mapKeyboardCode(code: string, options: KeyboardMapOptions) {
  if (options.rightControlAsMeta && code === 'ControlRight') return 'MetaLeft'
  if (!options.swapCommandCtrl) return code
  switch (code) {
    case 'ControlLeft': return 'MetaLeft'
    case 'ControlRight': return 'MetaRight'
    case 'MetaLeft': return 'ControlLeft'
    case 'MetaRight': return 'ControlRight'
    default: return code
  }
}

export function physicalKeyCode(event: { code?: string; key?: string; location?: number }) {
  if (event.code === 'OSLeft') return 'MetaLeft'
  if (event.code === 'OSRight') return 'MetaRight'
  if (event.code) return event.code
  if (event.key === 'Meta' || event.key === 'OS') return event.location === 2 ? 'MetaRight' : 'MetaLeft'
  return ''
}

function knownKey(code: string) {
  return code !== '' && code !== 'Unidentified'
}

function isModifier(code: string) {
  return modifiers.has(code)
}

export class MagicComposer {
  current = ''
  mods: string[] = []
  started = false

  reset() {
    this.current = ''
    this.mods = []
    this.started = false
  }

  hint(): MagicHintState {
    if (!this.started) return idleHint()
    return { active: true, codes: this.current ? [...this.mods, this.current] : [...this.mods] }
  }

  onMagic(down: boolean): MagicEffect {
    if (down) {
      if (this.started) {
        const releaseMods = [...this.mods]
        this.reset()
        return { handled: true, down: [], up: [], releaseMods, hint: this.hint() }
      }
      this.started = true
    }
    return { handled: true, down: [], up: [], releaseMods: [], hint: this.hint() }
  }

  onKey(code: string, down: boolean): MagicEffect {
    if (!this.started || !knownKey(code)) {
      return { handled: false, down: [], up: [], releaseMods: [], hint: this.hint() }
    }
    if (isModifier(code)) {
      if (!down || this.mods.includes(code)) {
        return { handled: true, down: [], up: [], releaseMods: [], hint: this.hint() }
      }
      this.mods.push(code)
      return { handled: true, down: [code], up: [], releaseMods: [], hint: this.hint() }
    }
    if (down) {
      this.current = code
      return { handled: true, down: [code], up: [], releaseMods: [], hint: this.hint() }
    }
    this.current = ''
    return { handled: true, down: [], up: [code], releaseMods: [], hint: this.hint() }
  }
}

export function routeKeyboardKey(
  composer: MagicComposer,
  input: {
    down: boolean
    magicKey: string
    physical: string
    repeat: boolean
  } & KeyboardMapOptions,
): { kind: 'passthrough'; code: string } | { kind: 'magic'; effect: MagicEffect } {
  const magic = sanitizeMagicKey(input.magicKey)
  if (input.repeat && (composer.started || (magic !== '' && input.physical === magic))) {
    return { kind: 'magic', effect: { handled: true, down: [], up: [], releaseMods: [], hint: composer.hint() } }
  }
  if (magic && input.physical === magic) {
    return { kind: 'magic', effect: composer.onMagic(input.down) }
  }
  const code = mapKeyboardCode(input.physical, input)
  if (!composer.started) return { kind: 'passthrough', code }
  return { kind: 'magic', effect: composer.onKey(code, input.down) }
}
