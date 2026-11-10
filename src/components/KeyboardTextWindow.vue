<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useMessage, type InputInst } from 'naive-ui'

import { api, type KeyboardLayout } from '@/api/client'
import { onekvm } from '@/lib/onekvm'
import { t } from '@/i18n/runtime'
import { filterKeyboardText } from '@/input/keyboard-text'
import { useOverlayMount } from '@/composables/useOverlayMount'
import { registerConsoleWindowLayer } from '@/composables/useConsoleWindowLayer'
import { TextCursorInput } from '@/icons'
import ToolWindow from './toolbox/ToolWindow.vue'

const props = defineProps<{
  layout: KeyboardLayout
  inputSuspended?: boolean
}>()
const show = defineModel<boolean>('show', { required: true })
const text = ref('')
const sendingText = ref(false)
const textInput = ref<InputInst | null>(null)
const overlayTo = useOverlayMount()
const message = useMessage()
const group = shallowRef<ReturnType<typeof registerConsoleWindowLayer> | null>(null)
const state = shallowRef<'normal' | 'maximized' | 'minimized'>('normal')
const visible = computed(() => state.value !== 'minimized')
const sequence = shallowRef(0)
const viewportWidth = ref(window.innerWidth)
const windowWidth = computed(() => viewportWidth.value <= 760 ? Math.max(240, viewportWidth.value - 16) : 520)
let restoreState: 'normal' | 'maximized' = 'normal'
let unsupportedWarningAt = 0

function layoutLabel(layout: KeyboardLayout) {
  return t(`keyboard.layouts.${layout}`, layout.toUpperCase())
}

function updateText(value: string) {
  const filtered = filterKeyboardText(value, props.layout)
  text.value = filtered.value
  if (filtered.removed === 0 || Date.now() - unsupportedWarningAt < 1200) return
  unsupportedWarningAt = Date.now()
  message.warning(t('keyboard.unsupportedRemoved', 'Characters unavailable on this keyboard layout were removed.'))
}

function resumeConsole() {
  onekvm.sendKeyboard([])
  document.querySelector<HTMLElement>('.console-hid-layer')?.focus({ preventScroll: true })
}

function activate() {
  if (state.value === 'minimized') focus()
  else group.value?.raise()
}

function focus() {
  if (!show.value) return
  if (state.value === 'minimized') state.value = restoreState
  group.value?.raise()
  sequence.value++
  void nextTick(() => textInput.value?.focus())
}

function setState(next: 'normal' | 'maximized' | 'minimized') {
  if (next === 'minimized') restoreState = state.value === 'maximized' ? 'maximized' : 'normal'
  state.value = next
  if (next === 'minimized') resumeConsole()
  else focus()
}

function close() {
  if (!sendingText.value) show.value = false
}

watch(show, (open, previous) => {
  if (!open) {
    group.value?.dispose()
    group.value = null
    if (previous) void nextTick(resumeConsole)
    return
  }
  group.value = registerConsoleWindowLayer()
  state.value = 'normal'
  focus()
}, { immediate: true })

onBeforeUnmount(() => group.value?.dispose())
function syncViewportWidth() {
  viewportWidth.value = window.visualViewport?.width || window.innerWidth
}
onMounted(() => {
  window.addEventListener('resize', syncViewportWidth)
  window.visualViewport?.addEventListener('resize', syncViewportWidth)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', syncViewportWidth)
  window.visualViewport?.removeEventListener('resize', syncViewportWidth)
})
defineExpose({ focus })

async function sendText() {
  if (props.inputSuspended || !text.value || sendingText.value) return
  sendingText.value = true
  try {
    const sent = text.value
    const result = await api.sendKeyboardText(sent, props.layout)
    text.value = ''
    onekvm.notifyKeyboardText(sent)
    show.value = false
    message.success(t('keyboard.textSent', 'Sent {count} characters').replace('{count}', String(result.characters)))
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  } finally {
    sendingText.value = false
  }
}

watch(() => props.layout, (layout) => {
  text.value = filterKeyboardText(text.value, layout).value
})
</script>

<template>
  <Teleport :to="overlayTo">
    <Transition name="win11-window" appear>
      <ToolWindow
        v-if="show && group"
        v-show="visible"
        class="keyboard-text-window"
        presentation="window"
        :width="windowWidth"
        :height="360"
        :title="t('keyboard.paste', 'Send text')"
        :layer="group.layer.value"
        :active="group.active.value"
        :sequence="sequence"
        :state="state"
        @focus="activate"
        @update:state="setState"
        @close="close"
      >
        <template #title-icon><TextCursorInput :size="18" /></template>
        <div class="keyboard-text-window-content">
          <p class="keyboard-text-window-hint">
            {{ t('keyboard.tips', 'Only characters available on the selected remote keyboard layout can be sent.') }}
            <strong>{{ layoutLabel(layout) }}</strong>
          </p>
          <n-input
            ref="textInput"
            :value="text"
            :disabled="sendingText"
            type="textarea"
            :maxlength="1024"
            show-count
            :autosize="{ minRows: 5, maxRows: 10 }"
            :placeholder="t('keyboard.placeholder', 'Text to type on the remote host')"
            @update:value="updateText"
            @keydown.ctrl.enter.prevent="sendText"
          />
          <div class="keyboard-text-window-actions">
            <n-button :disabled="sendingText" @click="close">
              {{ t('common.cancel', 'Cancel') }}
            </n-button>
            <n-button type="primary" :loading="sendingText" :disabled="inputSuspended || !text" @click="sendText">
              {{ t('keyboard.submit', 'Send') }}
            </n-button>
          </div>
        </div>
      </ToolWindow>
    </Transition>
  </Teleport>
</template>
