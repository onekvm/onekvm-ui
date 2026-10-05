<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useMessage } from 'naive-ui'

import { api, type ExtensionSummary } from '@/api/client'
import { useAuth } from '@/composables/useAuth'
import { useOverlayMount } from '@/composables/useOverlayMount'
import { t } from '@/i18n/runtime'
import { createPasskey } from '@/lib/webauthn'
import { isCloudHosted } from '@/api/service-url'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  'update:show': [show: boolean]
}>()

const overlayTo = useOverlayMount()
const message = useMessage()
const cloudHosted = isCloudHosted()
const { auth, updateAccount, refresh } = useAuth()
const saving = ref(false)
const totpBusy = ref(false)
const totpSecret = ref('')
const totpUrl = ref('')
const totpCode = ref('')
const recoveryCodes = ref<string[]>([])
const pluginBusy = ref('')
const passkeyBusy = ref(false)
const totpQr = ref<HTMLElement | null>(null)
const currentPasswordInput = ref<{ focus?: () => void } | null>(null)
const authPlugins = ref<ExtensionSummary[]>([])
const passwordNeeded = ref(false)
const passwordDrawerOpen = ref(false)
const account = reactive({
  username: '',
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
})

const accountValid = computed(
  () =>
    account.username.trim().length > 0 &&
    account.currentPassword.length > 0 &&
    account.newPassword.length >= 8 &&
    account.newPassword === account.confirmPassword,
)
const passwordTooShort = computed(
  () => account.newPassword.length > 0 && account.newPassword.length < 8,
)
const passwordMismatch = computed(
  () => account.confirmPassword.length > 0 && account.confirmPassword !== account.newPassword,
)
const totpEnabled = computed(() => auth.mfa?.totp === true)
const passkeys = computed(() => auth.mfa?.passkeys || [])
const recoveryLeft = computed(() => auth.mfa?.backup_codes || 0)

function requireCurrentPassword() {
  if (account.currentPassword) {
    passwordNeeded.value = false
    return true
  }
  passwordNeeded.value = true
  message.error(t('settings.account.passwordRequired', 'Enter your current password to confirm this change'))
  void nextTick(() => {
    currentPasswordInput.value?.focus?.()
    document.getElementById('account-current-password')?.scrollIntoView({ block: 'center' })
  })
  return false
}

function clearPasswords() {
  account.currentPassword = ''
  account.newPassword = ''
  account.confirmPassword = ''
}

async function saveAccount() {
  if (!accountValid.value) return
  saving.value = true
  try {
    await updateAccount(account.username.trim(), account.currentPassword, account.newPassword)
    clearPasswords()
    passwordDrawerOpen.value = false
    message.success(t('settings.success', 'Settings saved'))
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : String(reason))
  } finally {
    saving.value = false
  }
}

async function loadAuthPlugins() {
  try {
    const catalog = await api.getExtensions()
    authPlugins.value = catalog.filter((item) => Boolean(item.auth_provider) && item.enabled)
  } catch {
    authPlugins.value = []
  }
}

async function beginTotp() {
  totpBusy.value = true
  try {
    const started = await api.authTotpBegin()
    totpSecret.value = started.secret
    totpUrl.value = started.otpauth_url
    totpCode.value = ''
    recoveryCodes.value = []
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : String(reason))
  } finally {
    totpBusy.value = false
  }
}

async function confirmTotp() {
  totpBusy.value = true
  try {
    const confirmed = await api.authTotpConfirm(totpCode.value.trim())
    recoveryCodes.value = confirmed.recovery_codes || confirmed.backup_codes || []
    totpSecret.value = ''
    totpUrl.value = ''
    totpCode.value = ''
    await refresh()
    message.success(t('settings.account.totpEnabled', 'Authenticator enabled'))
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : String(reason))
  } finally {
    totpBusy.value = false
  }
}

async function disableTotp() {
  if (!requireCurrentPassword()) return
  totpBusy.value = true
  try {
    await api.authTotpDisable(account.currentPassword)
    totpSecret.value = ''
    totpUrl.value = ''
    recoveryCodes.value = []
    await refresh()
    message.success(t('settings.account.totpDisabled', 'Authenticator disabled'))
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : String(reason))
  } finally {
    totpBusy.value = false
  }
}

async function enrollPlugin(id: string) {
  pluginBusy.value = id
  try {
    await api.authPluginEnroll(id)
    await refresh()
    message.success(pluginEnabledMessage(id))
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : String(reason))
  } finally {
    pluginBusy.value = ''
  }
}

async function disablePlugin(id: string) {
  if (!requireCurrentPassword()) return
  pluginBusy.value = id
  try {
    await api.authPluginDisable(id, account.currentPassword)
    await refresh()
    message.success(pluginDisabledMessage(id))
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : String(reason))
  } finally {
    pluginBusy.value = ''
  }
}

async function regenerateRecovery() {
  if (!requireCurrentPassword()) return
  totpBusy.value = true
  try {
    const rotated = await api.authTotpRecovery(account.currentPassword)
    recoveryCodes.value = rotated.recovery_codes || rotated.backup_codes || []
    await refresh()
    message.success(t('settings.account.recoveryGenerated', 'New recovery codes were created'))
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : String(reason))
  } finally {
    totpBusy.value = false
  }
}

async function copyText(value: string, successKey: string, successFallback: string) {
  try {
    await navigator.clipboard.writeText(value)
    message.success(t(successKey, successFallback))
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : String(reason))
  }
}

async function copyRecoveryCodes() {
  if (!recoveryCodes.value.length) return
  await copyText(recoveryCodes.value.join('\n'), 'settings.account.recoveryCopied', 'Recovery codes copied')
}

async function copyTotpSecret() {
  if (!totpSecret.value) return
  await copyText(totpSecret.value, 'settings.account.secretCopied', 'Secret copied')
}

function cancelTotp() {
  totpSecret.value = ''
  totpUrl.value = ''
  totpCode.value = ''
}

function pluginEnrolled(id: string) {
  return Boolean(auth.mfa?.plugins?.some((plugin) => plugin.id === id))
}

function isCloudAuthPlugin(id: string) {
  return id === 'cloud'
}

function isBootAuthPlugin(id: string) {
  return id === 'nanokvm-boot-confirm'
}

function pluginEnrollHint(id: string) {
  if (isCloudAuthPlugin(id)) {
    return t('settings.account.cloudConfirmHint', 'Approve the request in the OneKVM Cloud email sent to the enrolled account.')
  }
  if (isBootAuthPlugin(id)) {
    return t('settings.account.pluginEnrollHint', 'Press the BOOT button on the device. The OLED will show a prompt; tap once, do not hold.')
  }
  return t('settings.account.pluginConfirmHint', 'Confirm this request with the selected plugin.')
}

function pluginEnrollingLabel(id: string) {
  if (isCloudAuthPlugin(id)) {
    return t('settings.account.cloudConfirmWaiting', 'Waiting for cloud approval')
  }
  if (isBootAuthPlugin(id)) {
    return t('settings.account.pluginEnrolling', 'Waiting for BOOT')
  }
  return t('settings.account.pluginWaiting', 'Waiting for confirmation')
}

function pluginEnabledMessage(id: string) {
  if (isCloudAuthPlugin(id)) {
    return t('settings.account.cloudConfirmEnabled', 'Cloud login confirmation enabled')
  }
  return t('settings.account.pluginEnabled', 'Hardware confirmation enabled')
}

function pluginDisabledMessage(id: string) {
  if (isCloudAuthPlugin(id)) {
    return t('settings.account.cloudConfirmDisabled', 'Cloud login confirmation disabled')
  }
  return t('settings.account.pluginDisabled', 'Hardware confirmation disabled')
}

async function addPasskey() {
  passkeyBusy.value = true
  try {
    const challenge = await api.authPasskeyBegin()
    const credential = await createPasskey(challenge)
    await api.authPasskeyFinish(credential)
    await refresh()
    message.success(t('settings.account.passkeyAdded', 'Passkey added'))
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : String(reason))
  } finally {
    passkeyBusy.value = false
  }
}

async function disablePasskey(id: string) {
  if (!requireCurrentPassword()) return
  passkeyBusy.value = true
  try {
    await api.authPasskeyDisable(id, account.currentPassword)
    await refresh()
    message.success(t('settings.account.passkeyRemoved', 'Passkey removed'))
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : String(reason))
  } finally {
    passkeyBusy.value = false
  }
}

watch(
  () => props.show,
  (show) => {
    if (cloudHosted) return
    if (show) {
      account.username = auth.username || 'admin'
      passwordNeeded.value = false
      void refresh()
      void loadAuthPlugins()
    } else {
      clearPasswords()
      passwordNeeded.value = false
      passwordDrawerOpen.value = false
      totpSecret.value = ''
      totpUrl.value = ''
      totpCode.value = ''
    }
  },
)

watch(
  () => auth.username,
  (username) => {
    if (props.show) account.username = username || 'admin'
  },
)

watch(
  () => account.currentPassword,
  (value) => {
    if (value) passwordNeeded.value = false
  },
)

watch(totpUrl, async (url) => {
  if (!url) return
  await nextTick()
  totpQr.value?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
})
</script>

<template>
  <n-drawer
    class="account-drawer"
    :show="show"
    :to="overlayTo"
    placement="right"
    :width="440"
    @update:show="emit('update:show', $event)"
  >
    <n-drawer-content :title="t('settings.account.title', 'Account')" closable>
      <n-alert v-if="cloudHosted" type="info" :bordered="false">
        {{ t('auth.cloudAccount', 'Access is authorized by your cloud account. Manage your account in OneKVM Cloud.') }}
      </n-alert>
      <template v-else>
      <div class="account-sections">
        <section class="account-section">
          <header class="account-section-header">
            <strong>{{ t('settings.account.webAccount', 'Web account') }}</strong>
          </header>
          <p class="account-section-help">{{ t('settings.account.currentPasswordHint', 'Needed to save the account, and to turn off the authenticator or remove a passkey.') }}</p>
          <n-form label-placement="top" :show-feedback="false" class="account-form">
            <n-form-item :label="t('settings.account.currentPassword', 'Current password')">
              <div id="account-current-password" class="account-password-field">
                <n-input
                  ref="currentPasswordInput"
                  v-model:value="account.currentPassword"
                  type="password"
                  show-password-on="click"
                  placeholder=" "
                  autocomplete="current-password"
                  :status="passwordNeeded ? 'error' : undefined"
                />
                <small v-if="passwordNeeded" class="account-field-error">{{ t('settings.account.passwordRequired', 'Enter your current password to confirm this change') }}</small>
              </div>
            </n-form-item>
          </n-form>
          <div class="account-row-list">
            <div class="account-row">
              <span>
                {{ t('auth.username', 'Username') }}
                <small>{{ account.username || auth.username || 'admin' }}</small>
              </span>
              <n-button size="small" @click="passwordDrawerOpen = true">
                {{ t('settings.account.updateBtn', 'Change Password') }}
              </n-button>
            </div>
          </div>
        </section>

        <section class="account-section">
          <header class="account-section-header">
            <strong>{{ t('settings.account.mfa', 'Two-factor authentication') }}</strong>
            <n-tag size="small" :bordered="false" :type="totpEnabled ? 'success' : 'default'">
              {{ totpEnabled ? t('settings.account.enabled', 'Enabled') : t('settings.account.notConfigured', 'Not configured') }}
            </n-tag>
          </header>
          <p class="account-section-help">{{ t('settings.account.mfaHelp', 'A password is enough to sign in. An authenticator, recovery codes, and BOOT-button confirmation can be turned on when you need them.') }}</p>
          <div v-if="!totpEnabled && !totpSecret" class="account-section-actions">
            <n-button :loading="totpBusy" @click="beginTotp">{{ t('settings.account.enableTotp', 'Enable authenticator') }}</n-button>
          </div>
          <n-form v-if="totpSecret" label-placement="top" :show-feedback="false" class="account-form totp-setup">
            <p class="account-section-help">{{ t('settings.account.totpScan', 'Scan this QR code with an authenticator app, then enter a 6-digit code.') }}</p>
            <div ref="totpQr" class="totp-qr">
              <n-qr-code
                v-if="totpUrl"
                :value="totpUrl"
                :size="200"
                :padding="0"
                error-correction-level="M"
                type="canvas"
              />
            </div>
            <n-form-item :label="t('settings.account.totpSecret', 'Manual secret')">
              <div class="account-secret-row">
                <n-input :value="totpSecret" readonly placeholder=" " />
                <n-button @click="copyTotpSecret">{{ t('settings.account.copySecret', 'Copy') }}</n-button>
              </div>
            </n-form-item>
            <n-form-item :label="t('auth.totpCode', 'Authenticator code')">
              <n-input
                v-model:value="totpCode"
                maxlength="6"
                placeholder=" "
                inputmode="numeric"
                autocomplete="one-time-code"
              />
            </n-form-item>
            <div class="account-section-actions">
              <n-button @click="cancelTotp">{{ t('settings.account.cancelTotp', 'Cancel') }}</n-button>
              <n-button type="primary" :loading="totpBusy" :disabled="totpCode.trim().length !== 6" @click="confirmTotp">
                {{ t('settings.account.confirmTotp', 'Confirm authenticator') }}
              </n-button>
            </div>
          </n-form>
          <div v-if="totpEnabled && !recoveryCodes.length" class="account-row-list">
            <div class="account-row">
              <span>{{ t('settings.account.authenticator', 'Authenticator') }}</span>
              <n-button size="small" :loading="totpBusy" @click="disableTotp">
                {{ t('settings.account.disableTotp', 'Disable authenticator') }}
              </n-button>
            </div>
            <div class="account-row">
              <span>{{ t('settings.account.recoveryRemaining', '{n} recovery codes left').replace('{n}', String(recoveryLeft)) }}</span>
              <n-button size="small" :loading="totpBusy" @click="regenerateRecovery">
                {{ t('settings.account.regenerateRecovery', 'Generate new recovery codes') }}
              </n-button>
            </div>
          </div>
          <n-alert v-if="recoveryCodes.length" type="warning" :bordered="false">
            {{ t('settings.account.recoveryCodes', 'Store these recovery codes. Each code works once.') }}
            <ul class="recovery-codes">
              <li v-for="code in recoveryCodes" :key="code">{{ code }}</li>
            </ul>
            <n-button size="small" @click="copyRecoveryCodes">{{ t('settings.account.copyRecovery', 'Copy codes') }}</n-button>
          </n-alert>
        </section>

        <section class="account-section">
          <header class="account-section-header">
            <strong>{{ t('settings.account.passkeys', 'Passkeys') }}</strong>
            <n-button size="small" :loading="passkeyBusy" @click="addPasskey">
              {{ t('settings.account.addPasskey', 'Add passkey') }}
            </n-button>
          </header>
          <p class="account-section-help">{{ t('auth.passkeyHelp', 'Use a passkey. Open the device over HTTPS using its hostname, not an IP address.') }}</p>
          <p v-if="!passkeys.length" class="account-empty">{{ t('settings.account.noPasskeys', 'No passkeys yet') }}</p>
          <div v-else class="account-row-list">
            <div v-for="key in passkeys" :key="key.id" class="account-row">
              <span :title="key.label || key.id">{{ key.label || key.id }}</span>
              <n-button size="small" :loading="passkeyBusy" @click="disablePasskey(key.id)">
                {{ t('settings.account.removePasskey', 'Remove') }}
              </n-button>
            </div>
          </div>
        </section>

        <section v-if="authPlugins.length" class="account-section">
          <header class="account-section-header">
            <strong>{{ t('settings.account.pluginFactors', 'Device confirmation') }}</strong>
          </header>
          <p class="account-section-help">{{ t('settings.account.pluginFactorsHelp', 'Use a plugin as a second factor after the password. BOOT confirmation stays on the device; OneKVM Cloud asks the enrolled cloud account to approve local sign-in.') }}</p>
          <n-alert v-if="pluginBusy" type="info" :bordered="false" class="plugin-enroll-hint">
            {{ pluginEnrollHint(pluginBusy) }}
          </n-alert>
          <div class="account-row-list">
            <div v-for="plugin in authPlugins" :key="plugin.id" class="account-row">
              <span>
                {{ plugin.name }}
                <small>{{ pluginEnrolled(plugin.id) ? t('settings.account.enabled', 'Enabled') : t('settings.account.notConfigured', 'Not configured') }}</small>
              </span>
              <n-button
                v-if="!pluginEnrolled(plugin.id)"
                size="small"
                :loading="pluginBusy === plugin.id"
                @click="enrollPlugin(plugin.id)"
              >
                {{ pluginBusy === plugin.id ? pluginEnrollingLabel(plugin.id) : t('settings.account.enablePlugin', 'Enable') }}
              </n-button>
              <n-button
                v-else
                size="small"
                :loading="pluginBusy === plugin.id"
                @click="disablePlugin(plugin.id)"
              >
                {{ t('settings.account.disablePlugin', 'Disable') }}
              </n-button>
            </div>
          </div>
        </section>
      </div>
      </template>
    </n-drawer-content>
  </n-drawer>

  <n-drawer
    class="account-drawer"
    :show="passwordDrawerOpen"
    :to="overlayTo"
    placement="right"
    :width="440"
    @update:show="passwordDrawerOpen = $event"
  >
    <n-drawer-content :title="t('settings.account.updateBtn', 'Change Password')" closable>
      <div class="account-sections">
        <section class="account-section">
          <n-form label-placement="top" :show-feedback="false" class="account-form">
            <n-form-item :label="t('auth.username', 'Username')">
              <n-input v-model:value="account.username" placeholder=" " autocomplete="username" />
            </n-form-item>
            <n-form-item :label="t('settings.account.currentPassword', 'Current password')">
              <n-input
                v-model:value="account.currentPassword"
                type="password"
                show-password-on="click"
                placeholder=" "
                autocomplete="current-password"
              />
            </n-form-item>
            <n-form-item :label="t('settings.account.newPassword', 'New password')">
              <div class="account-password-field">
                <n-input
                  v-model:value="account.newPassword"
                  type="password"
                  show-password-on="click"
                  placeholder=" "
                  autocomplete="new-password"
                  :status="passwordTooShort ? 'error' : undefined"
                />
                <small v-if="passwordTooShort" class="account-field-error">{{ t('settings.account.passwordLength', 'Password must contain 8 to 128 characters') }}</small>
              </div>
            </n-form-item>
            <n-form-item :label="t('settings.account.confirmPassword', 'Confirm password')">
              <div class="account-password-field">
                <n-input
                  v-model:value="account.confirmPassword"
                  type="password"
                  show-password-on="click"
                  placeholder=" "
                  autocomplete="new-password"
                  :status="passwordMismatch ? 'error' : undefined"
                />
                <small v-if="passwordMismatch" class="account-field-error">{{ t('settings.account.passwordMismatch', 'The passwords do not match') }}</small>
              </div>
            </n-form-item>
          </n-form>
          <div class="account-section-actions">
            <n-button type="primary" :loading="saving" :disabled="!accountValid" @click="saveAccount">
              {{ t('common.save', 'Save') }}
            </n-button>
          </div>
        </section>
      </div>
    </n-drawer-content>
  </n-drawer>
</template>

<style scoped>
.account-sections {
  display: grid;
  gap: 22px;
  padding-bottom: 8px;
}

.account-section {
  display: grid;
  gap: 10px;
}

.account-section-header {
  display: flex;
  min-height: 28px;
  align-items: center;
  gap: 8px;
}

.account-section-header strong {
  min-width: 0;
  font-size: 13px;
  font-weight: 650;
}

.account-section-header .n-tag,
.account-section-header .n-button {
  margin-left: auto;
  flex: 0 0 auto;
}

.account-section-help,
.account-empty {
  margin: 0;
  color: var(--muted-foreground);
  font-size: 12px;
  line-height: 1.5;
}

.account-form {
  display: grid;
  gap: 12px;
}

.account-form :deep(.n-form-item) {
  margin: 0;
}

.account-password-field {
  display: grid;
  width: 100%;
  gap: 5px;
}

.account-field-error {
  color: var(--destructive);
  font-size: 11px;
  line-height: 1.4;
}

.account-section-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.account-row-list {
  display: grid;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--card);
}

.account-row {
  display: flex;
  min-width: 0;
  min-height: 44px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
}

.account-row + .account-row {
  border-top: 1px solid var(--border);
}

.account-row > span {
  display: grid;
  min-width: 0;
  gap: 2px;
  font-size: 13px;
}

.account-row > span small {
  color: var(--muted-foreground);
  font-size: 11px;
}

.account-row .n-button {
  flex: 0 0 auto;
}

.account-secret-row {
  display: grid;
  width: 100%;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}

.totp-setup {
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--onekvm-surface-inset);
}

.totp-qr {
  display: flex;
  justify-content: center;
  margin: 0 auto;
  padding: 16px;
  border-radius: var(--radius);
  background: #fff;
  width: fit-content;
  overflow: visible;
}

.totp-qr :deep(.n-qr-code) {
  width: auto !important;
  height: auto !important;
  padding: 0 !important;
  overflow: visible;
}

.totp-qr :deep(canvas) {
  display: block;
}

.plugin-enroll-hint { margin: 0; }
.plugin-enroll-hint :deep(.n-alert-body__content) { white-space: normal; overflow-wrap: anywhere; }

.recovery-codes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 16px;
  margin: 10px 0;
  padding: 0;
  list-style: none;
  font-family: var(--onekvm-font-mono);
  font-size: 13px;
}

@media (max-width: 760px) {
  .account-section-actions { justify-content: stretch; }
  .account-section-actions .n-button { flex: 1; }
  .account-row {
    align-items: flex-start;
    flex-direction: column;
  }
  .account-row .n-button { align-self: stretch; }
}
</style>
