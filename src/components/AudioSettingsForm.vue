<script setup lang="ts">
import { computed, watch } from 'vue'

import type { OneKVMConfig } from '@/api/client'
import { t } from '@/i18n/runtime'

const props = defineProps<{ disabled?: boolean; showEnable?: boolean }>()
const emit = defineEmits<{ validity: [valid: boolean] }>()
const audio = defineModel<OneKVMConfig['audio']>({ required: true })

watch(() => audio.value, (value) => {
  if (!value) return
  if (!value.quality) value.quality = 'medium'
  if (value.channels !== 'mono' && value.channels !== 'stereo') value.channels = 'stereo'
  if (!value.product_name) value.product_name = 'OneKVM Audio'
}, { immediate: true })

const enabled = computed({
  get: () => Boolean(audio.value.enabled),
  set: (value: boolean) => { audio.value.enabled = value },
})

const usbStringValid = (value: string) =>
  value.length > 0 && new TextEncoder().encode(value).length <= 126 && !/[\u0000-\u001f\u007f]/.test(value)

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

const channelOptions = computed(() => [
  { label: t('settings.advancedSettings.audioPage.mono', 'Mono'), value: 'mono' },
  { label: t('settings.advancedSettings.audioPage.stereo', 'Stereo'), value: 'stereo' },
])
</script>

<template>
  <div class="audio-settings">
    <n-alert v-if="props.showEnable !== false" type="info" :bordered="false">
      {{ t('settings.advancedSettings.audioPage.restartHint', 'Turning USB audio on or changing channels makes the controlled device rediscover this USB gadget. The keyboard and mouse disconnect briefly.') }}
    </n-alert>

    <section class="audio-settings-card">
      <header>
        <h2>{{ t('settings.advancedSettings.audioPage.title', 'USB audio') }}</h2>
        <p>{{ t('settings.advancedSettings.audioPage.hint', 'Presents a USB speaker to the target PC. The console Audio control appears after this is enabled.') }}</p>
      </header>
      <n-form label-placement="top" :show-feedback="false" class="audio-settings-grid">
        <n-form-item v-if="props.showEnable !== false" :label="t('settings.advancedSettings.audioPage.enable', 'Enable USB audio')">
          <n-switch v-model:value="enabled" :disabled="props.disabled" />
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
