<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue'
import { useMessage } from 'naive-ui'
import { Copy } from '@/icons'
import { api } from '@/api/client'
import { t } from '@/i18n/runtime'

const fingerprint = shallowRef('')
const displayedFingerprint = computed(() => {
  const parts = fingerprint.value.split(':')
  return parts.length > 8
    ? `${parts.slice(0, 4).join(':')}:****:${parts.slice(-4).join(':')}`
    : fingerprint.value
})
const loading = shallowRef(true)
const message = useMessage()

onMounted(async () => {
  try {
    const settings = await api.getOneKVMServiceSettings()
    fingerprint.value = settings.certificate.fingerprint_sha256 ?? ''
  } catch {
    fingerprint.value = ''
  } finally {
    loading.value = false
  }
})

async function copyFingerprint() {
  if (!fingerprint.value) return
  try {
    if (window.isSecureContext && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(fingerprint.value)
    } else {
      const textarea = document.createElement('textarea')
      textarea.value = fingerprint.value
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      try {
        textarea.select()
        if (!document.execCommand('copy')) throw new Error('copy failed')
      } finally {
        textarea.remove()
      }
    }
    message.success(t('settings.advancedSettings.systemPage.certificateFingerprintCopied'))
  } catch {
    message.error(t('settings.advancedSettings.systemPage.certificateFingerprintCopyFailed'))
  }
}
</script>

<template>
  <div>
    <dt>{{ t('settings.advancedSettings.systemPage.certificateFingerprint') }}</dt>
    <dd>
      <button v-if="fingerprint" type="button" class="certificate-fingerprint" :title="t('settings.advancedSettings.systemPage.copyCertificateFingerprint')"
        :aria-label="t('settings.advancedSettings.systemPage.copyCertificateFingerprint')" @click="copyFingerprint">
        <code>{{ displayedFingerprint }}</code><Copy :size="16" aria-hidden="true" />
      </button>
      <n-skeleton v-else-if="loading" text :width="240" />
      <span v-else>{{ t('settings.advancedSettings.systemPage.certificateFingerprintUnavailable') }}</span>
    </dd>
  </div>
</template>

<style scoped>
.certificate-fingerprint { display: flex; align-items: center; gap: 10px; max-width: 100%; padding: 4px 0; border: 0; background: transparent; color: inherit; text-align: left; cursor: pointer; }
.certificate-fingerprint code { min-width: 0; font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; user-select: text; }
.certificate-fingerprint svg { flex-shrink: 0; color: var(--muted-foreground); }
.certificate-fingerprint:hover { color: var(--primary); }
.certificate-fingerprint:focus-visible { outline: 2px solid var(--primary); outline-offset: 4px; border-radius: 4px; }
</style>
