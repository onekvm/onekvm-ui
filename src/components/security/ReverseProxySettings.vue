<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NAutoComplete } from 'naive-ui'
import type { ReverseProxySettings } from '@/api/client'
import { validClientIpHeader, validProxyAddress, validReverseProxySettings } from '@/lib/reverse-proxy'
import { t } from '@/i18n/runtime'

const form = defineModel<ReverseProxySettings>({ required: true })
defineProps<{ disabled: boolean }>()
const proxyText = ref(form.value.trusted_proxies.join('\n'))
watch(form, value => { proxyText.value = value.trusted_proxies.join('\n') })
watch(proxyText, value => { form.value.trusted_proxies = value.split(/[\n,]/).map(value => value.trim()).filter(Boolean) })
const invalidAddresses = computed(() => form.value.trusted_proxies.some(value => !validProxyAddress(value))
  || form.value.trusted_proxies.length > 64 || (form.value.enabled && !form.value.trusted_proxies.length))
const headerOptions = computed(() => ['X-Forwarded-For', 'Forwarded', 'X-Real-IP', 'CF-Connecting-IP', 'True-Client-IP']
  .filter(value => value.toLowerCase().includes(form.value.client_ip_header.toLowerCase())))
const invalidHeader = computed(() => !validClientIpHeader(form.value.client_ip_header))
const frameOptions = computed(() => [
  { label: t('settings.advancedSettings.securityPage.proxyFrameOff'), value: 'off' },
  { label: t('settings.advancedSettings.securityPage.proxyFrameSameOrigin'), value: 'sameorigin' },
  { label: t('settings.advancedSettings.securityPage.proxyFrameDeny'), value: 'deny' },
])
const referrerOptions = ['strict-origin-when-cross-origin', 'same-origin', 'no-referrer'].map(value => ({ label: value, value }))
</script>

<template>
  <div class="proxy-settings">
    <p class="proxy-hint">{{ t('settings.advancedSettings.securityPage.proxyTrustHint') }}</p>
    <n-form label-placement="top" :show-feedback="false" :disabled="disabled" class="proxy-form">
      <n-form-item :label="t('settings.advancedSettings.securityPage.proxyTrustedAddresses')" :label-props="{ for: 'proxy-trusted-addresses' }">
        <n-input v-model:value="proxyText" type="textarea" :autosize="{ minRows: 3, maxRows: 6 }" :input-props="{ id: 'proxy-trusted-addresses', spellcheck: false }"
          placeholder="192.0.2.10&#10;2001:db8::/64" :status="invalidAddresses ? 'error' : undefined" />
      </n-form-item>
      <p v-if="invalidAddresses" class="proxy-error">{{ t('settings.advancedSettings.securityPage.proxyInvalidAddresses') }}</p>
      <n-form-item :label="t('settings.advancedSettings.securityPage.proxyClientHeader')" :label-props="{ for: 'proxy-client-header' }">
        <n-auto-complete v-model:value="form.client_ip_header" :options="headerOptions" :status="invalidHeader ? 'error' : undefined"
          :input-props="{ id: 'proxy-client-header', spellcheck: false, autocomplete: 'off', maxlength: 128 }" placeholder="X-Forwarded-For" />
      </n-form-item>
      <p :class="invalidHeader ? 'proxy-error' : 'proxy-hint'">{{ t(`settings.advancedSettings.securityPage.${invalidHeader ? 'proxyInvalidHeader' : 'proxyClientHeaderHint'}`) }}</p>
      <div class="proxy-toggle-row">
        <label id="proxy-https-label">{{ t('settings.advancedSettings.securityPage.proxyRequireHttps') }}</label>
        <n-switch v-model:value="form.require_https" :disabled="disabled" aria-labelledby="proxy-https-label" />
      </div>
      <p class="proxy-hint">{{ t('settings.advancedSettings.securityPage.proxyHttpsHint') }}</p>
      <n-form-item :label="t('settings.advancedSettings.securityPage.proxyPublicOrigin')" :label-props="{ for: 'proxy-public-origin' }">
        <n-input v-model:value="form.public_origin" :input-props="{ id: 'proxy-public-origin', spellcheck: false }" placeholder="https://kvm.example.com" />
      </n-form-item>
      <p class="proxy-hint">{{ t('settings.advancedSettings.securityPage.proxyOriginHint') }}</p>
      <n-divider />
      <div class="proxy-toggle-row">
        <label id="proxy-security-headers-label">{{ t('settings.advancedSettings.securityPage.proxySecurityHeaders') }}</label>
        <n-switch v-model:value="form.security_headers_enabled" :disabled="disabled" aria-labelledby="proxy-security-headers-label" />
      </div>
      <p class="proxy-hint">{{ t('settings.advancedSettings.securityPage.proxyHeadersHint') }}</p>
      <n-form-item :label="t('settings.advancedSettings.securityPage.proxyFrameOptions')" :label-props="{ id: 'proxy-frame-options-label' }">
        <n-select v-model:value="form.frame_options" :options="frameOptions" :disabled="disabled || !form.security_headers_enabled" aria-labelledby="proxy-frame-options-label" />
      </n-form-item>
      <n-form-item label="Referrer-Policy" :label-props="{ id: 'proxy-referrer-label' }">
        <n-select v-model:value="form.referrer_policy" :options="referrerOptions" :disabled="disabled || !form.security_headers_enabled" aria-labelledby="proxy-referrer-label" />
      </n-form-item>
      <div class="proxy-toggle-row">
        <label id="proxy-hsts-label">HSTS</label>
        <n-switch v-model:value="form.hsts_enabled" :disabled="disabled || !form.security_headers_enabled" aria-labelledby="proxy-hsts-label" />
      </div>
      <p class="proxy-hint">{{ t('settings.advancedSettings.securityPage.proxyHstsHint') }}</p>
      <template v-if="form.hsts_enabled">
        <n-form-item :label="t('settings.advancedSettings.securityPage.proxyHstsMaxAge')" :label-props="{ for: 'proxy-hsts-max-age' }">
          <n-input-number v-model:value="form.hsts_max_age_seconds" :min="0" :max="63072000" :precision="0" :disabled="disabled || !form.security_headers_enabled" :input-props="{ id: 'proxy-hsts-max-age' }">
            <template #suffix>{{ t('settings.advancedSettings.securityPage.seconds') }}</template>
          </n-input-number>
        </n-form-item>
        <div class="proxy-toggle-row">
          <label id="proxy-hsts-subdomains-label">{{ t('settings.advancedSettings.securityPage.proxyHstsSubdomains') }}</label>
          <n-switch v-model:value="form.hsts_include_subdomains" :disabled="disabled || !form.security_headers_enabled" aria-labelledby="proxy-hsts-subdomains-label" />
        </div>
      </template>
    </n-form>
    <p v-if="!invalidAddresses && !validReverseProxySettings(form)" class="proxy-error">{{ t('settings.advancedSettings.securityPage.proxyInvalidSettings') }}</p>
  </div>
</template>

<style scoped>
.proxy-settings, .proxy-form { display: grid; gap: 16px; }
.proxy-form :deep(.n-form-item-blank), .proxy-form :deep(.n-input-number) { width: 100%; }
.proxy-toggle-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
.proxy-toggle-row :deep(.n-switch) { flex-shrink: 0; }
.proxy-hint { margin: 0; color: var(--muted-foreground); line-height: 1.6; }
.proxy-error { margin: 0; color: var(--error-color, #d03050); line-height: 1.6; }
</style>
