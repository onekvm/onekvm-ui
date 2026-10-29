<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useMessage, type InputInst } from 'naive-ui'

import { api, type KeyboardLayout } from '@/api/client'
import { onekvm } from '@/lib/onekvm'
import { t } from '@/i18n/runtime'
import { filterKeyboardText } from '@/input/keyboard-text'
import { useOverlayMount } from '@/composables/useOverlayMount'

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

watch(show, async (open) => {
  if (!open) return
  await nextTick()
  textInput.value?.focus()
})

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
  <n-modal
    v-model:show="show"
    :to="overlayTo"
    preset="card"
    class="keyboard-text-modal"
    :title="t('keyboard.paste', 'Send text')"
    :mask-closable="!sendingText"
    :close-on-esc="!sendingText"
    @after-leave="resumeConsole"
  >
    <div class="keyboard-text-modal-content">
      <p class="keyboard-text-modal-hint">
        {{ t('keyboard.tips', 'Only characters available on the selected remote keyboard layout can be sent.') }}
        <strong>{{ layoutLabel(layout) }}</strong>
      </p>
      <n-input
        ref="textInput"
        :value="text"
        type="textarea"
        :maxlength="1024"
        show-count
        :autosize="{ minRows: 5, maxRows: 10 }"
        :placeholder="t('keyboard.placeholder', 'Text to type on the remote host')"
        @update:value="updateText"
        @keydown.ctrl.enter.prevent="sendText"
      />
      <div class="keyboard-text-modal-actions">
        <n-button :disabled="sendingText" @click="show = false">
          {{ t('common.cancel', 'Cancel') }}
        </n-button>
        <n-button type="primary" :loading="sendingText" :disabled="inputSuspended || !text" @click="sendText">
          {{ t('keyboard.submit', 'Send') }}
        </n-button>
      </div>
    </div>
  </n-modal>
</template>
