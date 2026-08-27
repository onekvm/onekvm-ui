<script setup lang="ts">
import { computed, watch } from 'vue'

import type { OneKVMConfig } from '@/api/client'
import { t } from '@/i18n/runtime'

const props = defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ validity: [valid: boolean] }>()
const audio = defineModel<OneKVMConfig['audio']>({ required: true })

watch(() => audio.value, (value) => {
  if (!value) return
  if (!value.quality) value.quality = 'medium'
  if (value.channels !== 'mono' && value.channels !== 'stereo') value.channels = 'stereo'
  if (!value.product_name) value.product_name = 'OneKVM Audio'
}, { immediate: true })

const usbStringValid = (value: string) =>
  value.length > 0 && new TextEncoder().encode(value).length <= 126 && !/[\u0000-\u001f\u007f]/.test(value)

const quality = computed({
  get: () => audio.value.quality || 'medium',
  set: (value: 'low' | 'medium' | 'high') => { audio.value.quality = value },
})
const channels = computed({
  get: () => audio.value.channels || 'stereo',
  set: (value: 'mono' | 'stereo') => { audio.value.channels = value },
})
const productName = computed({
  get: () => audio.value.product_name || 'OneKVM Audio',
  set: (value: string) => { audio.value.product_name = value },
})

const valid = computed(() => usbStringValid(productName.value))
watch(valid, (value) => emit('validity', value), { immediate: true })

const qualityOptions = computed(() => [
  { label: t('settings.advancedSettings.audioPage.qualityLow', 'Low (48 kbps)'), value: 'low' },
  { label: t('settings.advancedSettings.audioPage.qualityMedium', 'Medium (96 kbps)'), value: 'medium' },
  { label: t('settings.advancedSettings.audioPage.qualityHigh', 'High (160 kbps)'), value: 'high' },
])
const channelOptions = computed(() => [
  { label: t('settings.advancedSettings.audioPage.mono', 'Mono'), value: 'mono' },
  { label: t('settings.advancedSettings.audioPage.stereo', 'Stereo'), value: 'stereo' },
])
</script>

<template>
  <div class="audio-settings">
    <n-alert type="info" :bordered="false">
      {{ t('settings.advancedSettings.audioPage.restartHint', 'Changing channels re-enumerates USB. Keyboard and mouse disconnect briefly if the speaker is on. The browser preview is mixed down to mono. This UAC1 gadget supports mono and stereo; 5.1 needs a larger USB packet size in the kernel.') }}
    </n-alert>

    <section class="audio-settings-card">
      <header>
        <h2>{{ t('settings.advancedSettings.audioPage.title', 'Audio') }}</h2>
        <p>{{ t('settings.advancedSettings.audioPage.hint', 'These options apply to the speaker and microphone presented to the target PC.') }}</p>
      </header>
      <n-form label-placement="top" :show-feedback="false" class="audio-settings-grid">
        <n-form-item :label="t('settings.advancedSettings.audioPage.quality', 'Quality')">
          <n-select v-model:value="quality" :options="qualityOptions" :disabled="props.disabled" />
        </n-form-item>
        <n-form-item :label="t('settings.advancedSettings.audioPage.channels', 'Channels')">
          <n-select v-model:value="channels" :options="channelOptions" :disabled="props.disabled" />
        </n-form-item>
        <n-form-item :label="t('settings.advancedSettings.audioPage.productName', 'Device name')">
          <n-input
            v-model:value="productName"
            :disabled="props.disabled"
            maxlength="126"
            :status="usbStringValid(productName) ? undefined : 'error'"
          />
        </n-form-item>
      </n-form>
    </section>
  </div>
</template>

<style scoped>
.audio-settings { display: grid; gap: 16px; }
.audio-settings-card { display: grid; gap: 14px; padding: 16px; border: 1px solid #30363d; border-radius: 7px; background: #14191e; }
.audio-settings-card header h2 { margin: 0; font-size: 14px; }
.audio-settings-card header p { margin: 5px 0 0; color: #8f99a3; font-size: 11px; }
.audio-settings-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
</style>
