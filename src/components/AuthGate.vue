<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ArrowLeft, ArrowRight, ChevronDown, Languages, LogIn, Settings2 } from '@lucide/vue'

import type { DeviceLanguage, SetupSystemSettings } from '@/api/client'
import { useAuth } from '@/composables/useAuth'
import { uiProduct } from '@/product'
import { currentLanguage, languageOptions, setLanguage, t } from '@/i18n/runtime'
import { defaultNetworkConfig, isNetworkConfigValid, withManagementVLAN } from '@/lib/network'
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

const { auth, login, setup } = useAuth()
const username = ref('')
const password = ref('')
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
    username.value = value || ''
  },
  { immediate: true },
)

watch(currentLanguage, (language) => {
  setupLanguage.value = language as DeviceLanguage
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
    await login(username.value, password.value)
    password.value = ''
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
    <form class="auth-panel" @submit.prevent="submit">
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
      <n-alert v-if="error" type="error" :bordered="false">{{ error }}</n-alert>
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
      <n-button type="primary" attr-type="submit" block :loading="busy" :disabled="!username || !password">
        <template #icon><LogIn /></template>
        {{ t('auth.loginButtonText', 'Login') }}
      </n-button>
    </form>
  </main>

  <slot v-else />
</template>
