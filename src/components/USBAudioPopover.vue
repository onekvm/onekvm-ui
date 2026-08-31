<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
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
const speakerVolume = ref(Math.round(onekvm.speakerGain() * 100))
const microphoneVolume = ref(Math.round(onekvm.microphoneGain() * 100))
const microphoneLevel = ref(0)
let levelTimer = 0
const levelSamples = new Uint8Array(256)

const audioAvailable = computed(() => schema.value?.capabilities?.audio === true)
const speakerOn = computed(() => Boolean(props.status?.audio.enabled))
const microphoneAvailable = computed(() => Boolean(props.status?.audio.microphone_available))
const microphoneOn = computed(() => Boolean(props.status?.audio.microphone && onekvm.microphoneGranted()))
const microphoneBusy = computed(() => {
  const owner = props.status?.audio.microphone_session
  return Boolean(owner && owner !== onekvm.sessionID())
})

watch(popoverOpen, (open) => {
  if (open) onekvm.unlockAudio()
  if (open && !schema.value) void loadSchema()
  if (open) startLevelMeter()
  else stopLevelMeter()
})

watch(microphoneOn, (enabled) => {
  if (!enabled) microphoneLevel.value = 0
  if (popoverOpen.value) startLevelMeter()
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

function updateSpeakerVolume(value: number) {
  speakerVolume.value = value
  onekvm.setSpeakerGain(value / 100)
}

function updateMicrophoneVolume(value: number) {
  microphoneVolume.value = value
  onekvm.setMicrophoneGain(value / 100)
}

function startLevelMeter() {
  stopLevelMeter()
  if (!popoverOpen.value) return
  const tick = () => {
    const analyser = onekvm.microphoneAnalyser()
    if (!analyser) {
      microphoneLevel.value = 0
      levelTimer = window.setTimeout(tick, 80)
      return
    }
    analyser.getByteTimeDomainData(levelSamples)
    let sum = 0
    for (const sample of levelSamples) {
      const centered = (sample - 128) / 128
      sum += centered * centered
    }
    microphoneLevel.value = Math.min(1, Math.sqrt(sum / levelSamples.length) * 3.2)
    levelTimer = window.setTimeout(tick, 80)
  }
  tick()
}

function stopLevelMeter() {
  window.clearTimeout(levelTimer)
  levelTimer = 0
}

function playMicTest() {
  if (!onekvm.playMicrophoneTestTone()) {
    message.warning(t('usbAudio.micTestFailed', 'Turn on the microphone first.'))
  }
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
  if (value && !microphoneAvailable.value) {
    message.warning(t('usbAudio.microphoneDisabled', 'Turn on USB microphone in USB settings first.'))
    return
  }
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
    if (value) onekvm.unlockAudio()
    await api.patchConfig('audio.enabled', String(value))
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

onBeforeUnmount(stopLevelMeter)
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
        <strong>{{ t('usbAudio.title', 'Audio') }}</strong>
      </header>
      <div class="display-status-values">
        <div>
          <span>{{ t('usbAudio.speaker', 'Speaker') }}</span>
          <n-switch size="small" :value="speakerOn" :disabled="saving" @update:value="requestSpeaker" />
        </div>
        <div>
          <span>{{ t('usbAudio.volume', 'Volume') }}</span>
          <n-slider
            class="usb-audio-slider"
            :value="speakerVolume"
            :min="0"
            :max="100"
            :step="1"
            :disabled="!speakerOn"
            @update:value="updateSpeakerVolume"
          />
        </div>
        <div>
          <span>{{ t('usbAudio.microphone', 'Microphone') }}</span>
          <n-tooltip :disabled="microphoneAvailable" placement="left">
            <template #trigger>
              <span class="usb-function-switch">
                <n-switch
                  size="small"
                  :value="microphoneOn"
                  :disabled="saving || microphoneBusy || !microphoneAvailable"
                  @update:value="requestMicrophone"
                />
              </span>
            </template>
            {{ t('usbAudio.microphoneDisabled', 'Turn on USB microphone in USB settings first.') }}
          </n-tooltip>
        </div>
      </div>
      <div class="usb-audio-debug">
        <div class="usb-audio-debug-title">{{ t('usbAudio.micDebug', 'Microphone debug') }}</div>
        <div class="display-status-values">
          <div>
            <span>{{ t('usbAudio.micVolume', 'Microphone volume') }}</span>
            <n-slider
              class="usb-audio-slider"
              :value="microphoneVolume"
              :min="0"
              :max="100"
              :step="1"
              :disabled="!microphoneOn"
              @update:value="updateMicrophoneVolume"
            />
          </div>
          <div>
            <span>{{ t('usbAudio.micLevel', 'Input level') }}</span>
            <span class="usb-audio-meter" aria-hidden="true">
              <span :style="{ width: `${Math.round(microphoneLevel * 100)}%` }" />
            </span>
          </div>
          <div>
            <span />
            <n-button size="tiny" :disabled="!microphoneOn || saving" @click="playMicTest">
              {{ t('usbAudio.micTest', 'Play test tone') }}
            </n-button>
          </div>
        </div>
      </div>
      <p class="usb-audio-hint">
        {{ !microphoneAvailable
          ? t('usbAudio.microphoneDisabled', 'Turn on USB microphone in USB settings first.')
          : microphoneBusy
            ? t('usbAudio.microphoneBusy', 'Another session already owns the USB microphone.')
            : t('usbAudio.hint', 'Speaker lets you hear the target. Microphone is exclusive to this session.') }}
      </p>
    </div>
  </n-popover>
</template>

<style scoped>
.usb-function-switch { display: inline-flex; align-items: center; }
</style>
