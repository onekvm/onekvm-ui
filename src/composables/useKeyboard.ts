import { onBeforeUnmount, onMounted, watch, type Ref } from 'vue'

import { onekvm } from '@/lib/onekvm'
import { KeyboardCodes, ModifierCodes } from '@/input/keyboard'

export function useKeyboard(
  blocked: Ref<boolean>,
  target: Readonly<Ref<HTMLElement | null>>,
  rightControlAsMeta: Ref<boolean>,
) {
  const pressedKeys = new Set<number>()
  const pressedModifiers = new Map<string, number>()

  const modifierMask = () =>
    Array.from(pressedModifiers.values()).reduce((mask, modifier) => mask | modifier, 0)

  const sendState = () => onekvm.sendKeyboard(Array.from(pressedKeys), modifierMask())

  const releaseAll = () => {
    if (pressedKeys.size === 0 && pressedModifiers.size === 0) return
    pressedKeys.clear()
    pressedModifiers.clear()
    onekvm.sendKeyboard([])
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

  const eventCode = (event: KeyboardEvent) => {
    if (rightControlAsMeta.value && event.code === 'ControlRight') return 'MetaLeft'
    if (event.code === 'OSLeft') return 'MetaLeft'
    if (event.code === 'OSRight') return 'MetaRight'
    if (event.code) return event.code
    if (event.key === 'Meta' || event.key === 'OS') {
      return event.location === KeyboardEvent.DOM_KEY_LOCATION_RIGHT ? 'MetaRight' : 'MetaLeft'
    }
    return ''
  }

  const keyDown = (event: KeyboardEvent) => {
    if (blocked.value || acceptsText() || document.activeElement !== target.value) return

    const code = eventCode(event)
    const modifier = ModifierCodes.get(code)
    const key = KeyboardCodes.get(code)
    if (!modifier && !key) return

    event.preventDefault()
    event.stopPropagation()
    if (modifier) pressedModifiers.set(code, modifier)
    else if (key) pressedKeys.add(key)
    sendState()
  }

  const keyUp = (event: KeyboardEvent) => {
    const code = eventCode(event)
    const modifier = ModifierCodes.get(code)
    const key = KeyboardCodes.get(code)
    if (!modifier && !key) return
    const pressed = modifier ? pressedModifiers.has(code) : key ? pressedKeys.has(key) : false
    if (!pressed) return
    if (!blocked.value) {
      event.preventDefault()
      event.stopPropagation()
    }
    if (modifier) {
      // Chromium and WebKit may omit non-modifier keyup events from Meta chords.
      if (modifier === 8 || modifier === 128) pressedKeys.clear()
      pressedModifiers.delete(code)
    }
    else if (key) pressedKeys.delete(key)
    sendState()
  }

  watch(blocked, (isBlocked) => {
    if (isBlocked) releaseAll()
  })

  onMounted(() => {
    window.addEventListener('keydown', keyDown, { capture: true })
    window.addEventListener('keyup', keyUp, { capture: true })
    window.addEventListener('blur', releaseAll)
    window.addEventListener('pagehide', releaseAll)
    document.addEventListener('visibilitychange', releaseAll)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', keyDown, { capture: true })
    window.removeEventListener('keyup', keyUp, { capture: true })
    window.removeEventListener('blur', releaseAll)
    window.removeEventListener('pagehide', releaseAll)
    document.removeEventListener('visibilitychange', releaseAll)
    releaseAll()
  })

  return { releaseAll }
}
