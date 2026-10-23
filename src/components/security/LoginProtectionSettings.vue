<script setup lang="ts">
import { computed } from 'vue'
import { t } from '@/i18n/runtime'
import type { SecuritySettingsForm } from '@/composables/useSecuritySettings'

const form = defineModel<SecuritySettingsForm>({ required: true })
defineProps<{ disabled: boolean }>()
const scopeOptions = computed(() => [
  { label: t('settings.advancedSettings.securityPage.loginProtectionSubnet', 'Subnet'), value: 'subnet' },
  { label: t('settings.advancedSettings.securityPage.loginProtectionIp', 'Single IP'), value: 'ip' },
])
</script>

<template>
  <div>
    <n-form label-placement="top" :show-feedback="false" :disabled="disabled" class="security-form">
      <n-form-item :label="t('settings.advancedSettings.securityPage.loginProtectionMaxFailures', 'Failed attempts before blocking')" :label-props="{ for: 'security-max-failures' }">
        <n-input-number v-model:value="form.maxFailures" :min="1" :max="100" :precision="0" :input-props="{ id: 'security-max-failures' }" />
      </n-form-item>
      <n-form-item :label="t('settings.advancedSettings.securityPage.loginProtectionBanDuration', 'Block duration')" :label-props="{ for: 'security-ban-duration' }">
        <n-input-number v-model:value="form.banDurationHours" :min="1 / 3600" :max="720" :step="1" :input-props="{ id: 'security-ban-duration' }">
          <template #suffix>{{ t('settings.advancedSettings.securityPage.hours', 'hours') }}</template>
        </n-input-number>
      </n-form-item>
      <n-form-item :label="t('settings.advancedSettings.securityPage.loginProtectionScope', 'Block target')" :label-props="{ id: 'security-scope-label' }">
        <n-select v-model:value="form.scope" :options="scopeOptions" aria-labelledby="security-scope-label" />
      </n-form-item>
      <template v-if="form.scope === 'subnet'">
        <n-form-item :label="t('settings.advancedSettings.securityPage.loginProtectionIpv4Prefix', 'IPv4 subnet prefix')" :label-props="{ for: 'security-ipv4-prefix' }">
          <n-input-number v-model:value="form.ipv4Prefix" :min="1" :max="32" :precision="0" :input-props="{ id: 'security-ipv4-prefix' }">
            <template #prefix>/</template>
          </n-input-number>
        </n-form-item>
        <n-form-item :label="t('settings.advancedSettings.securityPage.loginProtectionIpv6Prefix', 'IPv6 subnet prefix')" :label-props="{ for: 'security-ipv6-prefix' }">
          <n-input-number v-model:value="form.ipv6Prefix" :min="1" :max="128" :precision="0" :input-props="{ id: 'security-ipv6-prefix' }">
            <template #prefix>/</template>
          </n-input-number>
        </n-form-item>
      </template>
    </n-form>
    <div class="security-weak-credentials">
      <div class="security-toggle-row">
        <div class="security-toggle-copy">
          <label id="weak-credentials-label">{{ t('settings.advancedSettings.securityPage.blockWeakCredentials', 'Immediately block weak login combinations') }}</label>
          <p class="security-hint">{{ t('settings.advancedSettings.securityPage.blockWeakCredentialsHint', 'Weak login combinations trigger an immediate ban using your login protection scope and duration.') }}</p>
        </div>
        <n-switch v-model:value="form.blockWeakCredentials" :disabled="disabled" aria-labelledby="weak-credentials-label" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.security-toggle-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.security-toggle-copy { min-width: 0; }
.security-hint { margin: 8px 0 20px; color: var(--muted-foreground); line-height: 1.6; }
.security-form { display: grid; gap: 16px; }
.security-form :deep(.n-input-number) { width: 100%; }
.security-weak-credentials { margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--border); }
.security-weak-credentials .security-hint { margin-bottom: 0; }
@media (max-width: 760px) { .security-form { grid-template-columns: 1fr; } }
</style>
