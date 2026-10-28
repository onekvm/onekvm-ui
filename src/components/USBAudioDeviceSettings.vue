<script setup lang="ts">
import { computed, watch } from 'vue'

import type { OneKVMConfig } from '@/api/client'
import { usbFunctionsFit, usbSpeakerEnabled, type USBGadget } from '@/lib/usb-capacity'
import { t } from '@/i18n/runtime'
import USBCapacityBadge from './USBCapacityBadge.vue'

const props = defineProps<{
  disabled?: boolean
  usb: OneKVMConfig['usb']
  gadget?: USBGadget
}>()
const emit = defineEmits<{ validity: [valid: boolean] }>()
const audio = defineModel<OneKVMConfig['audio']>({ required: true })
const enabled = computed({
  get: () => Boolean(audio.value.enabled),
  set: (value: boolean) => { audio.value = { ...audio.value, enabled: value } },
})
const microphone = computed({
  get: () => Boolean(audio.value.microphone),
  set: (value: boolean) => { audio.value = { ...audio.value, microphone: value } },
})
const productName = computed({
  get: () => audio.value.product_name ?? 'OneKVM Audio',
  set: (value: string) => { audio.value = { ...audio.value, product_name: value } },
})
const source = computed(() => audio.value.source || 'usb')
const usbStringValid = (value: string) =>
  value.length > 0 && new TextEncoder().encode(value).length <= 126 && !/[\u0000-\u001f\u007f]/.test(value)
const enabledBlocked = computed(() => !enabled.value && source.value === 'usb'
  && !usbFunctionsFit(props.usb, audio.value, props.gadget, { audio: true }))
const microphoneBlocked = computed(() => !microphone.value
  && !usbFunctionsFit(props.usb, audio.value, props.gadget, { microphone: true }))
const usbAudioActive = computed(() => usbSpeakerEnabled(audio.value) || microphone.value)
const valid = computed(() => (!usbAudioActive.value || usbStringValid(productName.value))
  && usbFunctionsFit(props.usb, audio.value, props.gadget))
watch(valid, (value) => emit('validity', value), { immediate: true })
</script>

<template>
  <section class="audio-settings-card">
    <header>
      <h2>{{ t('settings.advancedSettings.audioPage.usbTitle', 'USB audio device') }}</h2>
      <p>{{ t('settings.advancedSettings.audioPage.usbHint', 'USB input makes OneKVM a speaker on the controlled device. Microphone forwarding is independent of the selected input.') }}</p>
    </header>
    <n-alert type="info" :bordered="false">
      {{ t('settings.advancedSettings.audioPage.restartHint', 'Changing USB audio functions, channels or the USB device name briefly reconnects the keyboard and mouse.') }}
    </n-alert>
    <n-form label-placement="top" :show-feedback="false" class="audio-settings-grid">
      <n-form-item :label="t('settings.advancedSettings.audioPage.enable', 'USB speaker')">
        <div class="audio-enable-field">
          <n-tooltip :disabled="!enabledBlocked">
            <template #trigger><span><n-switch v-model:value="enabled" :disabled="props.disabled || enabledBlocked" :aria-label="t('settings.advancedSettings.audioPage.enable', 'USB speaker')" /></span></template>
            {{ t('settings.advancedSettings.usbPage.audioBlocked', 'Not enough USB capacity. Turn off the microphone, virtual storage, or file transfer first.') }}
          </n-tooltip>
          <USBCapacityBadge v-if="source === 'usb'" :endpoints="{ inn: 0, out: 1 }" />
        </div>
      </n-form-item>
      <n-form-item :label="t('settings.advancedSettings.usbPage.microphone', 'USB microphone')">
        <div class="audio-enable-field">
          <n-tooltip :disabled="!microphoneBlocked">
            <template #trigger><span><n-switch v-model:value="microphone" :disabled="props.disabled || microphoneBlocked" :aria-label="t('settings.advancedSettings.usbPage.microphone', 'USB microphone')" /></span></template>
            {{ t('settings.advancedSettings.usbPage.microphoneBlocked', 'Not enough USB capacity. Turn off the speaker, virtual storage, or file transfer first.') }}
          </n-tooltip>
          <USBCapacityBadge :endpoints="{ inn: 1, out: 0 }" />
        </div>
      </n-form-item>
      <n-form-item :label="t('settings.advancedSettings.audioPage.productName', 'Name shown to the controlled device')">
        <div class="audio-quality-field">
          <n-input
            v-model:value="productName"
            :disabled="props.disabled"
            maxlength="126"
            :status="!usbAudioActive || usbStringValid(productName) ? undefined : 'error'"
          />
          <p>{{ t('settings.advancedSettings.audioPage.productNameHint', 'A name for the USB audio device in the controlled device’s sound settings. The operating system determines how it is displayed.') }}</p>
        </div>
      </n-form-item>
    </n-form>
  </section>
</template>

<style scoped>
.audio-settings-card { display: grid; gap: 16px; padding: 16px; border: 1px solid var(--border); border-radius: 7px; background: var(--card); }
.audio-settings-card header h2 { margin: 0; font-size: 14px; }
.audio-settings-card header p { margin: 5px 0 0; color: var(--muted-foreground); font-size: 11px; line-height: 1.5; }
.audio-settings-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; }
.audio-settings-grid :deep(.n-form-item) { margin-bottom: 0; }
.audio-quality-field { display: grid; gap: 6px; width: 100%; min-width: 0; }
.audio-quality-field p { margin: 0; color: var(--muted-foreground); font-size: 11px; line-height: 1.5; }
.audio-enable-field { display: flex; align-items: center; gap: 12px; }
</style>
