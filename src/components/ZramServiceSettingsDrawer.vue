<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { useMessage } from 'naive-ui'

import { api } from '@/api/client'
import { t } from '@/i18n/runtime'

const show = defineModel<boolean>('show', { required: true })

const message = useMessage()
const loading = shallowRef(false)
const saving = shallowRef(false)
const error = shallowRef('')
const sizeMb = shallowRef(16)
const maxSizeMb = shallowRef(128)

const invalidMessage = computed(() =>
  t(
    'settings.advancedSettings.servicesPage.zramInvalid',
    'ZRAM size must be between 0 and {max} MiB',
  ).replace('{max}', String(maxSizeMb.value)),
)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const settings = await api.getZramServiceSettings()
    maxSizeMb.value = settings.max_size_mb && settings.max_size_mb > 0 ? settings.max_size_mb : 128
    sizeMb.value = Math.min(Math.max(settings.size_mb, 0), maxSizeMb.value)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    loading.value = false
  }
}

async function save() {
  if (saving.value) return
  const size = sizeMb.value
  if (size < 0 || size > maxSizeMb.value) {
    error.value = invalidMessage.value
    return
  }
  saving.value = true
  error.value = ''
  try {
    const settings = await api.saveZramServiceSettings({ size_mb: size })
    if (settings.max_size_mb && settings.max_size_mb > 0) maxSizeMb.value = settings.max_size_mb
    sizeMb.value = settings.size_mb
    message.success(t('settings.success', 'Settings saved'))
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    saving.value = false
  }
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
    <n-drawer-content :title="t('settings.advancedSettings.servicesPage.zramSettings', 'ZRAM settings')" closable>
      <n-spin :show="loading">
        <n-alert v-if="error" type="error" :bordered="false" class="service-settings-error">{{ error }}</n-alert>
        <n-form label-placement="top" :show-feedback="false" class="settings-form service-settings-form">
          <n-form-item :label="t('settings.advancedSettings.servicesPage.zramSize', 'Size')">
            <n-input-number
              :value="sizeMb"
              :min="0"
              :max="maxSizeMb"
              :precision="0"
              class="service-settings-number"
              @update:value="sizeMb = $event ?? 0"
            >
              <template #suffix>MiB</template>
            </n-input-number>
          </n-form-item>
        </n-form>
        <p class="service-settings-hint">
          {{ t('settings.advancedSettings.servicesPage.zramHint', 'Compresses RAM and uses it as swap. At most 25% of system memory. Set 0 to turn it off.') }}
        </p>
        <div class="drawer-actions service-settings-footer">
          <n-button type="primary" :loading="saving" @click="save">{{ t('common.save', 'Save') }}</n-button>
        </div>
      </n-spin>
    </n-drawer-content>
  </n-drawer>
</template>
