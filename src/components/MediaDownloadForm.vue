<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { useMessage } from 'naive-ui'

import { useOverlayMount } from '@/composables/useOverlayMount'
import { t } from '@/i18n/runtime'
import { httpsDownloadURL } from '@/lib/download-url'

const show = defineModel<boolean>('show', { required: true })
const props = defineProps<{ disabled: boolean }>()
const emit = defineEmits<{ submit: [request: { url: string; name: string }] }>()
const overlayTo = useOverlayMount()
const message = useMessage()
const url = shallowRef('')
const name = shallowRef('')
const suggestedName = computed(() => {
  try {
    const filename = decodeURIComponent(new URL(url.value.trim()).pathname.split('/').pop() || '')
    return filename.toLowerCase().endsWith('.iso') && !/[\u0000-\u001f\u007f/\\]/.test(filename) ? filename : 'image.iso'
  } catch {
    return 'image.iso'
  }
})
const validURL = computed(() => {
  try {
    const parsed = new URL(url.value.trim())
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && Boolean(parsed.hostname)
  } catch {
    return false
  }
})
const validName = computed(() => {
  const filename = name.value.trim()
  return filename.toLowerCase().endsWith('.iso')
    && new TextEncoder().encode(filename).length <= 255
    && !/[\u0000-\u001f\u007f/\\]/.test(filename)
})

watch(suggestedName, (next, previous) => {
  if (!name.value || name.value === previous) name.value = next
})
watch(show, (open) => {
  if (open) {
    url.value = ''
    name.value = 'image.iso'
  }
})

function submit() {
  if (props.disabled || !validURL.value || !validName.value) return
  const originalURL = url.value.trim()
  const secureURL = httpsDownloadURL(originalURL)
  if (secureURL !== originalURL) {
    url.value = secureURL
    message.warning(t('virtualMedia.downloadURLUpgraded', 'The HTTP download link was changed to HTTPS before starting the download.'), { duration: 7000 })
  }
  emit('submit', { url: secureURL, name: name.value.trim() })
  show.value = false
}
</script>

<template>
  <n-modal
    v-model:show="show"
    preset="card"
    :to="overlayTo"
    :z-index="4600"
    :style="{ width: 'min(440px, calc(100vw - 32px))' }"
    :title="t('virtualMedia.onlineDownload', 'Online download')"
  >
    <form class="media-download-form" @submit.prevent="submit">
      <p class="media-download-hint">{{ t('virtualMedia.downloadDescription', 'Download an ISO to the device.') }}</p>
      <n-form-item :label="t('virtualMedia.downloadURL', 'Download URL (HTTP/HTTPS)')" label-placement="top" :show-feedback="false">
        <n-input v-model:value="url" autofocus placeholder="https://example.com/image.iso" :input-props="{ inputmode: 'url', autocomplete: 'off', spellcheck: false, 'aria-label': t('virtualMedia.downloadURL', 'Download URL (HTTP/HTTPS)') }" />
      </n-form-item>
      <n-form-item :label="t('virtualMedia.downloadFileName', 'File name')" label-placement="top" :show-feedback="false">
        <n-input v-model:value="name" :placeholder="suggestedName" :input-props="{ 'aria-label': t('virtualMedia.downloadFileName', 'File name') }" />
      </n-form-item>
      <p v-if="url && !validURL" class="media-download-error" role="status">{{ t('virtualMedia.invalidDownloadURL', 'Enter a valid HTTP or HTTPS URL.') }}</p>
      <p v-else-if="name && !validName" class="media-download-error" role="status">{{ t('virtualMedia.invalidDownloadName', 'Enter an ISO file name without directory separators.') }}</p>
      <div class="media-download-footer">
        <p class="media-download-hint media-download-background">{{ t('virtualMedia.downloadBackgroundHint', 'Downloads continue after closing.') }}</p>
        <div class="media-download-actions">
          <n-button @click="show = false">{{ t('common.cancel', 'Cancel') }}</n-button>
          <n-button attr-type="submit" type="primary" :disabled="disabled || !validURL || !validName">{{ t('virtualMedia.startDownload', 'Start download') }}</n-button>
        </div>
      </div>
    </form>
  </n-modal>
</template>

<style scoped>
.media-download-form { display: grid; gap: 16px; }
.media-download-hint, .media-download-error { margin: 0; font-size: 12px; line-height: 1.5; }
.media-download-hint { color: var(--n-text-color-3); }
.media-download-error { color: var(--destructive); }
.media-download-footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
.media-download-background { flex: 1 1 120px; min-width: 0; }
.media-download-actions { display: flex; flex-shrink: 0; justify-content: flex-end; gap: 8px; margin-left: auto; }
</style>
