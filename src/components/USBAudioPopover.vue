<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDialog, useMessage } from 'naive-ui'

import { api, type ConfigSchema, type OneKVMStatus } from '@/api/client'
import { t } from '@/i18n/runtime'
import { onekvm } from '@/lib/onekvm'

const props = defineProps<{
  status: OneKVMStatus | null
  placement?: 'top-end' | 'bottom-end' | 'right-start' | 'left-start'
}>()

const emit = defineEmits<{
  'update:show': [show: boolean]
}>()

const dialog = useDialog()
const message = useMessage()
const popoverOpen = ref(false)
const saving = ref(false)
const schema = ref<ConfigSchema | null>(null)

const audioAvailable = computed(() => schema.value?.capabilities?.audio === true)
const speakerOn = computed(() => Boolean(props.status?.audio.enabled))
const microphoneOn = computed(() => Boolean(props.status?.audio.microphone && onekvm.microphoneGranted()))
const microphoneBusy = computed(() => {
  const owner = props.status?.audio.microphone_session
  return Boolean(owner && owner !== onekvm.sessionID())
})

watch(popoverOpen, (open) => {
  if (open) onekvm.unlockAudio()
  if (open && !schema.value) void loadSchema()
})

void loadSchema()

async function loadSchema() {
  try {
    schema.value = await api.getConfigSchema()
  } catch {
    schema.value = null
  }
}

function updateShow(open: boolean) {
  popoverOpen.value = open
  emit('update:show', open)
}

function confirmGadgetChange(title: string, content: string, apply: () => Promise<void>) {
  dialog.warning({
    title,
    content,
    positiveText: t('usbAudio.confirm', 'Continue'),
    negativeText: t('common.cancel', 'Cancel'),
    onPositiveClick: () => apply(),
  })
}

function requestSpeaker(value: boolean) {
  if (value === speakerOn.value || saving.value) return
  if (!value) {
    void applySpeaker(false)
    return
  }
  confirmGadgetChange(
    t('usbAudio.speaker', 'Speaker'),
    t('usbAudio.speakerConfirm', 'The target PC will get a USB speaker. Keyboard and mouse will disconnect briefly.'),
    () => applySpeaker(true),
  )
}

function requestMicrophone(value: boolean) {
  if (value === microphoneOn.value || saving.value) return
  if (value && microphoneBusy.value) {
    message.warning(t('usbAudio.microphoneBusy', 'Another session already owns the USB microphone.'))
    return
  }
  if (!value) {
    void applyMicrophone(false)
    return
  }
  confirmGadgetChange(
    t('usbAudio.microphone', 'Microphone'),
    t('usbAudio.microphoneConfirm', 'This session will exclusively use the USB microphone. Keyboard and mouse may disconnect briefly.'),
    () => applyMicrophone(true),
  )
}

async function applySpeaker(value: boolean) {
  saving.value = true
  try {
    if (value) {
      onekvm.unlockAudio()
      await api.patchConfig('audio.device', 'hw:UAC1Gadget,0')
      await api.patchConfig('audio.encoder', 'opus')
    }
    await api.patchConfig('audio.enabled', String(value))
    await onekvm.reconnect()
    if (value) onekvm.unlockAudio()
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  } finally {
    saving.value = false
  }
}

async function applyMicrophone(value: boolean) {
  saving.value = true
  try {
    if (value) {
      await api.patchConfig('audio.device', 'hw:UAC1Gadget,0')
      await api.patchConfig('audio.encoder', 'opus')
    }
    await onekvm.setMicrophone(value)
    if (value && !onekvm.microphoneGranted()) {
      message.warning(t('usbAudio.microphoneBusy', 'Another session already owns the USB microphone.'))
    }
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <n-popover
    v-if="audioAvailable"
    :show="popoverOpen"
    trigger="click"
    :placement="placement || 'bottom-end'"
    :show-arrow="false"
    class="control-popover display-status-control-popover"
    to=".console-workspace"
    @update:show="updateShow"
  >
    <template #trigger><slot /></template>
    <div class="display-status-popover">
      <header class="control-popover-header">
        <strong>{{ t('usbAudio.title', 'USB audio') }}</strong>
      </header>
      <div class="display-status-values">
        <div>
          <span>{{ t('usbAudio.speaker', 'Speaker') }}</span>
          <n-switch size="small" :value="speakerOn" :disabled="saving" @update:value="requestSpeaker" />
        </div>
        <div>
          <span>{{ t('usbAudio.microphone', 'Microphone') }}</span>
          <n-switch
            size="small"
            :value="microphoneOn"
            :disabled="saving || microphoneBusy"
            @update:value="requestMicrophone"
          />
        </div>
      </div>
      <p class="usb-audio-hint">
        {{ microphoneBusy
          ? t('usbAudio.microphoneBusy', 'Another session already owns the USB microphone.')
          : t('usbAudio.hint', 'Speaker lets you hear the target. Microphone is exclusive to this session.') }}
      </p>
    </div>
  </n-popover>
</template>
