<script setup lang="ts">
import { reactive, shallowRef, watch } from 'vue'
import { useMessage } from 'naive-ui'

import { api, type SSHServiceSettings } from '@/api/client'
import { t } from '@/i18n/runtime'
import { splitAuthorizedKeyLines, splitAuthorizedKeyList } from '@/lib/authorized-keys'

const show = defineModel<boolean>('show', { required: true })

const message = useMessage()
const loading = shallowRef(false)
const saving = shallowRef(false)
const error = shallowRef('')
const form = reactive({
  sshPort: 22,
  authorizedKeys: [''] as string[],
})

function assignSSH(settings: SSHServiceSettings) {
  form.sshPort = settings.port
  const keys = splitAuthorizedKeyList(settings.authorized_keys || [])
  form.authorizedKeys = keys.length > 0 ? keys : ['']
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    assignSSH(await api.getSSHServiceSettings())
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    loading.value = false
  }
}

async function save() {
  if (saving.value) return
  saving.value = true
  error.value = ''
  try {
    assignSSH(await api.saveSSHServiceSettings({
      port: form.sshPort,
      authorized_keys: splitAuthorizedKeyList(form.authorizedKeys),
    }))
    message.success(t('settings.success', 'Settings saved'))
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    saving.value = false
  }
}

function addKey() {
  const last = form.authorizedKeys[form.authorizedKeys.length - 1]
  if (last !== undefined && last.trim() === '') return
  form.authorizedKeys.push('')
}

function removeKey(index: number) {
  form.authorizedKeys.splice(index, 1)
  if (form.authorizedKeys.length === 0) form.authorizedKeys.push('')
}

function setAuthorizedKey(index: number, value: string) {
  if (!/[\r\n]/.test(value)) {
    form.authorizedKeys[index] = value
    return
  }
  const lines = splitAuthorizedKeyLines(value)
  if (lines.length === 0) {
    form.authorizedKeys[index] = ''
    return
  }
  form.authorizedKeys.splice(index, 1, ...lines)
}

function trimAuthorizedKey(index: number) {
  const value = form.authorizedKeys[index]?.trim() ?? ''
  if (value) {
    form.authorizedKeys[index] = value
    return
  }
  if (form.authorizedKeys.length === 1) {
    form.authorizedKeys[index] = ''
    return
  }
  form.authorizedKeys.splice(index, 1)
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
    <n-drawer-content :title="t('settings.advancedSettings.servicesPage.sshSettings', 'SSH settings')" closable>
      <n-spin :show="loading">
        <n-alert v-if="error" type="error" :bordered="false" class="service-settings-error">{{ error }}</n-alert>

        <n-form label-placement="top" :show-feedback="false" class="settings-form">
          <n-form-item :label="t('settings.advancedSettings.servicesPage.sshPort', 'SSH port')">
            <n-input-number v-model:value="form.sshPort" :min="1" :max="65535" :step="1" class="service-settings-number" />
          </n-form-item>
        </n-form>
        <n-divider>{{ t('settings.advancedSettings.servicesPage.authorizedKeys', 'Allowed SSH public keys') }}</n-divider>
        <p class="service-settings-hint">
          {{ t('settings.advancedSettings.servicesPage.authorizedKeysHint', 'Only the keys listed here can use public-key authentication. Leave the list empty to use password authentication.') }}
        </p>
        <div class="authorized-key-list">
          <div v-for="(_, index) in form.authorizedKeys" :key="index" class="authorized-key-row">
            <n-input
              :value="form.authorizedKeys[index]"
              type="textarea"
              :autosize="{ minRows: 1, maxRows: 3 }"
              :placeholder="t('settings.advancedSettings.servicesPage.authorizedKeyPlaceholder', 'ssh-ed25519 AAAA...')"
              @update:value="setAuthorizedKey(index, $event)"
              @blur="trimAuthorizedKey(index)"
            />
            <n-button quaternary circle type="error" @click="removeKey(index)">×</n-button>
          </div>
        </div>
        <n-button dashed block @click="addKey">{{ t('settings.advancedSettings.servicesPage.addAuthorizedKey', 'Add public key') }}</n-button>

        <div class="drawer-actions service-settings-footer">
          <n-button type="primary" :loading="saving" @click="save">{{ t('common.save', 'Save') }}</n-button>
        </div>
      </n-spin>
    </n-drawer-content>
  </n-drawer>
</template>
