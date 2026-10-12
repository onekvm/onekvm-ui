<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import type { GlobalThemeOverrides } from 'naive-ui'
import { Command, Grid2X2, X } from '@lucide/vue'
import VirtualKeyboardKeyContent from './VirtualKeyboardKeyContent.vue'

import { t } from '@/i18n/runtime'
import { useOverlayMount } from '@/composables/useOverlayMount'
import type { KeyboardLayout } from '@/api/client'
import { KeyboardCodes } from '@/input/keyboard'
import { COARSE_POINTER_QUERY } from '@/lib/mobile-viewport'
import {
  clampOverlayPosition,
  overlayGrabOffset,
  overlayMountHostRect,
  overlayPlaceBottomCenter,
  overlayPointerPosition,
  type OverlayPoint,
} from '@/lib/overlay-drag'
import { onekvm } from '@/lib/onekvm'
import { TOOLBAR_LAUNCHER_QUERY, toolbarLauncherActive } from '@/lib/toolbar-dock'
import {
  applyKeyLabels,
  desktopKeyboardRows,
  functionRow,
  layoutLabels,
  mobileLayerRows,
  mobileKeyboardModifiers,
  mobileRowClass,
  navigationRows,
  nextKeyboardLayer,
  parseVirtualKeyboardMode,
  VIRTUAL_KEYBOARD_MODE_KEY,
  type KeyboardLayer,
  type VirtualKey,
} from '@/lib/virtual-keyboard'

const props = defineProps<{ show: boolean; layout: KeyboardLayout; blocked: boolean }>()
const emit = defineEmits<{ 'update:show': [show: boolean]; 'focus-console': [] }>()
const titleControlHeight = '26px'
const modeSwitchTheme: GlobalThemeOverrides['Radio'] = {
  buttonHeightSmall: titleControlHeight,
  fontSizeSmall: '12px',
}
const titleButtonTheme: GlobalThemeOverrides['Button'] = {
  heightTiny: titleControlHeight,
  fontSizeTiny: '12px',
  paddingTiny: '0 8px',
  textColor: 'var(--foreground)',
  border: '1px solid var(--border-strong)',
}
const overlayTo = useOverlayMount()
const panel = ref<HTMLElement | null>(null)

function readViewport() {
  if (typeof window === 'undefined') return { width: 1024, height: 768 }
  return { width: window.innerWidth, height: window.innerHeight }
}

const viewport = ref(readViewport())
const desktop = computed(() => !toolbarLauncherActive(viewport.value.width, viewport.value.height))
const landscape = computed(() => !desktop.value && viewport.value.width > viewport.value.height)
const touchUi = shallowRef(typeof window !== 'undefined' && Boolean(window.matchMedia?.(COARSE_POINTER_QUERY)?.matches))
const layer = shallowRef<KeyboardLayer>('letters')
const mode = shallowRef(parseVirtualKeyboardMode(localStorage.getItem(VIRTUAL_KEYBOARD_MODE_KEY)))
const position = ref({ x: 24, y: 96 })
const hasPlaced = shallowRef(false)
const modifiers = shallowRef(0)
const pressedCode = shallowRef('')
let launcherMedia: MediaQueryList | undefined
let pointerMedia: MediaQueryList | undefined
let dragOffset: OverlayPoint = { x: 0, y: 0 }
let dragging = false
let dragHandle: HTMLElement | null = null
let dragPointerId: number | null = null
let chordTimer: number | undefined

const mainRows = computed(() => applyKeyLabels(desktopKeyboardRows(mode.value), layoutLabels[props.layout] || {}))
const mobileModifiers = computed(() => mobileKeyboardModifiers(mode.value))
const mainFunctionRow = functionRow.slice(0, 13)
const systemFunctionRow = functionRow.slice(13)
const mobileRows = computed(() => applyKeyLabels(mobileLayerRows(layer.value), layoutLabels[props.layout] || {}))
const panelStyle = computed(() => {
  if (landscape.value) return undefined
  return {
    left: `${position.value.x}px`,
    top: `${position.value.y}px`,
  }
})

function modifierActive(item: VirtualKey) {
  return Boolean(item.modifier && modifiers.value & item.modifier)
}

function layerActive(item: VirtualKey) {
  return item.kind === 'layer' && item.layer === layer.value
}

function mobileKeyClass(item: VirtualKey) {
  return {
    active: modifierActive(item) || layerActive(item),
    pressed: pressedCode.value === item.code,
    'is-space': item.code === 'Space',
    'is-wide': item.code === 'ShiftLeft' || item.code === 'Backspace' || item.code === 'Enter',
  }
}

function keyLabel(item: VirtualKey) {
  if (item.kind === 'layer') {
    if (item.layer === 'fn') return t('keyboard.layerFn', 'Function keys')
    if (item.layer === 'numbers') return t('keyboard.layerNumbers', 'Numbers')
    return t('keyboard.layerLetters', 'Letters')
  }
  if (item.code === 'MetaLeft' || item.code === 'MetaRight') return mode.value === 'mac' ? 'Command' : 'Win'
  if (item.code === 'AltLeft' || item.code === 'AltRight') return mode.value === 'mac' ? 'Option' : 'Alt'
  const names: Record<string, string> = {
    Backspace: 'Backspace', Enter: 'Enter', Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'Shift',
    ArrowUp: 'Arrow up', ArrowDown: 'Arrow down', ArrowLeft: 'Arrow left', ArrowRight: 'Arrow right',
    PrintScreen: 'Print Screen', Pause: 'Pause',
  }
  const fallback = names[item.code]
  if (!fallback) return item.label
  const nameCode = item.code.startsWith('Shift') ? 'Shift' : item.code
  return t(`keyboard.keyNames.${nameCode}`, fallback)
}

function toggleModifier(item: VirtualKey) {
  if (!item.modifier) return
  modifiers.value ^= item.modifier
  sendState()
}

function sendState() {
  const usage = KeyboardCodes.get(pressedCode.value)
  onekvm.keyboardState.set('virtual', usage ? [usage] : [], modifiers.value)
}

function changeMode(value: string) {
  releaseAll()
  mode.value = parseVirtualKeyboardMode(value)
  localStorage.setItem(VIRTUAL_KEYBOARD_MODE_KEY, mode.value)
  emit('focus-console')
}

function press(item: VirtualKey, event: PointerEvent) {
  if (props.blocked) return
  emit('focus-console')
  if (item.kind === 'layer' && item.layer) {
    layer.value = nextKeyboardLayer(layer.value, item.layer)
    return
  }
  if (event.currentTarget instanceof HTMLElement) event.currentTarget.setPointerCapture(event.pointerId)
  if (item.modifier) {
    toggleModifier(item)
    return
  }
  const usage = KeyboardCodes.get(item.code)
  if (!usage) return
  pressedCode.value = item.code
  sendState()
}

function release(item: VirtualKey) {
  if (item.kind === 'layer' || item.modifier || pressedCode.value !== item.code) return
  pressedCode.value = ''
  sendState()
}

function sendChord(keys: number[], mask: number) {
  if (props.blocked) return
  emit('focus-console')
  window.clearTimeout(chordTimer)
  onekvm.keyboardState.set('virtual-chord', keys, mask)
  chordTimer = window.setTimeout(() => {
    chordTimer = undefined
    onekvm.keyboardState.release('virtual-chord')
  }, 90)
}

function releaseAll() {
  window.clearTimeout(chordTimer)
  chordTimer = undefined
  modifiers.value = 0
  pressedCode.value = ''
  onekvm.keyboardState.release('virtual', 'virtual-chord')
}

function resetKeyboard() {
  releaseAll()
  emit('focus-console')
}

function close() {
  releaseAll()
  layer.value = 'letters'
  emit('update:show', false)
}

function viewportSize() {
  return viewport.value
}

function hostRect() {
  return overlayMountHostRect(overlayTo.value, viewportSize())
}

function panelSize() {
  const el = panel.value
  if (!el) return null
  const width = el.offsetWidth
  const height = el.offsetHeight
  if (width <= 0 || height <= 0) return null
  return { width, height }
}

function clampPosition() {
  const size = panelSize()
  if (!size) return
  position.value = clampOverlayPosition(position.value, size, hostRect())
}

async function placePanel(force = false) {
  await nextTick()
  if (!panelSize()) await nextTick()
  const size = panelSize()
  if (!size) return
  if (landscape.value) {
    hasPlaced.value = true
    return
  }
  if (force || !hasPlaced.value) {
    position.value = overlayPlaceBottomCenter(size, hostRect())
    hasPlaced.value = true
  }
  clampPosition()
}

function startDrag(event: PointerEvent) {
  if (landscape.value) return
  if (event.button !== 0 || !panel.value) return
  const handle = event.currentTarget
  if (!(handle instanceof HTMLElement)) return
  try {
    handle.setPointerCapture(event.pointerId)
  } catch {
    /* capture is optional */
  }
  event.preventDefault()
  event.stopPropagation()
  dragOffset = overlayGrabOffset(event.clientX, event.clientY, panel.value.getBoundingClientRect())
  dragging = true
  dragHandle = handle
  dragPointerId = event.pointerId
  window.addEventListener('pointermove', drag)
  window.addEventListener('pointerup', stopDrag)
  window.addEventListener('pointercancel', stopDrag)
}

function drag(event: PointerEvent) {
  if (!dragging) return
  event.preventDefault()
  position.value = overlayPointerPosition(event.clientX, event.clientY, hostRect(), dragOffset)
  clampPosition()
}

function stopDrag() {
  dragging = false
  if (dragHandle && dragPointerId != null) {
    try {
      dragHandle.releasePointerCapture(dragPointerId)
    } catch {
      /* already released */
    }
  }
  dragHandle = null
  dragPointerId = null
  window.removeEventListener('pointermove', drag)
  window.removeEventListener('pointerup', stopDrag)
  window.removeEventListener('pointercancel', stopDrag)
}

function syncViewport() {
  const previous = viewport.value
  const next = readViewport()
  const changed = toolbarLauncherActive(previous.width, previous.height)
    !== toolbarLauncherActive(next.width, next.height)
    || (previous.width > previous.height) !== (next.width > next.height)
  viewport.value = next
  if (changed) hasPlaced.value = false
  if (props.show) void placePanel(changed)
  else clampPosition()
}

function syncTouchUi(event?: MediaQueryListEvent) {
  touchUi.value = event?.matches ?? Boolean(pointerMedia?.matches)
}

watch(
  () => props.show,
  (show) => {
    if (show) {
      layer.value = 'letters'
      void placePanel()
      return
    }
    stopDrag()
    releaseAll()
  },
  { immediate: true },
)

watch(overlayTo, () => {
  if (props.show) clampPosition()
})

watch(() => props.blocked, (blocked) => {
  if (blocked) releaseAll()
})

onMounted(() => {
  launcherMedia = window.matchMedia(TOOLBAR_LAUNCHER_QUERY)
  pointerMedia = window.matchMedia(COARSE_POINTER_QUERY)
  touchUi.value = pointerMedia.matches
  viewport.value = readViewport()
  launcherMedia.addEventListener('change', syncViewport)
  pointerMedia.addEventListener('change', syncTouchUi)
  window.addEventListener('resize', syncViewport)
  window.addEventListener('blur', releaseAll)
  window.addEventListener('pagehide', releaseAll)
  document.addEventListener('visibilitychange', releaseAll)
})

onBeforeUnmount(() => {
  launcherMedia?.removeEventListener('change', syncViewport)
  pointerMedia?.removeEventListener('change', syncTouchUi)
  window.removeEventListener('resize', syncViewport)
  window.removeEventListener('blur', releaseAll)
  window.removeEventListener('pagehide', releaseAll)
  document.removeEventListener('visibilitychange', releaseAll)
  stopDrag()
  releaseAll()
})
</script>

<template>
  <Teleport :to="overlayTo">
    <Transition :name="desktop ? 'win11-window' : 'keyboard-sheet'" appear>
    <section
      v-if="show"
      ref="panel"
      class="keyboard-panel"
      :class="{
        'keyboard-panel-mobile': !desktop,
        'is-landscape': landscape,
        'is-touch': touchUi,
      }"
      :style="panelStyle"
      role="dialog"
      :aria-label="t('keyboard.virtualKeyboard')"
    >
      <header class="keyboard-titlebar" @pointerdown="startDrag">
        <strong v-if="desktop">{{ t('keyboard.virtualKeyboard') }} · {{ t(`keyboard.layouts.${layout}`, layout.toUpperCase()) }}</strong>
        <strong v-else>{{ t('keyboard.title', 'Keyboard') }}</strong>
        <n-radio-group
          class="keyboard-mode-switch"
          :value="mode"
          size="small"
          :theme-overrides="modeSwitchTheme"
          :aria-label="t('keyboard.mode')"
          @pointerdown.stop.prevent
          @update:value="changeMode"
        >
          <n-radio-button value="win" title="Windows">
            <Grid2X2 :size="16" aria-hidden="true" />
            <span class="keyboard-mode-label">Windows</span>
          </n-radio-button>
          <n-radio-button value="mac" title="macOS">
            <Command :size="16" aria-hidden="true" />
            <span class="keyboard-mode-label">macOS</span>
          </n-radio-button>
        </n-radio-group>
        <div class="keyboard-title-actions" @pointerdown.stop.prevent>
          <n-button size="tiny" :theme-overrides="titleButtonTheme" @click="sendChord([76], 1 | 4)">{{ desktop ? t('keyboard.ctrlaltdel', 'Ctrl+Alt+Del') : t('keyboard.cadShort', 'CAD') }}</n-button>
          <n-button size="tiny" :theme-overrides="titleButtonTheme" @click="resetKeyboard">{{ desktop ? t('keyboard.releaseAll', 'Release all') : t('keyboard.releaseShort', 'Release') }}</n-button>
          <n-button quaternary circle size="tiny" :theme-overrides="titleButtonTheme" :aria-label="t('common.close', 'Close')" @click="close">
            <template #icon><X /></template>
          </n-button>
        </div>
      </header>

      <div v-if="desktop" class="keyboard-scroll">
        <div class="virtual-keyboard">
          <div class="keyboard-layout">
            <div class="keyboard-main">
              <div class="keyboard-row keyboard-function-row">
                <button
                  v-for="item in mainFunctionRow"
                  :key="item.code"
                  type="button"
                  class="keyboard-key"
                  :class="{ 'keyboard-key-gap': item.gapAfter, pressed: pressedCode === item.code }"
                  :style="{ '--key-units': item.units || 1 }"
                  :aria-label="keyLabel(item)"
                  :title="keyLabel(item)"
                  @pointerdown.prevent="press(item, $event)"
                  @pointerup.prevent="release(item)"
                  @pointercancel="release(item)"
                  @lostpointercapture="release(item)"
                >
                  <VirtualKeyboardKeyContent :item="item" :mode="mode" />
                </button>
              </div>

              <div v-for="(row, rowIndex) in mainRows" :key="rowIndex" class="keyboard-row">
                <button
                  v-for="item in row"
                  :key="item.code"
                  type="button"
                  class="keyboard-key"
                  :class="{ active: modifierActive(item), pressed: pressedCode === item.code }"
                  :style="{ '--key-units': item.units || 1 }"
                  :aria-pressed="item.modifier ? modifierActive(item) : undefined"
                  :aria-label="keyLabel(item)"
                  :title="keyLabel(item)"
                  @pointerdown.prevent="press(item, $event)"
                  @pointerup.prevent="release(item)"
                  @pointercancel="release(item)"
                  @lostpointercapture="release(item)"
                >
                  <VirtualKeyboardKeyContent :item="item" :mode="mode" />
                </button>
              </div>
            </div>

            <div class="keyboard-navigation">
              <div class="keyboard-nav-row keyboard-function-row">
                <button
                  v-for="item in systemFunctionRow"
                  :key="item.code"
                  type="button"
                  class="keyboard-key"
                  :class="{ pressed: pressedCode === item.code }"
                  :aria-label="keyLabel(item)"
                  :title="keyLabel(item)"
                  @pointerdown.prevent="press(item, $event)"
                  @pointerup.prevent="release(item)"
                  @pointercancel="release(item)"
                  @lostpointercapture="release(item)"
                >
                  <VirtualKeyboardKeyContent :item="item" :mode="mode" />
                </button>
              </div>
              <div v-for="(row, rowIndex) in navigationRows" :key="rowIndex" class="keyboard-nav-row">
                <button
                  v-for="item in row"
                  :key="item.code"
                  type="button"
                  class="keyboard-key"
                  :class="{ pressed: pressedCode === item.code }"
                  :aria-label="keyLabel(item)"
                  :title="keyLabel(item)"
                  @pointerdown.prevent="press(item, $event)"
                  @pointerup.prevent="release(item)"
                  @pointercancel="release(item)"
                  @lostpointercapture="release(item)"
                >
                  <VirtualKeyboardKeyContent :item="item" :mode="mode" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="keyboard-mobile">
        <div class="keyboard-mobile-row is-mods">
          <button
            v-for="item in mobileModifiers"
            :key="item.code"
            type="button"
            class="keyboard-key keyboard-mobile-key"
            :class="mobileKeyClass(item)"
            :aria-pressed="item.modifier || item.kind === 'layer' ? modifierActive(item) || layerActive(item) : undefined"
            :aria-label="keyLabel(item)"
            :title="keyLabel(item)"
            @pointerdown.prevent="press(item, $event)"
            @pointerup.prevent="release(item)"
            @pointercancel="release(item)"
            @lostpointercapture="release(item)"
          >
            <VirtualKeyboardKeyContent :item="item" :mode="mode" compact />
          </button>
        </div>
        <div
          v-for="(row, rowIndex) in mobileRows"
          :key="`${layer}-${rowIndex}`"
          class="keyboard-mobile-row"
          :class="mobileRowClass(row)"
        >
          <button
            v-for="item in row"
            :key="item.code"
            type="button"
            class="keyboard-key keyboard-mobile-key"
            :class="mobileKeyClass(item)"
            :style="item.flex ? { flex: `${item.flex} 1 0` } : undefined"
            :aria-pressed="item.modifier || item.kind === 'layer' ? modifierActive(item) || layerActive(item) : undefined"
            :aria-label="keyLabel(item)"
            :title="keyLabel(item)"
            @pointerdown.prevent="press(item, $event)"
            @pointerup.prevent="release(item)"
            @pointercancel="release(item)"
            @lostpointercapture="release(item)"
          >
            <VirtualKeyboardKeyContent :item="item" :mode="mode" compact />
          </button>
        </div>
      </div>
    </section>
    </Transition>
  </Teleport>
</template>
