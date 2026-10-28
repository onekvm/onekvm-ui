<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'

import type { OneKVMConfig } from '@/api/client'
import { useAudioSettings, type AudioFormat, type AudioQuality } from '@/composables/useAudioSettings'
import { useAudioInputs } from '@/composables/useAudioInputs'
import type { AudioInputSource } from '@/lib/audio-settings'
import { usbFunctionsFit, type USBGadget } from '@/lib/usb-capacity'
import { t } from '@/i18n/runtime'
import USBAudioDeviceSettings from './USBAudioDeviceSettings.vue'
import AudioInputSelect from './AudioInputSelect.vue'

const props = defineProps<{
  disabled?: boolean
  usb: OneKVMConfig['usb']
  gadget?: USBGadget
  sources?: readonly AudioInputSource[]
}>()
const emit = defineEmits<{ validity: [valid: boolean] }>()
const audio = defineModel<OneKVMConfig['audio']>({ required: true })

watch(() => audio.value, (value) => {
  if (!value) return
  if (!value.quality) value.quality = 'medium'
  if (value.channels !== 'mono' && value.channels !== 'stereo') value.channels = 'stereo'
  if (!value.product_name) value.product_name = 'OneKVM Audio'
  if (!value.source) value.source = 'usb'
}, { immediate: true })

const channels = computed({
  get: () => audio.value.channels || 'stereo',
  set: (value: 'mono' | 'stereo') => { audio.value.channels = value },
})
const { format, quality, formatOptions, qualityOptions, formatHint, qualityForFormat } = useAudioSettings(() => audio.value.quality)

function updateFormat(value: AudioFormat) {
  audio.value.quality = qualityForFormat(value)
}

function updateQuality(value: AudioQuality) {
  if (format.value === 'opus' && value !== 'pcm') audio.value.quality = value
}
const source = computed({
  get: () => audio.value.source || 'usb',
  set: (value: AudioInputSource) => { audio.value.source = value },
})
const { sourceOptions: availableSources, sourceSelectionDisabled } = useAudioInputs(() => props.sources, () => source.value)
const sourceOptions = computed(() => availableSources.value.map(option => ({
  ...option,
  disabled: option.disabled || (option.value === 'usb' && audio.value.enabled && source.value !== 'usb'
    && !usbFunctionsFit(props.usb, audio.value, props.gadget, { audio: true })),
})))
const usbAudioValid = shallowRef(true)
watch(usbAudioValid, (value) => emit('validity', value), { immediate: true })

const channelOptions = computed(() => [
  { label: t('settings.advancedSettings.audioPage.mono', 'Mono'), value: 'mono' },
  { label: t('settings.advancedSettings.audioPage.stereo', 'Stereo'), value: 'stereo' },
])
</script>

<template>
  <div class="audio-settings">
    <section class="audio-settings-card">
      <header>
        <h2>{{ t('settings.advancedSettings.audioPage.title', 'Audio') }}</h2>
        <p>{{ t('settings.advancedSettings.audioPage.hint', 'All inputs share these settings. Switching the input keeps the format, quality and channels.') }}</p>
      </header>
      <n-form label-placement="top" :show-feedback="false" class="audio-settings-grid">
        <n-form-item :label="t('usbAudio.source', 'Input source')">
          <AudioInputSelect v-model="source" :options="sourceOptions" :disabled="props.disabled" :unavailable="sourceSelectionDisabled" />
        </n-form-item>
        <n-form-item :label="t('usbAudio.format', 'Transmission format')">
          <div class="audio-quality-field">
            <n-select :value="format" :options="formatOptions" :disabled="props.disabled" @update:value="updateFormat" />
            <p>{{ formatHint }}</p>
          </div>
        </n-form-item>
        <n-form-item :label="t('settings.advancedSettings.audioPage.quality', 'Audio quality')">
          <n-select :value="quality" :options="qualityOptions" :disabled="props.disabled || format === 'pcm'" @update:value="updateQuality" />
        </n-form-item>
        <n-form-item :label="t('settings.advancedSettings.audioPage.channels', 'Channels')">
          <n-select v-model:value="channels" :options="channelOptions" :disabled="props.disabled" />
        </n-form-item>
      </n-form>
    </section>

    <USBAudioDeviceSettings
      v-model="audio"
      :usb="props.usb"
      :gadget="props.gadget"
      :disabled="props.disabled"
      @validity="usbAudioValid = $event"
    />
  </div>
</template>

<style scoped>
.audio-settings { display: grid; gap: 18px; }
.audio-settings-card { display: grid; gap: 16px; padding: 16px; border: 1px solid var(--border); border-radius: 7px; background: var(--card); }
.audio-settings-card header h2 { margin: 0; font-size: 14px; }
.audio-settings-card header p { margin: 5px 0 0; color: var(--muted-foreground); font-size: 11px; line-height: 1.5; }
.audio-settings-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; }
.audio-settings-grid :deep(.n-form-item) { margin-bottom: 0; }
.audio-quality-field { display: grid; gap: 6px; width: 100%; min-width: 0; }
.audio-quality-field p { margin: 0; color: var(--muted-foreground); font-size: 11px; line-height: 1.5; }
</style>
