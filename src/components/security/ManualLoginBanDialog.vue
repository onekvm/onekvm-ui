<script setup lang="ts">
import { computed, reactive, shallowRef, watch } from 'vue'
import { NConfigProvider, NDatePicker, dateEnUS, dateZhCN, dateZhTW, enUS, zhCN, zhTW, type FormInst, type FormItemInst, type FormRules } from 'naive-ui'
import { api, type LoginBan } from '@/api/client'
import { useOverlayMount } from '@/composables/useOverlayMount'
import { currentLanguage, t } from '@/i18n/runtime'
import { isIPv4, isIPv6, validCIDR } from '@/lib/network'

const show = defineModel<boolean>('show', { required: true })
const emit = defineEmits<{ added: [bans: LoginBan[]] }>()
const overlayTo = useOverlayMount()
const pickerLocale = computed(() => currentLanguage.value === 'zh' ? { locale: zhCN, dateLocale: dateZhCN }
  : currentLanguage.value === 'zh_tw' ? { locale: zhTW, dateLocale: dateZhTW } : { locale: enUS, dateLocale: dateEnUS })
const formRef = shallowRef<FormInst>()
const expiryRef = shallowRef<FormItemInst>()
const draft = reactive({ address: '', reason: '', expiresAt: null as number | null })
const saving = shallowRef(false)
const error = shallowRef('')
const expiryPresets = computed(() => [
  { seconds: 3600, label: t('settings.advancedSettings.securityPage.expiryOneHour', '1 hour') },
  { seconds: 86400, label: t('settings.advancedSettings.securityPage.expiryOneDay', '24 hours') },
  { seconds: 604800, label: t('settings.advancedSettings.securityPage.expiryOneWeek', '7 days') },
  { seconds: 2592000, label: t('settings.advancedSettings.securityPage.expiryOneMonth', '30 days') },
])
const rules = computed<FormRules>(() => ({
  address: { trigger: ['input', 'blur'], validator: () => {
    const value = draft.address.trim()
    return isIPv4(value) || isIPv6(value) || validCIDR(value, 4) || validCIDR(value, 6)
      || new Error(t('settings.advancedSettings.securityPage.invalidAddress', 'Enter a valid IP address or CIDR'))
  } },
  reason: { trigger: ['input', 'blur'], validator: () => Boolean(draft.reason.trim())
    || new Error(t('settings.advancedSettings.securityPage.reasonRequired', 'Enter a reason for this block')) },
  expiresAt: { trigger: ['change', 'blur'], validator: () => draft.expiresAt === null || draft.expiresAt > Date.now()
    || new Error(t('settings.advancedSettings.securityPage.expiryFuture', 'Expiration must be in the future')) },
}))

watch(show, open => {
  if (!open) return
  Object.assign(draft, { address: '', reason: '', expiresAt: null })
  error.value = ''
  formRef.value?.restoreValidation()
})

function selectExpiry(seconds: number | null) {
  draft.expiresAt = seconds === null ? null : Date.now() + seconds * 1000
  expiryRef.value?.restoreValidation()
}

async function submit() {
  if (saving.value) return
  try { await formRef.value?.validate() } catch { return }
  saving.value = true
  error.value = ''
  try {
    const bans = await api.addLoginBan({
      address: draft.address.trim(), reason: draft.reason.trim(),
      expires_at: draft.expiresAt === null ? null : Math.floor(draft.expiresAt / 1000),
    })
    emit('added', bans)
    show.value = false
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <n-modal v-model:show="show" preset="card" :to="overlayTo" :z-index="4600"
    :style="{ width: 'min(500px, calc(100vw - 32px))' }"
    :title="t('settings.advancedSettings.securityPage.addBan', 'Block address')"
    :mask-closable="!saving" :closable="!saving" :close-on-esc="!saving">
    <p class="manual-ban-hint">{{ t('settings.advancedSettings.securityPage.manualBanHint', 'Blocks logins from this address, even when login protection is off.') }}</p>
    <n-form ref="formRef" :model="draft" :rules="rules" label-placement="top" :disabled="saving" @submit.prevent="submit">
      <n-form-item path="address" :label="t('settings.advancedSettings.securityPage.address', 'Network address')" :label-props="{ for: 'manual-ban-address' }">
        <n-input v-model:value="draft.address" autofocus :input-props="{ id: 'manual-ban-address', spellcheck: false }" placeholder="192.0.2.10 / 192.0.2.0/24 / 2001:db8::/64" />
      </n-form-item>
      <n-form-item path="reason" :label="t('settings.advancedSettings.securityPage.reason', 'Reason')" :label-props="{ for: 'manual-ban-reason' }">
        <n-input v-model:value="draft.reason" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }" :maxlength="256" show-count :input-props="{ id: 'manual-ban-reason' }" :placeholder="t('settings.advancedSettings.securityPage.reasonPlaceholder', 'Why is this address being blocked?')" />
      </n-form-item>
      <n-form-item ref="expiryRef" path="expiresAt" :label="t('settings.advancedSettings.securityPage.expiresAt', 'Expires at')" :label-props="{ id: 'manual-ban-expiry-label' }">
        <NConfigProvider :locale="pickerLocale.locale" :date-locale="pickerLocale.dateLocale" class="manual-ban-picker-locale">
          <NDatePicker v-model:value="draft.expiresAt" type="datetime" format="yyyy-MM-dd HH:mm:ss" clearable
            class="manual-ban-expiry" role="group" aria-labelledby="manual-ban-expiry-label" :placeholder="t('settings.advancedSettings.securityPage.expiresAt', 'Expires at')" />
          <div class="manual-ban-expiry-presets" role="group" :aria-label="t('settings.advancedSettings.securityPage.expiryShortcuts', 'Quick expiration')">
            <n-button v-for="preset in expiryPresets" :key="preset.seconds" size="small" secondary :disabled="saving" @click="selectExpiry(preset.seconds)">{{ preset.label }}</n-button>
            <n-button size="small" secondary :disabled="saving" @click="selectExpiry(null)">{{ t('settings.advancedSettings.securityPage.permanent', 'Permanent') }}</n-button>
          </div>
        </NConfigProvider>
      </n-form-item>
      <p class="manual-ban-hint">{{ t('settings.advancedSettings.securityPage.expiryHint', 'Leave empty to block permanently.') }}</p>
      <n-alert v-if="error" type="error" :bordered="false" class="manual-ban-error">{{ error }}</n-alert>
      <div class="manual-ban-actions">
        <n-button :disabled="saving" @click="show = false">{{ t('common.cancel', 'Cancel') }}</n-button>
        <n-button type="primary" attr-type="submit" :loading="saving">{{ t('settings.advancedSettings.securityPage.addBan', 'Block address') }}</n-button>
      </div>
    </n-form>
  </n-modal>
</template>

<style scoped>
.manual-ban-hint { margin: 0 0 16px; color: var(--muted-foreground); line-height: 1.6; }
.manual-ban-expiry, .manual-ban-picker-locale { width: 100%; }
.manual-ban-expiry-presets { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.manual-ban-error { margin-bottom: 16px; }
.manual-ban-actions { display: flex; justify-content: flex-end; gap: 8px; }
</style>
