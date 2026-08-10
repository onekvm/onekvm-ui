<script setup lang="ts">
import { computed, ref } from 'vue'
import { ListChecks, X } from '@lucide/vue'

import { t } from '@/i18n/runtime'
import { KeyboardCodes, ModifierCodes } from '@/input/keyboard'
import {
  MAX_SHORTCUT_KEYS,
  shortcutKeyLabel,
  shortcutKeyOptions,
} from '@/lib/keyboard-shortcuts'

const props = defineProps<{
  modelValue: string[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string[]]
}>()

const recorder = ref<HTMLElement | null>(null)
const recording = ref(false)
const heldCodes = new Set<string>()

const keyOptions = computed(() => shortcutKeyOptions({
  modifiers: t('keyboard.shortcuts.keyGroups.modifiers', 'Modifiers'),
  letters: t('keyboard.shortcuts.keyGroups.letters', 'Letters'),
  numbers: t('keyboard.shortcuts.keyGroups.numbers', 'Numbers'),
  functionKeys: t('keyboard.shortcuts.keyGroups.functionKeys', 'Function keys'),
  editing: t('keyboard.shortcuts.keyGroups.editing', 'Editing'),
  arrows: t('keyboard.shortcuts.keyGroups.arrows', 'Arrows'),
  symbols: t('keyboard.shortcuts.keyGroups.symbols', 'Symbols'),
  system: t('keyboard.shortcuts.keyGroups.system', 'System'),
  numpad: t('keyboard.shortcuts.keyGroups.numpad', 'Numpad'),
}))

function normalizeCode(event: KeyboardEvent) {
  if (event.code === 'OSLeft') return 'MetaLeft'
  if (event.code === 'OSRight') return 'MetaRight'
  if (event.code) return event.code
  if (event.key === 'Meta' || event.key === 'OS') {
    return event.location === KeyboardEvent.DOM_KEY_LOCATION_RIGHT ? 'MetaRight' : 'MetaLeft'
  }
  return ''
}

function supported(code: string) {
  return ModifierCodes.has(code) || KeyboardCodes.has(code)
}

function keyDown(event: KeyboardEvent) {
  if (props.disabled) return
  const code = normalizeCode(event)
  if (!supported(code)) return
  event.preventDefault()
  event.stopPropagation()
  if (event.repeat || heldCodes.has(code)) return

  const keys = heldCodes.size === 0 ? [] : [...props.modelValue]
  heldCodes.add(code)
  if (!keys.includes(code) && keys.length < MAX_SHORTCUT_KEYS) {
    keys.push(code)
    emit('update:modelValue', keys)
  }
}

function keyUp(event: KeyboardEvent) {
  const code = normalizeCode(event)
  if (!supported(code)) return
  event.preventDefault()
  event.stopPropagation()
  heldCodes.delete(code)
  if (code === 'MetaLeft' || code === 'MetaRight') heldCodes.clear()
}

function focus() {
  if (!props.disabled) recorder.value?.focus({ preventScroll: true })
}

function blur() {
  recording.value = false
  heldCodes.clear()
}

function clear() {
  heldCodes.clear()
  emit('update:modelValue', [])
  focus()
}
</script>

<template>
  <div class="shortcut-key-control">
    <div
      ref="recorder"
      class="shortcut-key-recorder"
      :class="{ recording, disabled }"
      :tabindex="disabled ? -1 : 0"
      role="textbox"
      :aria-label="t('keyboard.shortcuts.recordPrompt', 'Click and press a key combination')"
      @click="focus"
      @focus="recording = true"
      @blur="blur"
      @keydown="keyDown"
      @keyup="keyUp"
    >
      <template v-if="modelValue.length">
        <kbd v-for="code in modelValue" :key="code">{{ shortcutKeyLabel(code) }}</kbd>
      </template>
      <span v-else>
        {{ recording
          ? t('keyboard.shortcuts.recording', 'Press the key combination now')
          : t('keyboard.shortcuts.recordPrompt', 'Click and press a key combination') }}
      </span>
      <small>{{ modelValue.length }}/{{ MAX_SHORTCUT_KEYS }}</small>
    </div>

    <n-popover trigger="click" placement="bottom-end" :width="380">
      <template #trigger>
        <n-button
          quaternary
          :disabled="disabled"
          :aria-label="t('keyboard.shortcuts.selectKeys', 'Select keys')"
        >
          <template #icon><ListChecks /></template>
        </n-button>
      </template>
      <n-select
        :value="modelValue"
        :options="keyOptions"
        multiple
        filterable
        :max-tag-count="MAX_SHORTCUT_KEYS"
        :placeholder="t('keyboard.shortcuts.keysPlaceholder', 'Select up to 5 keys')"
        @update:value="emit('update:modelValue', $event.slice(0, MAX_SHORTCUT_KEYS))"
      />
    </n-popover>

    <n-button
      quaternary
      :disabled="disabled || !modelValue.length"
      :aria-label="t('keyboard.shortcuts.clear', 'Clear combination')"
      @click="clear"
    >
      <template #icon><X /></template>
    </n-button>
  </div>
</template>
