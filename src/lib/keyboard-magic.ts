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

export const MAGIC_DOUBLE_TAP_MS = 350
export const MAGIC_PAUSE_MS = 100

export type MagicHintState = { active: boolean; codes: string[]; sequence?: Array<string[] | number>; playing?: boolean }

export type MagicFrame = { codes: string[]; delayMS: number }

export type MagicEffect = {
  handled: boolean
  frames: MagicFrame[]
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
  mods: string[] = []
  started = false
  private keys = new Set<string>()
  private frames: MagicFrame[] = []
  private sequence: Array<string[] | number> = []
  private pendingMagicAt: number | null = null
  private magicPressed = false
  private nextDelayMS: number | null = null
  private segmentStart = 0
  private segmentHasKeys = false
  private lastAt = 0
  private now: () => number

  constructor(now = () => performance.now()) {
    this.now = now
  }

  reset() {
    this.mods = []
    this.started = false
    this.keys.clear()
    this.frames = []
    this.sequence = []
    this.pendingMagicAt = null
    this.magicPressed = false
    this.nextDelayMS = null
    this.segmentStart = 0
    this.segmentHasKeys = false
    this.lastAt = 0
  }

  hint(): MagicHintState {
    if (!this.started) return idleHint()
    const sequence = this.sequence.map((step) => typeof step === 'number' ? step : [...step])
    if (!this.segmentHasKeys && this.mods.length) sequence.push([...this.mods])
    if (this.pendingMagicAt !== null) sequence.push(MAGIC_PAUSE_MS)
    return {
      active: true,
      codes: [...this.mods],
      sequence,
    }
  }

  private record() {
    const at = this.now()
    this.frames.push({
      codes: [...this.mods, ...this.keys],
      delayMS: this.nextDelayMS ?? (this.frames.length ? Math.max(20, at - this.lastAt) : 0),
    })
    this.nextDelayMS = null
    this.lastAt = at
  }

  private endSegment() {
    if (!this.segmentHasKeys && this.mods.length) {
      this.sequence.push([...this.mods])
      this.record()
      this.frames.push({ codes: [], delayMS: 100 })
    } else if (this.frames.length > this.segmentStart) {
      if (this.keys.size) this.frames.push({ codes: [], delayMS: 100 })
      else this.frames[this.frames.length - 1]!.codes = []
    }
    this.mods = []
    this.keys.clear()
    this.segmentStart = this.frames.length
    this.segmentHasKeys = false
  }

  private insertPause() {
    this.endSegment()
    this.nextDelayMS = (this.nextDelayMS ?? 0) + MAGIC_PAUSE_MS
    this.sequence.push(MAGIC_PAUSE_MS)
    this.pendingMagicAt = null
  }

  onMagic(down: boolean): MagicEffect {
    if (!down) this.magicPressed = false
    else if (!this.magicPressed) {
      this.magicPressed = true
      const at = this.now()
      if (this.pendingMagicAt !== null && at - this.pendingMagicAt <= MAGIC_DOUBLE_TAP_MS) {
        this.pendingMagicAt = null
        if (this.started) {
          this.endSegment()
          const frames = this.nextDelayMS === null
            ? this.frames
            : [...this.frames, { codes: [], delayMS: this.nextDelayMS }]
          this.reset()
          return { handled: true, frames, hint: this.hint() }
        }
        this.started = true
      } else {
        if (this.pendingMagicAt !== null && this.started) this.insertPause()
        this.pendingMagicAt = at
      }
    }
    return { handled: true, frames: [], hint: this.hint() }
  }

  onKey(code: string, down: boolean): MagicEffect {
    if (down && this.pendingMagicAt !== null) {
      if (this.started && code !== 'Escape') this.insertPause()
      else this.pendingMagicAt = null
    }
    if (!this.started || !knownKey(code)) {
      return { handled: false, frames: [], hint: this.hint() }
    }
    if (code === 'Escape') {
      if (down) this.reset()
      return { handled: true, frames: [], hint: this.hint() }
    }
    if (isModifier(code)) {
      if (!down || this.mods.includes(code)) {
        return { handled: true, frames: [], hint: this.hint() }
      }
      this.mods.push(code)
      return { handled: true, frames: [], hint: this.hint() }
    } else if (down) {
      if (this.keys.has(code)) return { handled: true, frames: [], hint: this.hint() }
      this.keys.add(code)
      this.sequence.push([...this.mods, ...this.keys])
      this.segmentHasKeys = true
    } else if (!this.keys.delete(code)) {
      return { handled: true, frames: [], hint: this.hint() }
    }
    this.record()
    return { handled: true, frames: [], hint: this.hint() }
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
    return { kind: 'magic', effect: { handled: true, frames: [], hint: composer.hint() } }
  }
  if (magic && input.physical === magic) {
    return { kind: 'magic', effect: composer.onMagic(input.down) }
  }
  const code = mapKeyboardCode(input.physical, input)
  const effect = composer.onKey(code, input.down)
  return composer.started || effect.handled ? { kind: 'magic', effect } : { kind: 'passthrough', code }
}
