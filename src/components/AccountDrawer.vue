<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useMessage } from 'naive-ui'

import { useAuth } from '@/composables/useAuth'
import { t } from '@/i18n/runtime'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  'update:show': [show: boolean]
}>()

const message = useMessage()
const { auth, updateAccount } = useAuth()
const saving = ref(false)
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

watch(
  () => props.show,
  (show) => {
    if (show) account.username = auth.username || 'admin'
    else clearPasswords()
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
    </n-drawer-content>
  </n-drawer>
</template>
