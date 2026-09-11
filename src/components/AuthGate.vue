<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ArrowLeft, ArrowRight, ChevronDown, Languages, LogIn, Settings2 } from '@lucide/vue'

import type { DeviceLanguage, SetupSystemSettings } from '@/api/client'
import { useAuth } from '@/composables/useAuth'
import { uiProduct } from '@/product'
import { currentLanguage, languageOptions, setLanguage, t } from '@/i18n/runtime'
import { defaultNetworkConfig, isNetworkConfigValid, withManagementVLAN } from '@/lib/network'
import { getPasskey } from '@/lib/webauthn'
import { api } from '@/api/client'
import { timezones } from '@/lib/timezones'

import NetworkSettingsForm from './NetworkSettingsForm.vue'
import TimezoneMap from './TimezoneMap.vue'

const setupTimezones = ['UTC', ...timezones]

function detectedTimezone() {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return setupTimezones.includes(timezone) ? timezone : 'UTC'
  } catch {
    return 'UTC'
  }
}

const REMEMBER_LOGIN_KEY = 'onekvm-remember-login'

function readRememberedLogin() {
  try {
    const raw = localStorage.getItem(REMEMBER_LOGIN_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { username?: unknown; password?: unknown }
    if (typeof parsed.username !== 'string' || typeof parsed.password !== 'string') return null
    return { username: parsed.username, password: parsed.password }
  } catch {
    return null
  }
}

const { auth, login, setup, completeMfa, cancelMfa } = useAuth()
const rememberedLogin = readRememberedLogin()
const username = ref(rememberedLogin?.username || '')
const password = ref(rememberedLogin?.password || '')
const rememberPassword = ref(Boolean(rememberedLogin))
const hostname = ref('onekvm')
const setupUsername = ref('admin')
const setupPassword = ref('')
const confirmPassword = ref('')
const setupStep = ref(1)
const setupNetwork = ref(defaultNetworkConfig())
const networkAdvancedOpen = ref(false)
const setupVLANEnabled = ref(false)
const setupVLANID = ref(1)
const setupLanguage = ref<DeviceLanguage>(currentLanguage.value as DeviceLanguage)
const setupTimezone = ref(detectedTimezone())
const setupNTP = ref(true)
const setupNTPServer = ref('')
const busy = ref(false)
const error = ref('')
const totpCode = ref('')
const backupCode = ref('')
const selectedFactor = ref('')
const mfaPending = computed(() => Boolean(auth.mfa_required && !auth.authenticated))
const mfaFactors = computed(() => auth.factors || [])
const selected = computed(() => mfaFactors.value.find((factor) => (factor.id || factor.type) === selectedFactor.value) || mfaFactors.value[0])
function factorLabel(factor: { type: string; name?: string }) {
  if (factor.type === 'totp') return t('auth.totpMethod', 'Authenticator')
  if (factor.type === 'backup') return t('auth.recoveryCode', 'Recovery code')
  if (factor.type === 'passkey') return t('auth.passkey', 'Passkey')
  return factor.name || factor.type
}
const brandBadge = computed(() => uiProduct.badge(auth))
const currentLanguageLabel = computed(
  () => languageOptions.find((option) => option.value === currentLanguage.value)?.label || 'English',
)
const languageMenuOptions = computed(() =>
  languageOptions.map((option) => ({ label: option.label, key: option.value })),
)
const timezoneOptions = setupTimezones.map((timezone) => ({
  label: timezone.split('_').join(' '),
  value: timezone,
}))

const hostnameValid = computed(() => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(hostname.value.trim()))
const setupAccountValid = computed(
  () =>
    hostnameValid.value &&
    setupUsername.value.trim().length > 0 &&
    setupPassword.value.length >= 8 &&
    setupPassword.value === confirmPassword.value,
)
const setupNetworkRequest = computed(() => setupVLANEnabled.value
  ? withManagementVLAN(setupNetwork.value, setupVLANID.value)
  : setupNetwork.value)
const setupNetworkValid = computed(() =>
  (!setupVLANEnabled.value || (setupVLANID.value >= 1 && setupVLANID.value <= 4094)) &&
  isNetworkConfigValid(setupNetworkRequest.value),
)
const setupRegionValid = computed(() => {
  if (!setupTimezones.includes(setupTimezone.value)) return false
  const server = setupNTPServer.value.trim()
  return !setupNTP.value || !server || /^[A-Za-z0-9][A-Za-z0-9._:-]{0,252}$/.test(server)
})
const setupValid = computed(() => setupAccountValid.value && setupNetworkValid.value && setupRegionValid.value)
const setupDateTime = computed(() => {
  try {
    return new Intl.DateTimeFormat(
      ({ en: 'en-US', zh: 'zh-CN', zh_tw: 'zh-TW' } as const)[setupLanguage.value],
      { dateStyle: 'full', timeStyle: 'medium', timeZone: setupTimezone.value },
    ).format(new Date())
  } catch {
    return new Date().toLocaleString()
  }
})

watch(
  () => auth.username,
  (value) => {
    if (rememberPassword.value && username.value) return
    username.value = value || ''
  },
  { immediate: true },
)

watch(currentLanguage, (language) => {
  setupLanguage.value = language as DeviceLanguage
})
watch(rememberPassword, (enabled) => {
  if (enabled) return
  localStorage.removeItem(REMEMBER_LOGIN_KEY)
})

async function selectUILanguage(value: string | number) {
  const language = String(value) as DeviceLanguage
  if (!auth.configured) setupLanguage.value = language
  await setLanguage(language)
}

watch(
  () => auth.hostname,
  (value) => {
    hostname.value = value || 'onekvm'
  },
  { immediate: true },
)

async function submit() {
  if (busy.value || !username.value || !password.value) return
  busy.value = true
  error.value = ''
  try {
    const status = await login(username.value, password.value)
    if (status.mfa_required) {
      selectedFactor.value = (status.factors?.[0]?.id || status.factors?.[0]?.type || '')
      totpCode.value = ''
      backupCode.value = ''
      return
    }
    if (rememberPassword.value) {
      localStorage.setItem(REMEMBER_LOGIN_KEY, JSON.stringify({
        username: username.value,
        password: password.value,
      }))
    } else {
      localStorage.removeItem(REMEMBER_LOGIN_KEY)
    }
    password.value = ''
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    busy.value = false
  }
}

async function submitMfa() {
  const factor = selected.value
  if (busy.value || !factor) return
  busy.value = true
  error.value = ''
  try {
    if (factor.type === 'totp') {
      await completeMfa({ type: 'totp', code: totpCode.value.trim(), pending_token: auth.pending_token })
    } else if (factor.type === 'backup') {
      await completeMfa({ type: 'backup', code: backupCode.value.trim(), pending_token: auth.pending_token })
    } else if (factor.type === 'passkey') {
      const challenge = await api.authPasskeyLoginBegin(auth.pending_token)
      const assertion = await getPasskey(challenge)
      await completeMfa({
        type: 'passkey',
        pending_token: auth.pending_token,
        response: assertion,
      })
    } else if (factor.type === 'plugin') {
      await completeMfa({
        type: 'plugin',
        plugin_id: factor.id,
        pending_token: auth.pending_token,
      })
    }
    totpCode.value = ''
    backupCode.value = ''
    password.value = ''
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    busy.value = false
  }
}

async function cancelChallenge() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await cancelMfa(auth.pending_token)
    totpCode.value = ''
    backupCode.value = ''
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    busy.value = false
  }
}

async function initialize() {
  if (!setupValid.value) return
  busy.value = true
  error.value = ''
  try {
    const system: SetupSystemSettings = {
      language: setupLanguage.value,
      timezone: setupTimezone.value,
      ntp: setupNTP.value,
      ntp_servers: setupNTPServer.value.trim() ? [setupNTPServer.value.trim()] : [],
    }
    await setup(
      hostname.value.trim(),
      setupUsername.value.trim(),
      setupPassword.value,
      setupNetworkRequest.value,
      system,
    )
    setupPassword.value = ''
    confirmPassword.value = ''
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    busy.value = false
  }
}

function nextSetupStep() {
  if ((setupStep.value === 1 && setupAccountValid.value) || (setupStep.value === 2 && setupNetworkValid.value)) {
    error.value = ''
    setupStep.value += 1
  }
}

function previousSetupStep() {
  if (setupStep.value > 1) setupStep.value -= 1
}
</script>

<template>
  <div v-if="auth.loading" class="auth-loading">
    <n-spin size="small" />
  </div>

  <main v-else-if="!auth.configured" class="auth-screen">
    <form class="auth-panel auth-panel-setup" @submit.prevent="initialize">
      <div class="auth-panel-topline">
        <div class="auth-brand">
          <img class="auth-logo" src="/brand/onekvm-logo-inverse.svg" alt="OneKVM" />
          <span v-if="brandBadge" class="brand-badge">{{ brandBadge }}</span>
        </div>
        <n-dropdown trigger="click" :options="languageMenuOptions" @select="selectUILanguage">
          <n-button quaternary size="small" class="auth-language-button">
            <template #icon><Languages /></template>
            {{ currentLanguageLabel }}
          </n-button>
        </n-dropdown>
      </div>
      <h1>{{ t('auth.initialize', 'Initialize OneKVM') }}</h1>
      <n-steps :current="setupStep" size="small" class="setup-steps">
        <n-step :title="t('auth.accountStep', 'Account')" />
        <n-step :title="t('auth.networkStep', 'Network')" />
        <n-step :title="t('auth.regionTimeStep', 'Region and time')" />
      </n-steps>
      <n-alert v-if="error" type="error" :bordered="false">{{ error }}</n-alert>
      <n-form v-if="setupStep === 1" label-placement="top" :show-feedback="false">
        <n-form-item :label="t('auth.hostname', 'Hostname')">
          <n-input
            v-model:value="hostname"
            placeholder=""
            autocomplete="off"
            :maxlength="63"
            :status="hostname && !hostnameValid ? 'error' : undefined"
            autofocus
          />
        </n-form-item>
        <n-form-item :label="t('auth.username', 'Username')">
          <n-input v-model:value="setupUsername" placeholder="" autocomplete="username" :maxlength="64" />
        </n-form-item>
        <n-form-item :label="t('auth.password', 'Password')">
          <n-input
            v-model:value="setupPassword"
            type="password"
            placeholder=""
            show-password-on="click"
            autocomplete="new-password"
          />
        </n-form-item>
        <n-form-item :label="t('auth.confirmPassword', 'Confirm password')">
          <n-input
            v-model:value="confirmPassword"
            type="password"
            placeholder=""
            show-password-on="click"
            autocomplete="new-password"
            :status="confirmPassword && confirmPassword !== setupPassword ? 'error' : undefined"
          />
        </n-form-item>
      </n-form>
      <n-form v-else-if="setupStep === 2" label-placement="top" :show-feedback="false">
        <NetworkSettingsForm
          v-model="setupNetwork"
          :disabled="busy"
          :showMAC="false"
          :allowIPv4Disabled="false"
        />
        <n-button
          text
          class="setup-advanced-toggle"
          :disabled="busy"
          @click="networkAdvancedOpen = !networkAdvancedOpen"
        >
          <template #icon><Settings2 /></template>
          {{ t('auth.advancedSettings', 'Advanced settings') }}
          <ChevronDown :class="{ expanded: networkAdvancedOpen }" />
        </n-button>
        <n-collapse-transition :show="networkAdvancedOpen">
          <section class="setup-network-advanced">
            <n-form-item :label="t('auth.useVLAN', 'Use a management VLAN')">
              <n-switch v-model:value="setupVLANEnabled" :disabled="busy" />
            </n-form-item>
            <n-form-item v-if="setupVLANEnabled" :label="t('auth.vlanID', 'VLAN ID')">
              <n-input-number
                v-model:value="setupVLANID"
                :disabled="busy"
                :min="1"
                :max="4094"
                :precision="0"
              />
              <template #feedback>
                {{ t('auth.vlanHint', 'The management address above will be moved to this tagged VLAN.') }}
              </template>
            </n-form-item>
          </section>
        </n-collapse-transition>
      </n-form>
      <n-form v-else label-placement="top" :show-feedback="false">
        <div class="setup-region-fields">
          <n-form-item :label="t('auth.deviceLanguage', 'Language and regional format')">
            <n-select
              :value="setupLanguage"
              :options="languageOptions"
              :disabled="busy"
              @update:value="selectUILanguage"
            />
          </n-form-item>
          <n-form-item :label="t('auth.timezone', 'Time zone')">
            <n-select
              v-model:value="setupTimezone"
              :options="timezoneOptions"
              :disabled="busy"
              filterable
              virtual-scroll
            />
          </n-form-item>
        </div>
        <TimezoneMap v-model="setupTimezone" />
        <div class="setup-time-preview">{{ setupDateTime }}</div>
        <div class="setup-time-row">
          <div>
            <strong>{{ t('auth.automaticTime', 'Set time automatically') }}</strong>
            <span>{{ t('auth.automaticTimeHint', 'Synchronize the device clock over the network.') }}</span>
          </div>
          <n-switch v-model:value="setupNTP" :disabled="busy" />
        </div>
        <n-form-item v-if="setupNTP" :label="t('auth.ntpServer', 'Custom NTP server (optional)')">
          <n-input
            v-model:value="setupNTPServer"
            :disabled="busy"
            placeholder="time.cloudflare.com"
            :maxlength="253"
          />
        </n-form-item>
      </n-form>
      <div class="setup-actions">
        <n-button v-if="setupStep > 1" :disabled="busy" @click="previousSetupStep">
          <template #icon><ArrowLeft /></template>
          {{ t('auth.back', 'Back') }}
        </n-button>
        <n-button
          v-if="setupStep < 3"
          type="primary"
          :disabled="setupStep === 1 ? !setupAccountValid : !setupNetworkValid"
          @click="nextSetupStep"
        >
          <template #icon><ArrowRight /></template>
          {{ t('common.next', 'Next') }}
        </n-button>
        <n-button v-else type="primary" attr-type="submit" :loading="busy" :disabled="!setupValid">
          <template #icon><ArrowRight /></template>
          {{ t('auth.initializeButton', 'Initialize') }}
        </n-button>
      </div>
    </form>
  </main>

  <main v-else-if="auth.required && !auth.authenticated" class="auth-screen">
    <div class="auth-login">
      <form v-if="mfaPending" class="auth-panel" @submit.prevent="submitMfa">
        <div class="auth-panel-topline">
          <div class="auth-brand">
            <img class="auth-logo" src="/brand/onekvm-logo-inverse.svg" alt="OneKVM" />
            <span v-if="brandBadge" class="brand-badge">{{ brandBadge }}</span>
          </div>
        </div>
        <h1>{{ t('auth.mfaTitle', 'Verify sign-in') }}</h1>
        <p class="auth-mfa-help">{{ t('auth.mfaHelp', 'Enter a second factor or confirm on the device.') }}</p>
        <n-form label-placement="top" :show-feedback="false">
          <n-form-item v-if="mfaFactors.length > 1" :label="t('auth.mfaMethod', 'Method')">
            <n-select
              v-model:value="selectedFactor"
              :options="mfaFactors.map((factor) => ({
                label: factorLabel(factor),
                value: factor.id || factor.type,
              }))"
            />
          </n-form-item>
          <n-form-item v-if="selected?.type === 'totp'" :label="t('auth.totpCode', 'Authenticator code')">
            <n-input v-model:value="totpCode" maxlength="6" autocomplete="one-time-code" autofocus />
          </n-form-item>
          <n-form-item v-else-if="selected?.type === 'backup'" :label="t('auth.recoveryCode', 'Recovery code')">
            <n-input v-model:value="backupCode" maxlength="8" autocomplete="one-time-code" autofocus />
          </n-form-item>
          <p v-else-if="selected?.type === 'passkey'" class="auth-mfa-help">
            {{ t('auth.passkeyHelp', 'Use a passkey. The device hostname must be used over HTTPS, not an IP address.') }}
          </p>
          <p v-else-if="selected?.type === 'plugin'" class="auth-mfa-help">
            {{ t('auth.hardwareConfirm', 'Press the BOOT button on the device. The OLED will show a prompt; tap once, do not hold.') }}
          </p>
        </n-form>
        <n-button type="primary" attr-type="submit" block :loading="busy">
          {{ t('auth.verify', 'Verify') }}
        </n-button>
        <n-button class="auth-mfa-cancel" quaternary block :disabled="busy" @click="cancelChallenge">
          {{ t('auth.cancelVerify', 'Cancel verification') }}
        </n-button>
      </form>
      <form v-else class="auth-panel" @submit.prevent="submit">
        <div class="auth-panel-topline">
          <div class="auth-brand">
            <img class="auth-logo" src="/brand/onekvm-logo-inverse.svg" alt="OneKVM" />
            <span v-if="brandBadge" class="brand-badge">{{ brandBadge }}</span>
          </div>
          <n-dropdown trigger="click" :options="languageMenuOptions" @select="selectUILanguage">
            <n-button quaternary size="small" class="auth-language-button">
              <template #icon><Languages /></template>
              {{ currentLanguageLabel }}
            </n-button>
          </n-dropdown>
        </div>
        <h1>{{ t('auth.login', 'Sign in to OneKVM') }}</h1>
        <n-form label-placement="top" :show-feedback="false">
          <n-form-item :label="t('auth.username', 'Username')">
            <n-input
              v-model:value="username"
              :placeholder="t('auth.placeholderUsername', 'Enter your username')"
              autocomplete="username"
              autofocus
            />
          </n-form-item>
          <n-form-item :label="t('auth.password', 'Password')">
            <n-input
              v-model:value="password"
              type="password"
              :placeholder="t('auth.placeholderPassword', 'Enter your password')"
              show-password-on="click"
              autocomplete="current-password"
              @keydown.enter.prevent="submit"
            />
          </n-form-item>
        </n-form>
        <label class="auth-remember">
          <n-checkbox v-model:checked="rememberPassword">
            {{ t('auth.rememberPassword', 'Remember password') }}
          </n-checkbox>
        </label>
        <n-button type="primary" attr-type="submit" block :loading="busy" :disabled="!username || !password">
          <template #icon><LogIn /></template>
          {{ t('auth.loginButtonText', 'Login') }}
        </n-button>
      </form>
      <n-alert v-if="error" class="auth-login-error" type="error" :bordered="false">{{ error }}</n-alert>
    </div>
  </main>

  <slot v-else />
</template>
