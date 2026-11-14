import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'

import { KeyboardCodes, ModifierCodes } from '@/input/keyboard'
import { onekvm } from '@/lib/onekvm'
import {
  MagicComposer,
  magicHint,
  mapKeyboardCode,
  physicalKeyCode,
  routeKeyboardKey,
  sanitizeMagicKey,
  type MagicEffect,
  type MagicFrame,
} from '@/lib/keyboard-magic'

const idleHint = { active: false, codes: [] as string[] }

export function useKeyboard(
  blocked: Ref<boolean>,
  target: Readonly<Ref<HTMLElement | null>>,
  rightControlAsMeta: Ref<boolean>,
  swapCommandCtrl?: Ref<boolean>,
  magicKey?: Ref<string>,
) {
  const swap = swapCommandCtrl ?? ref(false)
  const magic = magicKey ?? ref('')
  const pressedKeys = new Set<number>()
  const pressedModifiers = new Map<string, number>()
  const capturedKeys = new Set<string>()
  const composer = new MagicComposer()
  let magicTimer = 0
  let magicFrames: MagicFrame[] = []

  const modifierMask = () =>
    Array.from(pressedModifiers.values()).reduce((mask, modifier) => mask | modifier, 0)

  const sendState = () => onekvm.keyboardState.set('physical', Array.from(pressedKeys), modifierMask())

  const publishHint = (hint = composer.hint()) => {
    magicHint.value = hint
  }

  const releaseAll = () => {
    window.clearTimeout(magicTimer)
    magicTimer = 0
    if (magicFrames.length) {
      magicFrames = []
      onekvm.keyboardState.release('magic')
    }
    composer.reset()
    publishHint(idleHint)
    if (pressedKeys.size === 0 && pressedModifiers.size === 0) return
    pressedKeys.clear()
    pressedModifiers.clear()
    onekvm.keyboardState.release('physical')
  }

  const acceptsText = () => {
    const element = document.activeElement
    return Boolean(
      element &&
        (element.tagName === 'INPUT' ||
          element.tagName === 'TEXTAREA' ||
          element.getAttribute('contenteditable') === 'true'),
    )
  }

  const mapOptions = () => ({
    rightControlAsMeta: rightControlAsMeta.value,
    swapCommandCtrl: swap.value,
  })

  const pressMapped = (code: string) => {
    const modifier = ModifierCodes.get(code)
    const key = KeyboardCodes.get(code)
    if (modifier) pressedModifiers.set(code, modifier)
    else if (key) pressedKeys.add(key)
  }

  const releaseMapped = (code: string, clearStuckKeys: boolean) => {
    const modifier = ModifierCodes.get(code)
    const key = KeyboardCodes.get(code)
    if (modifier) {
      if (clearStuckKeys) pressedKeys.clear()
      pressedModifiers.delete(code)
    } else if (key) pressedKeys.delete(key)
  }

  const applyMagic = (effect: MagicEffect) => {
    if (!effect.frames.length) {
      if (!magicFrames.length) publishHint(effect.hint)
      return
    }
    magicFrames = [...effect.frames]
    publishHint({ active: true, codes: [], playing: true })
    const sendNext = () => {
      const frame = magicFrames.shift()
      if (!frame) return
      const keys: number[] = []
      let modifiers = 0
      for (const code of frame.codes) {
        const modifier = ModifierCodes.get(code)
        const key = KeyboardCodes.get(code)
        if (modifier) modifiers |= modifier
        else if (key) keys.push(key)
      }
      onekvm.keyboardState.set('magic', keys, modifiers)
      magicTimer = magicFrames.length ? window.setTimeout(sendNext, magicFrames[0]!.delayMS) : 0
      if (!magicFrames.length) publishHint(idleHint)
    }
    magicTimer = magicFrames[0]!.delayMS ? window.setTimeout(sendNext, magicFrames[0]!.delayMS) : 0
    if (!magicTimer) sendNext()
  }

  const keyDown = (event: KeyboardEvent) => {
    if (blocked.value || acceptsText() || document.activeElement !== target.value) return
    const physical = physicalKeyCode(event)
    if (!event.repeat) capturedKeys.delete(physical)
    // Keys held while composing remain local until released, including after
    // confirmation or cancellation. A fresh press can start normal input.
    if (event.repeat && capturedKeys.has(physical)) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if (magicFrames.length) {
      capturedKeys.add(physical)
      event.preventDefault()
      event.stopPropagation()
      if (physical === 'Escape') releaseAll()
      return
    }
    const routed = routeKeyboardKey(composer, {
      physical,
      down: true,
      repeat: event.repeat,
      magicKey: magic.value,
      ...mapOptions(),
    })
    if (routed.kind === 'magic') {
      if (!routed.effect.handled) return
      capturedKeys.add(physical)
      event.preventDefault()
      event.stopPropagation()
      applyMagic(routed.effect)
      return
    }
    const modifier = ModifierCodes.get(routed.code)
    const key = KeyboardCodes.get(routed.code)
    if (!modifier && !key) return
    event.preventDefault()
    event.stopPropagation()
    // The host repeats held keys. Browser repeat events must not build a
    // second queue of identical held-state reports ahead of the release.
    if (modifier ? pressedModifiers.has(routed.code) : key && pressedKeys.has(key)) return
    pressMapped(routed.code)
    sendState()
  }

  const keyUp = (event: KeyboardEvent) => {
    const physical = physicalKeyCode(event)
    const captured = capturedKeys.delete(physical)
    if (composer.started || (captured && physical === sanitizeMagicKey(magic.value))) {
      const routed = routeKeyboardKey(composer, {
        physical,
        down: false,
        repeat: false,
        magicKey: magic.value,
        ...mapOptions(),
      })
      if (routed.kind === 'magic' && routed.effect.handled) {
        if (!blocked.value) {
          event.preventDefault()
          event.stopPropagation()
        }
        applyMagic(routed.effect)
      }
      return
    }
    if (captured) {
      if (!blocked.value) {
        event.preventDefault()
        event.stopPropagation()
      }
      return
    }
    const code = mapKeyboardCode(physical, mapOptions())
    const modifier = ModifierCodes.get(code)
    const key = KeyboardCodes.get(code)
    if (!modifier && !key) return
    const pressed = modifier ? pressedModifiers.has(code) : key ? pressedKeys.has(key) : false
    if (!pressed) return
    if (!blocked.value) {
      event.preventDefault()
      event.stopPropagation()
    }
    releaseMapped(code, physical === 'MetaLeft' || physical === 'MetaRight')
    sendState()
  }

  const swallowMagicMenu = (event: Event) => {
    if (sanitizeMagicKey(magic.value) !== 'ContextMenu') return
    if (blocked.value || acceptsText() || document.activeElement !== target.value) return
    event.preventDefault()
  }

  watch(blocked, (isBlocked) => {
    if (isBlocked) releaseAll()
  })

  watch([rightControlAsMeta, swap, magic], releaseAll)

  onMounted(() => {
    window.addEventListener('keydown', keyDown, { capture: true })
    window.addEventListener('keyup', keyUp, { capture: true })
    window.addEventListener('contextmenu', swallowMagicMenu, { capture: true })
    window.addEventListener('blur', releaseAll)
    window.addEventListener('pagehide', releaseAll)
    document.addEventListener('visibilitychange', releaseAll)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', keyDown, { capture: true })
    window.removeEventListener('keyup', keyUp, { capture: true })
    window.removeEventListener('contextmenu', swallowMagicMenu, { capture: true })
    window.removeEventListener('blur', releaseAll)
    window.removeEventListener('pagehide', releaseAll)
    document.removeEventListener('visibilitychange', releaseAll)
    releaseAll()
  })

  return { releaseAll }
}
