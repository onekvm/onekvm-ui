<script setup lang="ts">
import { computed } from 'vue'
import type { DeviceLanguage, NetworkConfig } from '@/api/client'
import { ArrowLeft, ArrowRight, Languages } from '@/icons'
import { currentLanguage, languageOptions, t } from '@/i18n/runtime'
import DesktopSetupNetwork from './setup/DesktopSetupNetwork.vue'
import TimezoneMap from './TimezoneMap.vue'

const props = defineProps<{
  logoSource: string
  brandBadge: string
  busy: boolean
  error: string
  hostnameValid: boolean
  accountValid: boolean
  networkValid: boolean
  valid: boolean
  timezoneOptions: { label: string; value: string }[]
  clock: { date: string; time: string }
}>()
const emit = defineEmits<{
  initialize: []
  'select-language': [language: DeviceLanguage]
}>()
const step = defineModel<1 | 2 | 3>('step', { required: true })
const hostname = defineModel<string>('hostname', { required: true })
const username = defineModel<string>('username', { required: true })
const password = defineModel<string>('password', { required: true })
const confirmPassword = defineModel<string>('confirmPassword', { required: true })
const network = defineModel<NetworkConfig>('network', { required: true })
const networkAdvancedOpen = defineModel<boolean>('networkAdvancedOpen', { required: true })
const vlanEnabled = defineModel<boolean>('vlanEnabled', { required: true })
const vlanID = defineModel<number>('vlanId', { required: true })
const language = defineModel<DeviceLanguage>('language', { required: true })
const timezone = defineModel<string>('timezone', { required: true })
const ntp = defineModel<boolean>('ntp', { required: true })
const ntpServer = defineModel<string>('ntpServer', { required: true })

const languageLabel = computed(() =>
  languageOptions.find((option) => option.value === currentLanguage.value)?.label || 'English',
)
const languageMenu = computed(() => languageOptions.map((option) => ({ label: option.label, key: option.value })))
const canAdvance = computed(() => step.value === 1 ? props.accountValid : props.networkValid)

function selectLanguage(value: string | number) {
  emit('select-language', String(value) as DeviceLanguage)
}

function advance() {
  if (props.busy) return
  if (step.value === 3) {
    if (props.valid) emit('initialize')
  } else if (canAdvance.value) {
    step.value = step.value === 1 ? 2 : 3
  }
}

function previous() {
  if (!props.busy) step.value = step.value === 3 ? 2 : 1
}
</script>

<template>
  <n-form
    class="auth-panel auth-setup-desktop"
    label-placement="top"
    :show-feedback="false"
    @submit.prevent="advance"
  >
    <div class="auth-panel-topline">
      <div class="auth-brand">
        <img class="auth-logo" :src="logoSource" alt="OneKVM" />
        <span v-if="brandBadge" class="brand-badge">{{ brandBadge }}</span>
      </div>
      <n-dropdown trigger="click" :options="languageMenu" @select="selectLanguage">
        <n-button quaternary size="small" class="auth-language-button">
          <template #icon><Languages /></template>
          {{ languageLabel }}
        </n-button>
      </n-dropdown>
    </div>
    <h1>{{ t('auth.initialize', 'Initialize OneKVM') }}</h1>
    <n-steps :current="step" size="small" class="setup-steps">
      <n-step :title="t('auth.accountStep', 'Account')" />
      <n-step :title="t('auth.networkStep', 'Network')" />
      <n-step :title="t('auth.regionTimeStep', 'Region and time')" />
    </n-steps>
    <n-alert v-if="error" type="error" :bordered="false">{{ error }}</n-alert>

    <div v-if="step === 1">
      <n-form-item :label="t('auth.hostname', 'Hostname')">
        <n-input
          v-model:value="hostname"
          :disabled="busy"
          placeholder=""
          autocomplete="off"
          :maxlength="63"
          :status="hostname && !hostnameValid ? 'error' : undefined"
          autofocus
        />
      </n-form-item>
      <n-form-item :label="t('auth.username', 'Username')">
        <n-input v-model:value="username" :disabled="busy" placeholder="" autocomplete="username" :maxlength="64" />
      </n-form-item>
      <n-form-item :label="t('auth.password', 'Password')">
        <n-input
          v-model:value="password"
          :disabled="busy"
          type="password"
          placeholder=""
          show-password-on="click"
          autocomplete="new-password"
        />
      </n-form-item>
      <n-form-item :label="t('auth.confirmPassword', 'Confirm password')">
        <n-input
          v-model:value="confirmPassword"
          :disabled="busy"
          type="password"
          placeholder=""
          show-password-on="click"
          autocomplete="new-password"
          :status="confirmPassword && confirmPassword !== password ? 'error' : undefined"
        />
      </n-form-item>
    </div>

    <DesktopSetupNetwork
      v-else-if="step === 2"
      v-model="network"
      v-model:advanced-open="networkAdvancedOpen"
      v-model:vlan-enabled="vlanEnabled"
      v-model:vlan-id="vlanID"
      :disabled="busy"
      :valid="networkValid"
    />

    <div v-else>
      <div class="setup-region-fields">
        <n-form-item :label="t('auth.deviceLanguage', 'Language and regional format')">
          <n-select :value="language" :options="languageOptions" :disabled="busy" @update:value="selectLanguage" />
        </n-form-item>
        <n-form-item :label="t('auth.timezone', 'Time zone')">
          <n-select v-model:value="timezone" :options="timezoneOptions" :disabled="busy" filterable virtual-scroll />
        </n-form-item>
      </div>
      <TimezoneMap v-model="timezone" />
      <div class="setup-time-preview">
        <span>{{ clock.date }}</span>
        <strong>{{ clock.time }}</strong>
      </div>
      <div class="setup-time-row">
        <div>
          <strong>{{ t('auth.automaticTime', 'Set time automatically') }}</strong>
          <span>{{ t('auth.automaticTimeHint', 'Synchronize the device clock over the network.') }}</span>
        </div>
        <n-switch v-model:value="ntp" :disabled="busy" />
      </div>
      <n-form-item v-if="ntp" :label="t('auth.ntpServer', 'Custom NTP server (optional)')">
        <n-input v-model:value="ntpServer" :disabled="busy" placeholder="time.cloudflare.com" :maxlength="253" />
      </n-form-item>
    </div>

    <div class="setup-actions">
      <n-button v-if="step > 1" :disabled="busy" @click="previous">
        <template #icon><ArrowLeft /></template>
        {{ t('auth.back', 'Back') }}
      </n-button>
      <n-button v-if="step < 3" type="primary" attr-type="submit" :disabled="busy || !canAdvance">
        <template #icon><ArrowRight /></template>
        {{ t('common.next', 'Next') }}
      </n-button>
      <n-button v-else type="primary" attr-type="submit" :loading="busy" :disabled="!valid">
        <template #icon><ArrowRight /></template>
        {{ t('auth.initializeButton', 'Initialize') }}
      </n-button>
    </div>
  </n-form>
</template>

<style scoped>
.auth-setup-desktop {
  width: min(620px, calc(100vw - 32px));
  max-height: calc(100dvh - 32px);
  overflow-y: auto;
}

.setup-steps { margin-bottom: 24px; }
.setup-steps :deep(.n-step:last-child) { flex: 0 0 auto; }
.setup-actions { margin-top: 24px; }
.setup-region-fields :deep(.n-select) { width: 100%; }
.setup-time-preview { display: grid; gap: 4px; }
.setup-time-preview strong { font-size: 22px; font-weight: 650; }
.setup-time-row { padding: 12px 0; margin-bottom: 16px; }
.setup-time-row strong { font-size: 14px; }
</style>
