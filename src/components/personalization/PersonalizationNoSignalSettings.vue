<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '@/api/client'
import { serviceURL } from '@/api/service-url'
import { t } from '@/i18n/runtime'

const props = defineProps<{ disabled?: boolean }>()

const noSignalInput = ref<HTMLInputElement | null>(null)
const noSignalPreview = ref('')
const noSignalBusy = ref(false)
const noSignalError = ref('')
const noSignalMaxBytes = 8 * 1024 * 1024

function refreshNoSignalPreview() {
  const url = `${serviceURL('/api/personalization/no-signal')}?t=${Date.now()}`
  const probe = new Image()
  probe.onload = () => {
    noSignalPreview.value = url
  }
  probe.onerror = () => {
    noSignalPreview.value = ''
  }
  probe.src = url
}

function noSignalFileAllowed(file: File) {
  const name = file.name.toLowerCase()
  const typed = file.type === 'image/png' || file.type === 'image/jpeg'
  const named = name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg')
  return file.size > 0 && file.size <= noSignalMaxBytes && (typed || (file.type === '' && named))
}

async function chooseNoSignalImage(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || props.disabled) return
  if (!noSignalFileAllowed(file)) {
    noSignalError.value = t('settings.advancedSettings.personalizationPage.noSignalImageTypes', 'Use a PNG or JPEG image up to 8 MB.')
    return
  }
  noSignalBusy.value = true
  noSignalError.value = ''
  try {
    await api.uploadNoSignalImage(file)
    refreshNoSignalPreview()
  } catch {
    noSignalError.value = t('settings.advancedSettings.personalizationPage.noSignalImageFailed', 'Could not update the no-signal image.')
  } finally {
    noSignalBusy.value = false
  }
}

async function removeNoSignalImage() {
  if (props.disabled || noSignalBusy.value) return
  noSignalBusy.value = true
  noSignalError.value = ''
  try {
    await api.clearNoSignalImage()
    noSignalPreview.value = ''
  } catch {
    noSignalError.value = t('settings.advancedSettings.personalizationPage.noSignalImageFailed', 'Could not update the no-signal image.')
  } finally {
    noSignalBusy.value = false
  }
}

onMounted(refreshNoSignalPreview)
</script>

<template>
  <div class="personalization-tab-content">
    <section class="personalization-section">
      <header>
        <h2>{{ t('settings.advancedSettings.personalizationPage.noSignalImage', 'No-signal image') }}</h2>
        <p>{{ t('settings.advancedSettings.personalizationPage.noSignalImageHint', 'Shown when there is no HDMI signal. A custom image replaces the language artwork until you remove it.') }}</p>
      </header>
      <img v-if="noSignalPreview" class="no-signal-custom-preview" :src="noSignalPreview" alt="" />
      <div class="no-signal-custom-actions">
        <n-button secondary size="small" :disabled="disabled || noSignalBusy" :loading="noSignalBusy" @click="noSignalInput?.click()">
          {{ t('settings.advancedSettings.personalizationPage.chooseNoSignalImage', 'Choose image') }}
        </n-button>
        <n-button v-if="noSignalPreview" secondary size="small" :disabled="disabled || noSignalBusy" @click="removeNoSignalImage">
          {{ t('settings.advancedSettings.personalizationPage.removeNoSignalImage', 'Remove image') }}
        </n-button>
      </div>
      <p class="no-signal-custom-note">{{ t('settings.advancedSettings.personalizationPage.noSignalImageTypes', 'Use a PNG or JPEG image up to 8 MB.') }}</p>
      <p v-if="noSignalError" class="no-signal-custom-error">{{ noSignalError }}</p>
      <input ref="noSignalInput" type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" hidden :disabled="disabled || noSignalBusy" @change="chooseNoSignalImage" />
    </section>
  </div>
</template>

<style scoped>
.no-signal-custom-preview { display: block; width: min(100%, 320px); max-height: 180px; object-fit: contain; border: 1px solid var(--border); border-radius: var(--radius); background: #000; }
.no-signal-custom-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.no-signal-custom-note { margin: 0; color: var(--muted-foreground); font-size: 11px; line-height: 1.5; }
.no-signal-custom-error { margin: 0; color: var(--destructive-hover); font-size: 12px; }
</style>
