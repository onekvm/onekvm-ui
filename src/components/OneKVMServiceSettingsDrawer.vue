<script setup lang="ts">
import { computed, reactive, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { useMessage } from 'naive-ui'

import {
  api,
  type AutoSSLIssueRequest,
  type CertificateMode,
  type CertificateStatus,
  type OneKVMServiceSettings,
} from '@/api/client'
import { t } from '@/i18n/runtime'

const show = defineModel<boolean>('show', { required: true })

const message = useMessage()
const loading = shallowRef(false)
const saving = shallowRef(false)
const certificateBusy = shallowRef(false)
const error = shallowRef('')
const certificateFile = shallowRef<File | null>(null)
const privateKeyFile = shallowRef<File | null>(null)
const certificateInput = useTemplateRef<HTMLInputElement>('certificateInput')
const privateKeyInput = useTemplateRef<HTMLInputElement>('privateKeyInput')
const certificate = ref<CertificateStatus>({ configured: false })
const certificateMode = shallowRef<CertificateMode>('self_signed')
const letsEncryptDirectory = 'https://acme-v02.api.letsencrypt.org/directory'
const letsEncryptStagingDirectory = 'https://acme-staging-v02.api.letsencrypt.org/directory'
const autoSSLCA = shallowRef<'letsencrypt' | 'staging' | 'custom'>('letsencrypt')
const autoSSLCredentialsConfigured = shallowRef(false)
const autoSSL = reactive({
  challenge: 'web' as 'web' | 'dns',
  email: '',
  domains: [''],
  directoryURL: letsEncryptDirectory,
  renewBeforeDays: 30,
  dnsProvider: 'cloudflare' as 'cloudflare' | 'webhook',
  dnsZoneID: '',
  dnsPresentURL: '',
  dnsCleanupURL: '',
  dnsPropagationSeconds: 30,
  cloudflareAPIToken: '',
  webhookBearerToken: '',
  lastIssuedAt: '',
  lastAttemptAt: '',
  lastError: '',
})
const form = reactive({
  httpPort: 80,
  httpsPort: 443,
  tlsEnabled: false,
  tlsAutoRedirect: false,
})

const title = computed(() => t('settings.advancedSettings.servicesPage.oneKVMSettings', 'OneKVM service settings'))

const certificateModeOptions = computed(() => [
  { label: t('settings.advancedSettings.servicesPage.selfSigned', 'Self-signed'), value: 'self_signed' },
  { label: t('settings.advancedSettings.servicesPage.manualUpload', 'Manual upload'), value: 'manual' },
  { label: 'AutoSSL', value: 'autossl' },
])

const autoSSLCAOptions = computed(() => [
  { label: "Let's Encrypt", value: 'letsencrypt' },
  { label: "Let's Encrypt Staging", value: 'staging' },
  { label: t('settings.advancedSettings.servicesPage.customCA', 'Custom ACME CA'), value: 'custom' },
])

const challengeOptions = computed(() => [
  { label: t('settings.advancedSettings.servicesPage.webValidation', 'Web validation (HTTP-01)'), value: 'web' },
  { label: t('settings.advancedSettings.servicesPage.dnsValidation', 'DNS validation (DNS-01)'), value: 'dns' },
])

const dnsProviderOptions = computed(() => [
  { label: 'Cloudflare', value: 'cloudflare' },
  { label: t('settings.advancedSettings.servicesPage.dnsWebhook', 'DNS webhook'), value: 'webhook' },
])

function assignOneKVM(settings: OneKVMServiceSettings) {
  form.httpPort = settings.http_port
  form.httpsPort = settings.https_port
  form.tlsEnabled = settings.tls_enabled
  form.tlsAutoRedirect = settings.tls_auto_redirect
  certificate.value = settings.certificate
  certificateMode.value = settings.certificate_mode || 'self_signed'
  const settingsAutoSSL = settings.autossl
  if (!settingsAutoSSL) return
  autoSSL.challenge = settingsAutoSSL.challenge || 'web'
  autoSSL.email = settingsAutoSSL.email || ''
  autoSSL.domains = settingsAutoSSL.domains?.length ? [...settingsAutoSSL.domains] : ['']
  autoSSL.directoryURL = settingsAutoSSL.directory_url || letsEncryptDirectory
  autoSSLCA.value = autoSSL.directoryURL === letsEncryptDirectory
    ? 'letsencrypt'
    : autoSSL.directoryURL === letsEncryptStagingDirectory ? 'staging' : 'custom'
  autoSSL.renewBeforeDays = settingsAutoSSL.renew_before_days || 30
  autoSSL.dnsProvider = settingsAutoSSL.dns_provider || 'cloudflare'
  autoSSL.dnsZoneID = settingsAutoSSL.dns_zone_id || ''
  autoSSL.dnsPresentURL = settingsAutoSSL.dns_present_url || ''
  autoSSL.dnsCleanupURL = settingsAutoSSL.dns_cleanup_url || ''
  autoSSL.dnsPropagationSeconds = settingsAutoSSL.dns_propagation_seconds ?? 30
  autoSSL.cloudflareAPIToken = ''
  autoSSL.webhookBearerToken = ''
  autoSSL.lastIssuedAt = settingsAutoSSL.last_issued_at || ''
  autoSSL.lastAttemptAt = settingsAutoSSL.last_attempt_at || ''
  autoSSL.lastError = settingsAutoSSL.last_error || ''
  autoSSLCredentialsConfigured.value = settingsAutoSSL.dns_credentials_configured
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    assignOneKVM(await api.getOneKVMServiceSettings())
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    loading.value = false
  }
}

async function save() {
  if (saving.value || certificateBusy.value) return
  saving.value = true
  error.value = ''
  try {
    assignOneKVM(await api.saveOneKVMServiceSettings({
      http_port: form.httpPort,
      https_port: form.httpsPort,
      tls_enabled: form.tlsEnabled,
      tls_auto_redirect: form.tlsAutoRedirect,
    }))
    message.success(t('settings.success', 'Settings saved'))
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    saving.value = false
  }
}

function chooseCertificate(event: Event) {
  certificateFile.value = (event.target as HTMLInputElement).files?.[0] || null
}

function choosePrivateKey(event: Event) {
  privateKeyFile.value = (event.target as HTMLInputElement).files?.[0] || null
}

async function uploadCertificate() {
  if (!certificateFile.value || !privateKeyFile.value || certificateBusy.value) return
  certificateBusy.value = true
  error.value = ''
  try {
    assignOneKVM(await api.uploadOneKVMCertificate(certificateFile.value, privateKeyFile.value))
    certificateFile.value = null
    privateKeyFile.value = null
    if (certificateInput.value) certificateInput.value.value = ''
    if (privateKeyInput.value) privateKeyInput.value.value = ''
    message.success(t('settings.advancedSettings.servicesPage.certificateUploaded', 'ECC certificate uploaded'))
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    certificateBusy.value = false
  }
}

async function generateCertificate() {
  if (certificateBusy.value) return
  certificateBusy.value = true
  error.value = ''
  try {
    assignOneKVM(await api.generateOneKVMCertificate())
    message.success(t('settings.advancedSettings.servicesPage.certificateGenerated', 'ECC certificate generated'))
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    certificateBusy.value = false
  }
}

function addAutoSSLDomain() {
  if (autoSSL.domains.length < 20) autoSSL.domains.push('')
}

function removeAutoSSLDomain(index: number) {
  if (autoSSL.domains.length === 1) autoSSL.domains[0] = ''
  else autoSSL.domains.splice(index, 1)
}

function autoSSLDirectoryURL() {
  if (autoSSLCA.value === 'letsencrypt') return letsEncryptDirectory
  if (autoSSLCA.value === 'staging') return letsEncryptStagingDirectory
  return autoSSL.directoryURL.trim()
}

async function obtainAutoSSLCertificate() {
  if (certificateBusy.value) return
  certificateBusy.value = true
  error.value = ''
  try {
    const request: AutoSSLIssueRequest = {
      challenge: autoSSL.challenge,
      email: autoSSL.email.trim(),
      domains: autoSSL.domains.map(domain => domain.trim()).filter(Boolean),
      directory_url: autoSSLDirectoryURL(),
      renew_before_days: autoSSL.renewBeforeDays,
    }
    if (autoSSL.challenge === 'dns') {
      request.dns_provider = autoSSL.dnsProvider
      request.dns_propagation_seconds = autoSSL.dnsPropagationSeconds
      if (autoSSL.dnsProvider === 'cloudflare') {
        request.dns_zone_id = autoSSL.dnsZoneID.trim()
        request.cloudflare_api_token = autoSSL.cloudflareAPIToken
      } else {
        request.dns_present_url = autoSSL.dnsPresentURL.trim()
        request.dns_cleanup_url = autoSSL.dnsCleanupURL.trim()
        request.webhook_bearer_token = autoSSL.webhookBearerToken
      }
    }
    assignOneKVM(await api.obtainOneKVMAutoSSLCertificate(request))
    message.success(t('settings.advancedSettings.servicesPage.autoSSLIssued', 'AutoSSL certificate issued'))
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    certificateBusy.value = false
  }
}

function certificateDate(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

watch(show, (open) => {
  if (open) void load()
})
</script>

<template>
  <n-drawer
    v-model:show="show"
    placement="right"
    :width="520"
    class="service-settings-drawer"
  >
    <n-drawer-content :title="title" closable>
      <n-spin :show="loading">
        <n-alert v-if="error" type="error" :bordered="false" class="service-settings-error">{{ error }}</n-alert>

        <n-form label-placement="top" :show-feedback="false" class="settings-form service-settings-form">
          <n-form-item :label="t('settings.advancedSettings.servicesPage.httpPort', 'HTTP port')">
            <n-input-number v-model:value="form.httpPort" :min="1" :max="65535" :step="1" class="service-settings-number" />
          </n-form-item>
          <n-form-item :label="t('settings.advancedSettings.servicesPage.httpsPort', 'HTTPS port')">
            <n-input-number v-model:value="form.httpsPort" :min="1" :max="65535" :step="1" class="service-settings-number" />
          </n-form-item>
          <div class="service-settings-switch-row">
            <span>{{ t('settings.advancedSettings.servicesPage.httpsEnabled', 'Enable HTTPS') }}</span>
            <n-switch v-model:value="form.tlsEnabled" />
          </div>
          <div class="service-settings-switch-row" :class="{ disabled: !form.tlsEnabled }">
            <span>{{ t('settings.advancedSettings.servicesPage.httpsAutoRedirect', 'Redirect HTTP to HTTPS') }}</span>
            <n-switch v-model:value="form.tlsAutoRedirect" :disabled="!form.tlsEnabled" />
          </div>
        </n-form>

        <n-divider>{{ t('settings.advancedSettings.servicesPage.httpsCertificate', 'HTTPS certificate') }}</n-divider>
        <n-form label-placement="top" :show-feedback="false" class="settings-form certificate-source-form">
          <n-form-item :label="t('settings.advancedSettings.servicesPage.certificateSource', 'Certificate source')">
            <n-select v-model:value="certificateMode" :options="certificateModeOptions" />
          </n-form-item>
        </n-form>
        <n-alert v-if="certificate.error" type="warning" :bordered="false">
          {{ certificate.error }}
        </n-alert>
        <div v-if="certificate.configured" class="certificate-status">
          <strong>{{ t('settings.advancedSettings.servicesPage.certificateReady', 'ECC certificate configured') }}</strong>
          <span v-if="certificate.curve">{{ t('settings.advancedSettings.servicesPage.certificateCurve', 'Curve') }}: {{ certificate.curve }}</span>
          <span v-if="certificate.subject">{{ t('settings.advancedSettings.servicesPage.certificateSubject', 'Subject') }}: {{ certificate.subject }}</span>
          <span v-if="certificate.not_after">{{ t('settings.advancedSettings.servicesPage.certificateExpires', 'Expires') }}: {{ certificateDate(certificate.not_after) }}</span>
        </div>
        <p v-else class="service-settings-hint">
          {{ t('settings.advancedSettings.servicesPage.eccOnlyHint', 'Only ECC/ECDSA certificates are accepted.') }}
        </p>

        <template v-if="certificateMode === 'self_signed'">
          <p class="service-settings-hint">
            {{ t('settings.advancedSettings.servicesPage.selfSignedHint', 'Generate a local ECC certificate. Browsers will show a trust warning until it is trusted manually.') }}
          </p>
          <div class="service-settings-actions">
            <n-button type="primary" secondary :loading="certificateBusy" @click="generateCertificate">
              {{ t('settings.advancedSettings.servicesPage.generateCertificate', 'Generate ECC certificate') }}
            </n-button>
          </div>
        </template>

        <template v-else-if="certificateMode === 'manual'">
          <div class="certificate-file-list">
            <label>{{ t('settings.advancedSettings.servicesPage.certificateFile', 'Certificate file') }}</label>
            <span>{{ certificateFile?.name || t('settings.advancedSettings.servicesPage.noFileSelected', 'No file selected') }}</span>
            <n-button secondary size="small" @click="certificateInput?.click()">
              {{ t('settings.advancedSettings.servicesPage.chooseCertificate', 'Choose certificate') }}
            </n-button>
          </div>
          <div class="certificate-file-list">
            <label>{{ t('settings.advancedSettings.servicesPage.privateKeyFile', 'Private key file') }}</label>
            <span>{{ privateKeyFile?.name || t('settings.advancedSettings.servicesPage.noFileSelected', 'No file selected') }}</span>
            <n-button secondary size="small" @click="privateKeyInput?.click()">
              {{ t('settings.advancedSettings.servicesPage.choosePrivateKey', 'Choose private key') }}
            </n-button>
          </div>
          <input ref="certificateInput" type="file" accept=".crt,.pem,application/x-pem-file" hidden @change="chooseCertificate" />
          <input ref="privateKeyInput" type="file" accept=".key,.pem,application/x-pem-file" hidden @change="choosePrivateKey" />
          <div class="service-settings-actions">
            <n-button type="primary" secondary :loading="certificateBusy" :disabled="!certificateFile || !privateKeyFile" @click="uploadCertificate">
              {{ t('settings.advancedSettings.servicesPage.uploadCertificate', 'Upload certificate') }}
            </n-button>
          </div>
        </template>

        <template v-else>
          <n-alert v-if="autoSSL.lastError" type="error" :bordered="false" class="autossl-status-alert">
            {{ autoSSL.lastError }}
          </n-alert>
          <div v-if="autoSSL.lastIssuedAt || autoSSL.lastAttemptAt" class="autossl-status">
            <span v-if="autoSSL.lastIssuedAt">{{ t('settings.advancedSettings.servicesPage.lastIssued', 'Last issued') }}: {{ certificateDate(autoSSL.lastIssuedAt) }}</span>
            <span v-if="autoSSL.lastAttemptAt">{{ t('settings.advancedSettings.servicesPage.lastAttempt', 'Last attempt') }}: {{ certificateDate(autoSSL.lastAttemptAt) }}</span>
          </div>
          <n-form label-placement="top" :show-feedback="false" class="settings-form autossl-form">
            <n-form-item :label="t('settings.advancedSettings.servicesPage.validationMethod', 'Validation method')">
              <n-select v-model:value="autoSSL.challenge" :options="challengeOptions" />
            </n-form-item>
            <n-alert v-if="autoSSL.challenge === 'web'" type="info" :bordered="false" class="autossl-wide">
              {{ t('settings.advancedSettings.servicesPage.webValidationHint', 'The domain must point to this device and OneKVM HTTP port must be 80. The ACME challenge bypasses authentication and HTTPS redirection.') }}
            </n-alert>
            <n-form-item :label="t('settings.advancedSettings.servicesPage.acmeCA', 'ACME CA')">
              <n-select v-model:value="autoSSLCA" :options="autoSSLCAOptions" />
            </n-form-item>
            <n-form-item v-if="autoSSLCA === 'custom'" :label="t('settings.advancedSettings.servicesPage.directoryURL', 'Directory URL')" class="autossl-wide">
              <n-input v-model:value="autoSSL.directoryURL" placeholder="https://acme.example.com/directory" />
            </n-form-item>
            <n-form-item :label="t('settings.advancedSettings.servicesPage.accountEmail', 'Account email')">
              <n-input v-model:value="autoSSL.email" type="text" placeholder="admin@example.com" />
            </n-form-item>
            <n-form-item :label="t('settings.advancedSettings.servicesPage.renewBefore', 'Renew before expiry')">
              <n-input-number v-model:value="autoSSL.renewBeforeDays" :min="1" :max="60" :step="1" class="service-settings-number">
                <template #suffix>{{ t('settings.advancedSettings.servicesPage.days', 'days') }}</template>
              </n-input-number>
            </n-form-item>
            <div class="autossl-wide">
              <label class="autossl-section-label">{{ t('settings.advancedSettings.servicesPage.domains', 'Domains') }}</label>
              <div class="autossl-domain-list">
                <div v-for="(_, index) in autoSSL.domains" :key="index" class="autossl-domain-row">
                  <n-input v-model:value="autoSSL.domains[index]" :placeholder="autoSSL.challenge === 'dns' ? 'example.com / *.example.com' : 'example.com'" />
                  <n-button quaternary circle type="error" @click="removeAutoSSLDomain(index)">×</n-button>
                </div>
              </div>
              <n-button dashed block :disabled="autoSSL.domains.length >= 20" @click="addAutoSSLDomain">
                {{ t('settings.advancedSettings.servicesPage.addDomain', 'Add domain') }}
              </n-button>
            </div>

            <template v-if="autoSSL.challenge === 'dns'">
              <n-divider class="autossl-wide">{{ t('settings.advancedSettings.servicesPage.dnsSettings', 'DNS settings') }}</n-divider>
              <n-form-item :label="t('settings.advancedSettings.servicesPage.dnsProvider', 'DNS provider')">
                <n-select v-model:value="autoSSL.dnsProvider" :options="dnsProviderOptions" />
              </n-form-item>
              <n-form-item :label="t('settings.advancedSettings.servicesPage.propagationWait', 'Propagation wait')">
                <n-input-number v-model:value="autoSSL.dnsPropagationSeconds" :min="0" :max="600" :step="1" class="service-settings-number">
                  <template #suffix>{{ t('settings.advancedSettings.servicesPage.seconds', 'seconds') }}</template>
                </n-input-number>
              </n-form-item>
              <template v-if="autoSSL.dnsProvider === 'cloudflare'">
                <n-form-item :label="t('settings.advancedSettings.servicesPage.cloudflareAPIToken', 'Cloudflare API Token')" class="autossl-wide">
                  <n-input v-model:value="autoSSL.cloudflareAPIToken" type="password" show-password-on="mousedown" :placeholder="autoSSLCredentialsConfigured ? t('settings.advancedSettings.servicesPage.keepCredential', 'Leave blank to keep the saved credential') : ''" />
                </n-form-item>
                <n-form-item :label="t('settings.advancedSettings.servicesPage.zoneID', 'Zone ID (optional)')" class="autossl-wide">
                  <n-input v-model:value="autoSSL.dnsZoneID" :placeholder="t('settings.advancedSettings.servicesPage.zoneIDHint', 'Automatically detected when empty')" />
                </n-form-item>
              </template>
              <template v-else>
                <n-form-item :label="t('settings.advancedSettings.servicesPage.presentURL', 'Present webhook URL')" class="autossl-wide">
                  <n-input v-model:value="autoSSL.dnsPresentURL" placeholder="https://dns.example.com/acme/present" />
                </n-form-item>
                <n-form-item :label="t('settings.advancedSettings.servicesPage.cleanupURL', 'Cleanup webhook URL (optional)')" class="autossl-wide">
                  <n-input v-model:value="autoSSL.dnsCleanupURL" placeholder="https://dns.example.com/acme/cleanup" />
                </n-form-item>
                <n-form-item :label="t('settings.advancedSettings.servicesPage.bearerToken', 'Bearer token (optional)')" class="autossl-wide">
                  <n-input v-model:value="autoSSL.webhookBearerToken" type="password" show-password-on="mousedown" :placeholder="autoSSLCredentialsConfigured ? t('settings.advancedSettings.servicesPage.keepCredential', 'Leave blank to keep the saved credential') : ''" />
                </n-form-item>
              </template>
            </template>
          </n-form>
          <div class="service-settings-actions">
            <n-button type="primary" :loading="certificateBusy" @click="obtainAutoSSLCertificate">
              {{ t('settings.advancedSettings.servicesPage.issueCertificate', 'Issue / renew certificate') }}
            </n-button>
          </div>
        </template>

        <div class="drawer-actions service-settings-footer">
          <n-button type="primary" :loading="saving" :disabled="certificateBusy" @click="save">{{ t('common.save', 'Save') }}</n-button>
        </div>
      </n-spin>
    </n-drawer-content>
  </n-drawer>
</template>
