<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import { useMessage } from 'naive-ui'

import { api, type ConfigSchema, type OneKVMStatus } from '@/api/client'
import { useAudioSettings, type AudioFormat, type AudioQuality } from '@/composables/useAudioSettings'
import { useOverlayMount } from '@/composables/useOverlayMount'
import { t } from '@/i18n/runtime'
import { microphoneAccessErrorKind } from '@/lib/microphone-access'
import { onekvm } from '@/lib/onekvm'
import { DISMISS_CONTROL_OVERLAY_EVENT } from '@/lib/overlay-target'
import ControlOverlay from './ControlOverlay.vue'

const props = defineProps<{
  status: OneKVMStatus | null
  placement?: 'top-end' | 'bottom-end' | 'right-start' | 'left-start'
  sheet?: boolean
}>()

const emit = defineEmits<{
  'update:show': [show: boolean]
  session: [state: { speaker: boolean; microphone: boolean }]
}>()

const message = useMessage()
const overlayTo = useOverlayMount()
const popoverOpen = shallowRef(false)
const formatMenuOpen = shallowRef(false)
const qualityMenuOpen = shallowRef(false)
const saving = shallowRef<'microphone' | 'format' | 'quality' | null>(null)
const schema = shallowRef<ConfigSchema | null>(null)
const speakerVolume = shallowRef(Math.round(onekvm.speakerGain() * 100))
const microphoneVolume = shallowRef(Math.round(onekvm.microphoneGain() * 100))
const speakerOn = shallowRef(onekvm.speakerEnabled())
const microphoneOverride = shallowRef<boolean | null>(null)
const qualityOverride = shallowRef<AudioQuality | null>(null)
const { format: audioFormat, quality: audioQuality, formatOptions, qualityOptions, formatHint, qualityForFormat } = useAudioSettings(() => qualityOverride.value ?? props.status?.audio.quality)
const audioError = shallowRef('')
const unsubscribe = onekvm.subscribe(state => { audioError.value = state.audioError })
onBeforeUnmount(unsubscribe)

const speakerAvailable = computed(() => Boolean(props.status?.audio.enabled))
const microphoneAvailable = computed(() => Boolean(props.status?.audio.microphone_available))
const audioAvailable = computed(() => schema.value?.capabilities?.audio === true
  && (speakerAvailable.value || microphoneAvailable.value))
const microphoneOn = computed(() => microphoneOverride.value
  ?? Boolean(props.status?.audio.microphone && onekvm.microphoneGranted()))
const microphoneBusy = computed(() => {
  const owner = props.status?.audio.microphone_session
  return Boolean(owner && owner !== onekvm.audioSessionID())
})
const audioHint = computed(() => {
  if (microphoneBusy.value) return t('usbAudio.microphoneBusy', 'Another session already owns the microphone.')
  if (!microphoneAvailable.value) return t('usbAudio.speakerHint', 'Hear the controlled device. Volume changes apply only to this browser.')
  if (!speakerAvailable.value) return t('usbAudio.microphoneHint', 'Send microphone audio to the controlled device. Browser permission is required, and only one session can use it at a time.')
  return t('usbAudio.hint', 'Hear the controlled device or send microphone audio to it. Microphone access requires browser permission and is limited to one session at a time.')
})
watch(() => props.status?.audio.quality, (quality) => {
  if (!quality) return
  if (qualityOverride.value === quality) qualityOverride.value = null
  if (qualityOverride.value === null) void onekvm.setAudioQuality(quality)
}, { immediate: true })

watch(() => ({
  speaker: speakerAvailable.value && speakerOn.value,
  microphone: microphoneAvailable.value && microphoneOn.value,
}), (state) => emit('session', state), { immediate: true })

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
  if (!open && (formatMenuOpen.value || qualityMenuOpen.value)) return
  popoverOpen.value = open
  emit('update:show', open)
}

function forceClose() {
  formatMenuOpen.value = false
  qualityMenuOpen.value = false
  updateShow(false)
}

onMounted(() => window.addEventListener(DISMISS_CONTROL_OVERLAY_EVENT, forceClose))
onBeforeUnmount(() => window.removeEventListener(DISMISS_CONTROL_OVERLAY_EVENT, forceClose))

function updateSpeakerVolume(value: number) {
  speakerVolume.value = value
  onekvm.setSpeakerGain(value / 100)
}

function updateMicrophoneVolume(value: number) {
  microphoneVolume.value = value
  onekvm.setMicrophoneGain(value / 100)
}

function requestSpeaker(value: boolean) {
  if (!speakerAvailable.value || value === speakerOn.value || saving.value !== null) return
  speakerOn.value = value
  onekvm.setSpeakerEnabled(value)
}

async function requestFormat(value: AudioFormat) {
  if (value === audioFormat.value || saving.value !== null) return
  await applyQuality(qualityForFormat(value), 'format')
}

async function requestQuality(value: AudioQuality) {
  if (audioFormat.value === 'pcm' || value === 'pcm' || value === audioQuality.value || saving.value !== null) return
  await applyQuality(value, 'quality')
}

async function applyQuality(quality: AudioQuality, field: 'format' | 'quality') {
  saving.value = field
  try {
    await api.patchConfig('audio.quality', quality)
    qualityOverride.value = props.status?.audio.quality === quality ? null : quality
    await onekvm.setAudioQuality(quality)
  } catch (error) {
    qualityOverride.value = null
    message.error(error instanceof Error ? error.message : String(error))
  } finally {
    saving.value = null
  }
}

function requestMicrophone(value: boolean) {
  if (value && !microphoneAvailable.value) return
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
    const granted = await onekvm.setMicrophone(value)
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
        <div class="usb-audio-format">
          <span>{{ t('usbAudio.format', 'Transmission format') }}</span>
          <n-select
            :value="audioFormat"
            :options="formatOptions"
            :size="sheet ? 'medium' : 'tiny'"
            :menu-size="sheet ? 'medium' : 'tiny'"
            :loading="saving === 'format'"
            :disabled="saving !== null || !status"
            :to="overlayTo"
            :menu-props="{ class: 'display-fit-select-menu' }"
            :aria-label="t('usbAudio.format', 'Transmission format')"
            @update:value="requestFormat"
            @update:show="formatMenuOpen = $event"
          />
        </div>
        <div class="usb-audio-format">
          <span>{{ t('settings.advancedSettings.audioPage.quality', 'Audio quality') }}</span>
          <n-select
            :value="audioQuality"
            :options="qualityOptions"
            :size="sheet ? 'medium' : 'tiny'"
            :menu-size="sheet ? 'medium' : 'tiny'"
            :loading="saving === 'quality'"
            :disabled="saving !== null || !status || audioFormat === 'pcm'"
            :to="overlayTo"
            :menu-props="{ class: 'display-fit-select-menu' }"
            :aria-label="t('settings.advancedSettings.audioPage.quality', 'Audio quality')"
            @update:value="requestQuality"
            @update:show="qualityMenuOpen = $event"
          />
        </div>
        <div v-if="speakerAvailable">
          <span>{{ t('usbAudio.speaker', 'Speaker') }}</span>
          <n-switch
            size="small"
            :value="speakerOn"
            :disabled="saving !== null"
            :aria-label="t('usbAudio.speaker', 'Speaker')"
            @update:value="requestSpeaker"
          />
        </div>
        <div v-if="speakerAvailable" class="usb-audio-volume">
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
            :aria-label="t('usbAudio.volume', 'Volume')"
            @update:value="updateSpeakerVolume"
          />
        </div>
        <div v-if="microphoneAvailable">
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
        <div v-if="microphoneAvailable" class="usb-audio-volume">
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
      <p class="usb-audio-hint">{{ formatHint }}</p>
      <p class="usb-audio-hint">{{ audioHint }}</p>
      <p v-if="audioError" class="usb-audio-hint" role="status">{{ audioError === 'latency-recovery' ? t('usbAudio.latencyRecovery', 'Audio latency increased. Restoring live playback…') : t('usbAudio.connectionFailed', 'Audio connection lost. Reconnecting…') }}</p>
    </div>
    </template>
  </ControlOverlay>
</template>
