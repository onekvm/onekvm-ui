<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useMessage } from 'naive-ui'

import { api, type ExtensionSummary } from '@/api/client'
import { useAuth } from '@/composables/useAuth'
import { t } from '@/i18n/runtime'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  'update:show': [show: boolean]
}>()

const message = useMessage()
const { auth, updateAccount, refresh } = useAuth()
const saving = ref(false)
const totpBusy = ref(false)
const totpSecret = ref('')
const totpUrl = ref('')
const totpCode = ref('')
const backupCodes = ref<string[]>([])
const pluginBusy = ref('')
const authPlugins = ref<ExtensionSummary[]>([])
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
    backupCodes.value = []
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
    backupCodes.value = confirmed.backup_codes
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
  if (!account.currentPassword) {
    message.error(t('settings.account.currentPassword', 'Current password'))
    return
  }
  totpBusy.value = true
  try {
    await api.authTotpDisable(account.currentPassword)
    totpSecret.value = ''
    backupCodes.value = []
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
    message.success(t('settings.account.pluginEnabled', 'Hardware confirmation enabled'))
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : String(reason))
  } finally {
    pluginBusy.value = ''
  }
}

async function disablePlugin(id: string) {
  if (!account.currentPassword) {
    message.error(t('settings.account.currentPassword', 'Current password'))
    return
  }
  pluginBusy.value = id
  try {
    await api.authPluginDisable(id, account.currentPassword)
    await refresh()
    message.success(t('settings.account.pluginDisabled', 'Hardware confirmation disabled'))
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : String(reason))
  } finally {
    pluginBusy.value = ''
  }
}

function pluginEnrolled(id: string) {
  return Boolean(auth.mfa?.plugins?.some((plugin) => plugin.id === id))
}

watch(
  () => props.show,
  (show) => {
    if (show) {
      account.username = auth.username || 'admin'
      void loadAuthPlugins()
    } else {
      clearPasswords()
      totpSecret.value = ''
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
</script>

<template>
  <n-drawer
    :show="show"
    placement="right"
    :width="420"
    @update:show="emit('update:show', $event)"
  >
    <n-drawer-content :title="t('settings.account.title', 'Account')" closable>
      <n-form label-placement="top" :show-feedback="false" class="settings-form">
        <n-form-item :label="t('auth.placeholderUsername', 'Username')"><n-input v-model:value="account.username" autocomplete="username" /></n-form-item>
        <n-form-item :label="t('settings.account.currentPassword', 'Current password')"><n-input v-model:value="account.currentPassword" type="password" show-password-on="click" autocomplete="current-password" /></n-form-item>
        <n-form-item :label="t('settings.account.newPassword', 'New password')"><n-input v-model:value="account.newPassword" type="password" show-password-on="click" autocomplete="new-password" /></n-form-item>
        <n-form-item :label="t('settings.account.confirmPassword', 'Confirm password')"><n-input v-model:value="account.confirmPassword" type="password" show-password-on="click" autocomplete="new-password" :status="account.confirmPassword && account.confirmPassword !== account.newPassword ? 'error' : undefined" /></n-form-item>
      </n-form>
      <div class="drawer-actions"><n-button type="primary" :loading="saving" :disabled="!accountValid" @click="saveAccount">{{ t('common.save', 'Save') }}</n-button></div>
      <n-divider />
      <strong>{{ t('settings.account.mfa', 'Two-factor authentication') }}</strong>
      <p class="auth-mfa-help">{{ t('settings.account.mfaHelp', 'TOTP, backup codes, and hardware confirmation are optional.') }}</p>
      <div class="drawer-actions">
        <n-button v-if="!auth.mfa?.totp && !totpSecret" :loading="totpBusy" @click="beginTotp">{{ t('settings.account.enableTotp', 'Enable authenticator') }}</n-button>
        <n-button v-else-if="auth.mfa?.totp" :loading="totpBusy" @click="disableTotp">{{ t('settings.account.disableTotp', 'Disable authenticator') }}</n-button>
      </div>
      <n-form v-if="totpSecret" label-placement="top" :show-feedback="false" class="settings-form">
        <n-form-item :label="t('settings.account.totpSecret', 'TOTP secret')">
          <n-input :value="totpSecret" readonly />
        </n-form-item>
        <n-form-item :label="t('auth.totpCode', 'Authenticator code')">
          <n-input v-model:value="totpCode" maxlength="6" autocomplete="one-time-code" />
        </n-form-item>
        <n-button type="primary" :loading="totpBusy" :disabled="totpCode.trim().length !== 6" @click="confirmTotp">{{ t('settings.account.confirmTotp', 'Confirm authenticator') }}</n-button>
      </n-form>
      <n-alert v-if="backupCodes.length" type="warning" :bordered="false">
        {{ t('settings.account.backupCodes', 'Store these backup codes. Each code works once.') }}
        <div>{{ backupCodes.join(' ') }}</div>
      </n-alert>
      <div v-for="plugin in authPlugins" :key="plugin.id" class="drawer-actions">
        <span>{{ plugin.name }}</span>
        <n-button
          v-if="!pluginEnrolled(plugin.id)"
          size="small"
          :loading="pluginBusy === plugin.id"
          @click="enrollPlugin(plugin.id)"
        >
          {{ t('settings.account.enablePlugin', 'Enable') }}
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
    </n-drawer-content>
  </n-drawer>
</template>
