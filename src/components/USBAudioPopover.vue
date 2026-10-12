<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'
import { useMessage } from 'naive-ui'

import { api, type ConfigSchema, type OneKVMStatus } from '@/api/client'
import { t } from '@/i18n/runtime'
import { microphoneAccessErrorKind } from '@/lib/microphone-access'
import { onekvm } from '@/lib/onekvm'
import ControlOverlay from './ControlOverlay.vue'

const props = defineProps<{
  status: OneKVMStatus | null
  placement?: 'top-end' | 'bottom-end' | 'right-start' | 'left-start'
  sheet?: boolean
}>()

const emit = defineEmits<{
  'update:show': [show: boolean]
}>()

const message = useMessage()
const popoverOpen = shallowRef(false)
const saving = shallowRef<'microphone' | null>(null)
const schema = shallowRef<ConfigSchema | null>(null)
const speakerVolume = shallowRef(Math.round(onekvm.speakerGain() * 100))
const microphoneVolume = shallowRef(Math.round(onekvm.microphoneGain() * 100))
const speakerOn = shallowRef(onekvm.speakerEnabled())
const microphoneOverride = shallowRef<boolean | null>(null)
const audioError = shallowRef('')
const unsubscribe = onekvm.subscribe(state => { audioError.value = state.audioError })
onBeforeUnmount(unsubscribe)

const audioAvailable = computed(() => schema.value?.capabilities?.audio === true)
const microphoneAvailable = computed(() => Boolean(props.status?.audio.microphone_available))
const microphoneOn = computed(() => microphoneOverride.value
  ?? Boolean(props.status?.audio.microphone && onekvm.microphoneGranted()))
const microphoneBusy = computed(() => {
  const owner = props.status?.audio.microphone_session
  return Boolean(owner && owner !== onekvm.audioSessionID())
})

watch(popoverOpen, (open) => {
  if (open) onekvm.unlockAudio()
  if (open && !schema.value) void loadSchema()
})

watch(() => [props.status?.audio.microphone, props.status?.audio.microphone_session] as const, () => {
  const active = Boolean(props.status?.audio.microphone && onekvm.microphoneGranted())
  if (microphoneOverride.value === active) microphoneOverride.value = null
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

function requestSpeaker(value: boolean) {
  if (value === speakerOn.value || saving.value !== null) return
  speakerOn.value = value
  onekvm.setSpeakerEnabled(value)
}

function requestMicrophone(value: boolean) {
  if (value === microphoneOn.value || saving.value !== null) return
  if (value && microphoneBusy.value) {
    message.warning(t('usbAudio.microphoneBusy', 'Another session already owns the USB microphone.'))
    return
  }
  void applyMicrophone(value)
}

async function applyMicrophone(value: boolean) {
  saving.value = 'microphone'
  if (!value) microphoneOverride.value = false
  try {
    const granted = await onekvm.setMicrophone(value, {
      enableUSB: value && !microphoneAvailable.value,
    })
    if (value && !granted) {
      microphoneOverride.value = null
      message.warning(t('usbAudio.microphoneBusy', 'Another session already owns the USB microphone.'))
      return
    }
    microphoneOverride.value = value
  } catch (error) {
    microphoneOverride.value = null
    const kind = microphoneAccessErrorKind(error)
    if (kind === 'permission') {
      message.warning(t('usbAudio.microphonePermissionDenied', 'Microphone access was not granted. Allow it in your browser and try again.'))
    } else if (kind === 'unavailable') {
      message.warning(t('usbAudio.microphoneUnavailable', 'No microphone is available to this browser.'))
    } else {
      message.error(error instanceof Error ? error.message : String(error))
    }
  } finally {
    saving.value = null
  }
}
</script>

<template>
  <ControlOverlay
    v-if="audioAvailable"
    :show="popoverOpen"
    :sheet="sheet"
    :placement="placement"
    popover-class="control-popover display-status-control-popover"
    to=".console-workspace"
    @update:show="updateShow"
  >
    <slot />
    <template #title>{{ t('usbAudio.title', 'Audio') }}</template>
    <template #panel>
    <div class="display-status-popover">
      <header class="control-popover-header">
        <strong>{{ t('usbAudio.title', 'Audio') }}</strong>
      </header>
      <div class="display-status-values">
        <div>
          <span>{{ t('usbAudio.speaker', 'Speaker') }}</span>
          <n-switch
            size="small"
            :value="speakerOn"
            :disabled="saving !== null"
            :aria-label="t('usbAudio.speaker', 'Speaker')"
            @update:value="requestSpeaker"
          />
        </div>
        <div>
          <span>{{ t('usbAudio.volume', 'Volume') }}</span>
          <!-- Mount tooltips outside the scrollable panel, including in fullscreen. -->
          <n-slider
            class="usb-audio-slider"
            :to="true"
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
          <n-switch
            size="small"
            :value="microphoneOn"
            :loading="saving === 'microphone'"
            :disabled="saving !== null || microphoneBusy"
            :aria-label="t('usbAudio.microphone', 'Microphone')"
            @update:value="requestMicrophone"
          />
        </div>
        <div>
          <span>{{ t('usbAudio.microphoneVolume', 'Microphone volume') }}</span>
          <n-slider
            class="usb-audio-slider"
            :to="true"
            :value="microphoneVolume"
            :min="0"
            :max="100"
            :step="1"
            :disabled="!microphoneOn || saving !== null"
            :aria-label="t('usbAudio.microphoneVolume', 'Microphone volume')"
            placement="bottom"
            @update:value="updateMicrophoneVolume"
          />
        </div>
      </div>
      <p class="usb-audio-hint">
        {{ microphoneBusy
          ? t('usbAudio.microphoneBusy', 'Another session already owns the USB microphone.')
          : t('usbAudio.hint', 'Speaker lets you hear the target. Turning on Microphone asks for browser permission first and is exclusive to this session.') }}
      </p>
      <p v-if="audioError" class="usb-audio-hint" role="status">{{ audioError === 'latency-recovery' ? t('usbAudio.latencyRecovery', 'Audio latency increased. Restoring live playback…') : t('usbAudio.connectionFailed', 'Audio connection lost. Reconnecting…') }}</p>
    </div>
    </template>
  </ControlOverlay>
</template>
