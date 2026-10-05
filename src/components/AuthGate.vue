<script setup lang="ts">
import { serviceURL } from '@/api/service-url'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { ChevronDown, ChevronLeft, ChevronRight, Circle, CircleCheck, Languages, LogIn, Settings2 } from '@lucide/vue'

import type { DeviceLanguage, NetworkConfig, SetupSystemSettings } from '@/api/client'
import { useAuth } from '@/composables/useAuth'
import { uiProduct } from '@/product'
import { currentLanguage, languageOptions, setLanguage, t } from '@/i18n/runtime'
import {
  defaultNetworkConfig,
  configuredIPv4Address,
  isNetworkConfigValid,
  withManagementVLAN,
} from '@/lib/network'
import { getPasskey } from '@/lib/webauthn'
import { api } from '@/api/client'
import { timezones } from '@/lib/timezones'
import { useOneKVMTheme } from '@/theme/runtime'
import {
  clearRememberedLogin,
  readRememberedLogin,
  writeRememberedLogin,
} from '@/lib/remember-login'

import IosChoice from './IosChoice.vue'
import NetworkSettingsForm from './NetworkSettingsForm.vue'
import TimezoneMap from './TimezoneMap.vue'
import WifiOnboarding from './WifiOnboarding.vue'

const setupTimezones = ['UTC', ...timezones]

function detectedTimezone() {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return setupTimezones.includes(timezone) ? timezone : 'UTC'
  } catch {
    return 'UTC'
  }
}

const { auth, login, setup, completeMfa, cancelMfa } = useAuth()
const { theme } = useOneKVMTheme()
const logoSource = computed(() => theme.value.appearance === 'light'
  ? serviceURL('/brand/onekvm-logo-primary.svg')
  : serviceURL('/brand/onekvm-logo-inverse.svg'))
const rememberedLogin = readRememberedLogin()
const username = ref(rememberedLogin?.username || '')
const password = ref(rememberedLogin?.password || '')
const rememberPassword = ref(Boolean(rememberedLogin))
const hostname = ref('onekvm')
const setupUsername = ref('admin')
const setupPassword = ref('')
const confirmPassword = ref('')
const setupPage = ref<'menu' | 'account' | 'network' | 'region'>('menu')
const setupMotion = ref<'ios-push' | 'ios-pop'>('ios-push')
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
const setupSectionValid = computed(() => {
  if (setupPage.value === 'account') return setupAccountValid.value
  if (setupPage.value === 'network') return setupNetworkValid.value
  if (setupPage.value === 'region') return setupRegionValid.value
  return false
})
const setupClock = computed(() => {
  const locale = ({ en: 'en-US', zh: 'zh-CN', zh_tw: 'zh-TW' } as const)[setupLanguage.value]
  const now = new Date()
  try {
    return {
      date: new Intl.DateTimeFormat(locale, {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: setupTimezone.value,
      }).format(now),
      time: new Intl.DateTimeFormat(locale, { timeStyle: 'medium', timeZone: setupTimezone.value }).format(now),
    }
  } catch {
    return { date: '', time: now.toLocaleString() }
  }
})

function setupRedirectTarget(network: NetworkConfig) {
  const address = configuredIPv4Address(network)
  if (!address || address === window.location.hostname) return ''
  try {
    const target = new URL(window.location.href)
    target.hostname = address
    const port = target.protocol === 'https:' ? network.https_port : network.http_port
    target.port = port && !((target.protocol === 'https:' && port === 443) || (target.protocol === 'http:' && port === 80))
      ? String(port)
      : ''
    target.pathname = '/'
    target.search = ''
    target.hash = ''
    return target.toString()
  } catch {
    return ''
  }
}

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
  clearRememberedLogin()
})

watch(
  () => auth.required && !auth.authenticated && !auth.mfa_required,
  (showLogin) => {
    if (!showLogin) return
    const remembered = readRememberedLogin()
    if (!remembered) return
    username.value = remembered.username
    password.value = remembered.password
    rememberPassword.value = true
  },
)

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
    persistRememberedLogin()
    if (!rememberPassword.value) password.value = ''
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
    persistRememberedLogin()
    if (!rememberPassword.value) password.value = ''
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    busy.value = false
  }
}

function persistRememberedLogin() {
  if (rememberPassword.value && username.value) {
    writeRememberedLogin({ username: username.value, password: password.value })
    return
  }
  clearRememberedLogin()
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
  const redirectTarget = setupRedirectTarget(setupNetworkRequest.value)
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
    if (redirectTarget) {
      window.setTimeout(() => window.location.assign(redirectTarget), 500)
    }
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    busy.value = false
  }
}

function openSetupPage(page: 'account' | 'network' | 'region') {
  error.value = ''
  setupMotion.value = 'ios-push'
  setupPage.value = page
  if (!history.state?.onekvmSetup) history.pushState({ onekvmSetup: page }, '')
}

function showSetupMenu() {
  setupMotion.value = 'ios-pop'
  setupPage.value = 'menu'
}

function closeSetupPage() {
  if (history.state?.onekvmSetup) {
    history.back()
    return
  }
  showSetupMenu()
}

function saveSetupPage() {
  if (!setupSectionValid.value) return
  closeSetupPage()
}

function onSetupPop() {
  if (setupPage.value !== 'menu') showSetupMenu()
}

const edgeSwipe = { x: 0, y: 0, tracking: false, page: null as HTMLElement | null }

function drawerOpen() {
  return Boolean(document.querySelector('.n-drawer'))
}

function onEdgeStart(event: TouchEvent) {
  if (setupPage.value === 'menu' || drawerOpen()) return
  const touch = event.changedTouches[0]
  if (!touch || touch.clientX > 28) return
  edgeSwipe.tracking = true
  edgeSwipe.x = touch.clientX
  edgeSwipe.y = touch.clientY
  edgeSwipe.page = document.querySelector('.auth-panel-setup .ios-page')
}

function onEdgeMove(event: TouchEvent) {
  if (!edgeSwipe.tracking) return
  const touch = event.changedTouches[0]
  if (!touch) return
  const dx = touch.clientX - edgeSwipe.x
  const dy = touch.clientY - edgeSwipe.y
  if (dy * dy > dx * dx) {
    edgeSwipe.tracking = false
    if (edgeSwipe.page) edgeSwipe.page.style.transform = ''
    return
  }
  if (dx > 8) event.preventDefault()
  if (edgeSwipe.page) {
    edgeSwipe.page.style.transition = 'none'
    edgeSwipe.page.style.transform = `translateX(${Math.max(0, dx)}px)`
  }
}

function onEdgeEnd(event: TouchEvent) {
  if (!edgeSwipe.tracking) return
  edgeSwipe.tracking = false
  const touch = event.changedTouches[0]
  const dx = touch ? touch.clientX - edgeSwipe.x : 0
  const page = edgeSwipe.page
  edgeSwipe.page = null
  if (!page) return
  if (dx < 72) {
    page.style.transition = 'transform 220ms ease'
    page.style.transform = ''
    return
  }
  page.style.transition = 'transform 280ms cubic-bezier(.32, .72, 0, 1)'
  page.style.transform = 'translateX(100%)'
  window.setTimeout(() => {
    page.style.transition = ''
    page.style.transform = ''
    closeSetupPage()
  }, 280)
}

onMounted(() => {
  history.replaceState({ ...(history.state || {}), onekvmSetupRoot: true }, '')
  window.addEventListener('popstate', onSetupPop)
  window.addEventListener('touchstart', onEdgeStart, { passive: true })
  window.addEventListener('touchmove', onEdgeMove, { passive: false })
  window.addEventListener('touchend', onEdgeEnd)
  window.addEventListener('touchcancel', onEdgeEnd)
})
onUnmounted(() => {
  window.removeEventListener('popstate', onSetupPop)
  window.removeEventListener('touchstart', onEdgeStart)
  window.removeEventListener('touchmove', onEdgeMove)
  window.removeEventListener('touchend', onEdgeEnd)
  window.removeEventListener('touchcancel', onEdgeEnd)
})
</script>

<template>
  <div v-if="auth.loading" class="auth-loading">
    <n-spin size="small" />
  </div>

  <main v-else-if="!auth.configured" class="auth-screen">
    <form class="auth-panel auth-panel-setup" @submit.prevent="setupPage === 'menu' && initialize()">
      <div class="ios-stage">
      <Transition :name="setupMotion">
      <div :key="setupPage" class="ios-page">
      <div v-if="setupPage === 'menu'" class="auth-panel-topline">
        <div class="auth-brand">
          <img class="auth-logo" :src="logoSource" alt="OneKVM" />
          <span v-if="brandBadge" class="brand-badge">{{ brandBadge }}</span>
        </div>
        <n-dropdown trigger="click" :options="languageMenuOptions" @select="selectUILanguage">
          <n-button quaternary size="small" class="auth-language-button">
            <template #icon><Languages /></template>
            {{ currentLanguageLabel }}
          </n-button>
        </n-dropdown>
      </div>
      <div v-else class="ios-nav">
        <button type="button" class="ios-back" @click="closeSetupPage">
          <ChevronLeft />
          <span>{{ t('auth.initialize', 'Initialize OneKVM') }}</span>
        </button>
        <button type="button" class="ios-save" :disabled="busy || !setupSectionValid" @click="saveSetupPage">
          {{ t('auth.save', 'Save') }}
        </button>
      </div>
      <h1>{{ setupPage === 'account' ? t('auth.accountStep', 'Account') : setupPage === 'network' ? t('auth.networkStep', 'Network') : setupPage === 'region' ? t('auth.regionTimeStep', 'Region and time') : t('auth.initialize', 'Initialize OneKVM') }}</h1>
      <n-alert v-if="error && setupPage === 'menu'" type="error" :bordered="false">{{ error }}</n-alert>
      <section v-if="setupPage === 'menu'" class="ios-group">
        <button type="button" class="ios-menu" @click="openSetupPage('account')">
          <CircleCheck v-if="setupAccountValid" class="ios-state done" />
          <Circle v-else class="ios-state" />
          <span>{{ t('auth.accountStep', 'Account') }}</span>
          <em>{{ hostname || t('auth.hostname', 'Hostname') }}</em>
          <ChevronRight />
        </button>
        <button type="button" class="ios-menu" @click="openSetupPage('network')">
          <CircleCheck v-if="setupNetworkValid" class="ios-state done" />
          <Circle v-else class="ios-state" />
          <span>{{ t('auth.networkStep', 'Network') }}</span>
          <em>{{ setupNetwork.device || 'eth0' }}</em>
          <ChevronRight />
        </button>
        <button type="button" class="ios-menu" @click="openSetupPage('region')">
          <CircleCheck v-if="setupRegionValid" class="ios-state done" />
          <Circle v-else class="ios-state" />
          <span>{{ t('auth.regionTimeStep', 'Region and time') }}</span>
          <em>{{ setupTimezone.split('_').join(' ') }}</em>
          <ChevronRight />
        </button>
      </section>
      <button v-if="setupPage === 'menu'" class="ios-finish" type="submit" :disabled="busy || !setupValid">
        {{ t('auth.initializeButton', 'Initialize') }}
      </button>
      <div v-else-if="setupPage === 'account'" class="ios-fields">
        <label class="ios-field">
          <span>{{ t('auth.hostname', 'Hostname') }}</span>
          <section class="ios-group">
            <n-input
              v-model:value="hostname"
              placeholder=""
              autocomplete="off"
              :maxlength="63"
              :status="hostname && !hostnameValid ? 'error' : undefined"
              autofocus
            />
          </section>
        </label>
        <label class="ios-field">
          <span>{{ t('auth.username', 'Username') }}</span>
          <section class="ios-group">
            <n-input v-model:value="setupUsername" placeholder="" autocomplete="username" :maxlength="64" />
          </section>
        </label>
        <label class="ios-field">
          <span>{{ t('auth.password', 'Password') }}</span>
          <section class="ios-group">
            <n-input
              v-model:value="setupPassword"
              type="password"
              placeholder=""
              show-password-on="click"
              autocomplete="new-password"
            />
          </section>
        </label>
        <label class="ios-field">
          <span>{{ t('auth.confirmPassword', 'Confirm password') }}</span>
          <section class="ios-group">
            <n-input
              v-model:value="confirmPassword"
              type="password"
              placeholder=""
              show-password-on="click"
              autocomplete="new-password"
              :status="confirmPassword && confirmPassword !== setupPassword ? 'error' : undefined"
            />
          </section>
        </label>
      </div>
      <n-form v-else-if="setupPage === 'network'" class="setup-network" label-placement="top" :show-feedback="false">
        <WifiOnboarding initial-setup />
        <h2 class="ios-header">{{ t('settings.advancedSettings.systemPage.ethernet', 'Ethernet') }}</h2>
        <section class="ios-plain">
          <NetworkSettingsForm
            v-model="setupNetwork"
            inset
            :disabled="busy"
            :showMAC="false"
            :allowIPv4Disabled="false"
          />
          <button type="button" class="ios-disclosure" :disabled="busy" @click="networkAdvancedOpen = !networkAdvancedOpen">
            <Settings2 />
            <span>{{ t('auth.advancedSettings', 'Advanced settings') }}</span>
            <ChevronDown :class="{ expanded: networkAdvancedOpen }" />
          </button>
          <n-collapse-transition :show="networkAdvancedOpen">
            <div class="setup-network-advanced">
              <label class="ios-field">
                <span>{{ t('network.interfaces.routeMetric', 'Route metric') }}</span>
                <section class="ios-group">
                  <n-input-number
                    :value="setupNetwork.route_metric"
                    :disabled="busy"
                    :min="0"
                    :precision="0"
                    @update:value="setupNetwork.route_metric = $event ?? 0"
                  />
                </section>
              </label>
              <section class="ios-group ios-switch">
                <span>{{ t('auth.useVLAN', 'Use a management VLAN') }}</span>
                <n-switch v-model:value="setupVLANEnabled" :disabled="busy" />
              </section>
              <label v-if="setupVLANEnabled" class="ios-field">
                <span>{{ t('auth.vlanID', 'VLAN ID') }}</span>
                <section class="ios-group">
                  <n-input-number
                    v-model:value="setupVLANID"
                    :disabled="busy"
                    :min="1"
                    :max="4094"
                    :precision="0"
                  />
                </section>
              </label>
              <p v-if="setupVLANEnabled" class="ios-note">
                {{ t('auth.vlanHint', 'The management address above will be moved to this tagged VLAN.') }}
              </p>
            </div>
          </n-collapse-transition>
        </section>
      </n-form>
      <n-form v-else class="setup-region" label-placement="top" :show-feedback="false">
        <section class="ios-group">
          <IosChoice
            :label="t('auth.deviceLanguage', 'Language and regional format')"
            :value="setupLanguage"
            :options="languageOptions.map((option) => ({ label: option.label, value: option.value }))"
            :disabled="busy"
            @select="selectUILanguage($event as DeviceLanguage)"
          />
          <IosChoice
            scroll
            :label="t('auth.timezone', 'Time zone')"
            :value="setupTimezone"
            :options="timezoneOptions"
            :disabled="busy"
            @select="setupTimezone = $event"
          />
        </section>
        <TimezoneMap v-model="setupTimezone" />
        <div class="setup-time-preview">
          <span v-if="setupClock.date">{{ setupClock.date }}</span>
          <strong>{{ setupClock.time }}</strong>
        </div>
        <section class="ios-group">
          <div class="setup-time-row">
            <div>
              <strong>{{ t('auth.automaticTime', 'Set time automatically') }}</strong>
              <span>{{ t('auth.automaticTimeHint', 'Synchronize the device clock over the network.') }}</span>
            </div>
            <n-switch v-model:value="setupNTP" :disabled="busy" />
          </div>
        </section>
        <label v-if="setupNTP" class="ios-field">
          <span>{{ t('auth.ntpServer', 'Custom NTP server (optional)') }}</span>
          <section class="ios-group">
            <n-input
              v-model:value="setupNTPServer"
              :disabled="busy"
              placeholder="time.cloudflare.com"
              :maxlength="253"
            />
          </section>
        </label>
      </n-form>
      </div>
      </Transition>
      </div>
    </form>
  </main>

  <main v-else-if="auth.required && !auth.authenticated" class="auth-screen">
    <div class="auth-login">
      <form v-if="mfaPending" class="auth-panel" @submit.prevent="submitMfa">
        <div class="auth-panel-topline">
          <div class="auth-brand">
            <img class="auth-logo" :src="logoSource" alt="OneKVM" />
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
            {{ selected.id === 'cloud'
              ? t('auth.cloudConfirm', 'Approve this sign-in from the OneKVM Cloud email sent to the enrolled account. The request expires in five minutes.')
              : t('auth.hardwareConfirm', 'Press the BOOT button on the device. The OLED will show a prompt; tap once, do not hold.') }}
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
            <img class="auth-logo" :src="logoSource" alt="OneKVM" />
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
