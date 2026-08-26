<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { GripHorizontal, X } from '@lucide/vue'

import { t } from '@/i18n/runtime'
import type { KeyboardLayout } from '@/api/client'
import { KeyboardCodes } from '@/input/keyboard'
import { onekvm } from '@/lib/onekvm'

const props = defineProps<{ show: boolean; layout: KeyboardLayout }>()
const emit = defineEmits<{ 'update:show': [show: boolean] }>()

type Key = {
  label: string
  code: string
  units?: number
  modifier?: number
  gapAfter?: boolean
}

const key = (label: string, code: string, units = 1, modifier?: number, gapAfter = false): Key => ({
  label,
  code,
  units,
  modifier,
  gapAfter,
})

const functionRow: Key[] = [
  key('Esc', 'Escape', 1, undefined, true),
  key('F1', 'F1'), key('F2', 'F2'), key('F3', 'F3'), key('F4', 'F4', 1, undefined, true),
  key('F5', 'F5'), key('F6', 'F6'), key('F7', 'F7'), key('F8', 'F8', 1, undefined, true),
  key('F9', 'F9'), key('F10', 'F10'), key('F11', 'F11'), key('F12', 'F12', 1, undefined, true),
  key('PrtSc', 'PrintScreen'), key('Pause', 'Pause'),
]

const baseMainRows: Key[][] = [
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

const layoutLabels: Partial<Record<KeyboardLayout, Record<string, string>>> = {
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

const mainRows = computed(() => {
	const labels = layoutLabels[props.layout] || {}
	return baseMainRows.map((row) => row.map((item) => ({ ...item, label: labels[item.code] || item.label })))
})

const navigationRows: Key[][] = [
  [key('Ins', 'Insert'), key('Home', 'Home'), key('PgUp', 'PageUp')],
  [key('Del', 'Delete'), key('End', 'End'), key('PgDn', 'PageDown')],
  [key('↑', 'ArrowUp')],
  [key('←', 'ArrowLeft'), key('↓', 'ArrowDown'), key('→', 'ArrowRight')],
]

const panel = ref<HTMLElement | null>(null)
const desktop = ref(true)
const position = ref({ x: 24, y: 96 })
const modifiers = ref(0)
const pressedCode = ref('')
let media: MediaQueryList | undefined
let dragOffset = { x: 0, y: 0 }
let dragging = false

const panelStyle = computed(() =>
  desktop.value ? { left: `${position.value.x}px`, top: `${position.value.y}px` } : undefined,
)

function modifierActive(item: Key) {
  return Boolean(item.modifier && modifiers.value & item.modifier)
}

function toggleModifier(item: Key) {
  if (!item.modifier) return
  modifiers.value ^= item.modifier
  onekvm.sendKeyboard([], modifiers.value)
}

function press(item: Key, event: PointerEvent) {
  event.currentTarget instanceof HTMLElement && event.currentTarget.setPointerCapture(event.pointerId)
  if (item.modifier) {
    toggleModifier(item)
    return
  }
  const usage = KeyboardCodes.get(item.code)
  if (!usage) return
  pressedCode.value = item.code
  onekvm.sendKeyboard([usage], modifiers.value)
}

function release(item: Key) {
  if (item.modifier || pressedCode.value !== item.code) return
  pressedCode.value = ''
  onekvm.sendKeyboard([], modifiers.value)
}

function sendChord(keys: number[], mask: number) {
  onekvm.sendKeyboard(keys, mask)
  window.setTimeout(() => onekvm.sendKeyboard([], modifiers.value), 90)
}

function releaseAll() {
  modifiers.value = 0
  pressedCode.value = ''
  onekvm.sendKeyboard([])
}

function close() {
  releaseAll()
  emit('update:show', false)
}

function clampPosition() {
  if (!panel.value || !desktop.value) return
  const rect = panel.value.getBoundingClientRect()
  position.value = {
    x: Math.max(8, Math.min(window.innerWidth - rect.width - 8, position.value.x)),
    y: Math.max(48, Math.min(window.innerHeight - rect.height - 8, position.value.y)),
  }
}

async function placePanel() {
  await nextTick()
  if (!panel.value || !desktop.value) return
  const rect = panel.value.getBoundingClientRect()
  position.value = {
    x: Math.max(8, (window.innerWidth - rect.width) / 2),
    y: Math.max(48, window.innerHeight - rect.height - 34),
  }
  clampPosition()
}

function startDrag(event: PointerEvent) {
  if (!desktop.value || event.button !== 0 || !panel.value) return
  const rect = panel.value.getBoundingClientRect()
  dragOffset = { x: event.clientX - rect.left, y: event.clientY - rect.top }
  dragging = true
  window.addEventListener('pointermove', drag)
  window.addEventListener('pointerup', stopDrag, { once: true })
}

function drag(event: PointerEvent) {
  if (!dragging) return
  position.value = { x: event.clientX - dragOffset.x, y: event.clientY - dragOffset.y }
  clampPosition()
}

function stopDrag() {
  dragging = false
  window.removeEventListener('pointermove', drag)
}

function updateMedia(event?: MediaQueryListEvent) {
  desktop.value = event?.matches ?? media?.matches ?? true
  if (props.show && desktop.value) void placePanel()
}

watch(
  () => props.show,
  (show) => {
    if (show) void placePanel()
    else releaseAll()
  },
)

onMounted(() => {
  media = window.matchMedia('(min-width: 768px)')
  desktop.value = media.matches
  media.addEventListener('change', updateMedia)
  window.addEventListener('resize', clampPosition)
})

onBeforeUnmount(() => {
  media?.removeEventListener('change', updateMedia)
  window.removeEventListener('resize', clampPosition)
  window.removeEventListener('pointermove', drag)
  releaseAll()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="win11-window">
    <section
      v-if="show"
      ref="panel"
      class="keyboard-panel"
      :class="{ 'keyboard-panel-mobile': !desktop }"
      :style="panelStyle"
      role="dialog"
      :aria-label="t('keyboard.virtualKeyboard')"
    >
      <header class="keyboard-titlebar" @pointerdown="startDrag">
        <GripHorizontal :size="16" class="keyboard-grip" />
		<strong>{{ t('keyboard.virtualKeyboard') }} · {{ t(`keyboard.layouts.${layout}`, layout.toUpperCase()) }}</strong>
        <div class="keyboard-title-actions" @pointerdown.stop>
          <n-button size="tiny" secondary @click="sendChord([76], 1 | 4)">{{ t('keyboard.ctrlaltdel', 'Ctrl+Alt+Del') }}</n-button>
          <n-button size="tiny" secondary @click="releaseAll">{{ t('keyboard.releaseAll', 'Release all') }}</n-button>
          <n-button quaternary circle size="tiny" :aria-label="t('common.close', 'Close')" @click="close">
            <template #icon><X /></template>
          </n-button>
        </div>
      </header>

      <div class="keyboard-scroll">
        <div class="virtual-keyboard">
          <div class="keyboard-row keyboard-function-row">
            <button
              v-for="item in functionRow"
              :key="item.code"
              type="button"
              class="keyboard-key"
              :class="{ 'keyboard-key-gap': item.gapAfter, pressed: pressedCode === item.code }"
              :style="{ '--key-units': item.units || 1 }"
              @pointerdown.prevent="press(item, $event)"
              @pointerup.prevent="release(item)"
              @pointercancel="release(item)"
            >
              {{ item.label }}
            </button>
          </div>

          <div class="keyboard-layout">
            <div class="keyboard-main">
              <div v-for="(row, rowIndex) in mainRows" :key="rowIndex" class="keyboard-row">
                <button
                  v-for="item in row"
                  :key="item.code"
                  type="button"
                  class="keyboard-key"
                  :class="{ active: modifierActive(item), pressed: pressedCode === item.code }"
                  :style="{ '--key-units': item.units || 1 }"
                  :aria-pressed="item.modifier ? modifierActive(item) : undefined"
                  @pointerdown.prevent="press(item, $event)"
                  @pointerup.prevent="release(item)"
                  @pointercancel="release(item)"
                >
                  {{ item.label }}
                </button>
              </div>
            </div>

            <div class="keyboard-navigation">
              <div v-for="(row, rowIndex) in navigationRows" :key="rowIndex" class="keyboard-nav-row">
                <button
                  v-for="item in row"
                  :key="item.code"
                  type="button"
                  class="keyboard-key"
                  :class="{ pressed: pressedCode === item.code }"
                  @pointerdown.prevent="press(item, $event)"
                  @pointerup.prevent="release(item)"
                  @pointercancel="release(item)"
                >
                  {{ item.label }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
    </Transition>
  </Teleport>
</template>
