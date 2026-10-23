<script setup lang="ts">
import { computed } from 'vue'
import { t } from '@/i18n/runtime'
import type { SecuritySettingsForm } from '@/composables/useSecuritySettings'

const form = defineModel<SecuritySettingsForm>({ required: true })
defineProps<{ disabled: boolean }>()
const scopeOptions = computed(() => [
  { label: t('settings.advancedSettings.securityPage.loginProtectionIp'), value: 'ip' },
  { label: t('settings.advancedSettings.securityPage.loginProtectionSubnet'), value: 'subnet' },
])
</script>

<template>
  <div>
    <n-form label-placement="top" :show-feedback="false" :disabled="disabled" class="api-protection-form">
      <n-form-item :label="t('settings.advancedSettings.securityPage.apiMaxFailures')" :label-props="{ for: 'api-max-paths' }">
        <n-input-number v-model:value="form.apiMaxFailures" :min="1" :max="100" :precision="0" :input-props="{ id: 'api-max-paths' }" />
      </n-form-item>
      <n-form-item :label="t('settings.advancedSettings.securityPage.apiWindow')" :label-props="{ for: 'api-window' }">
        <n-input-number v-model:value="form.apiWindowSeconds" :min="1" :max="3600" :precision="0" :input-props="{ id: 'api-window' }"><template #suffix>{{ t('settings.advancedSettings.securityPage.seconds') }}</template></n-input-number>
      </n-form-item>
      <n-form-item :label="t('settings.advancedSettings.securityPage.loginProtectionBanDuration')" :label-props="{ for: 'api-ban-duration' }">
        <n-input-number v-model:value="form.apiBanDurationSeconds" :min="1" :max="2592000" :precision="0" :step="60" :input-props="{ id: 'api-ban-duration' }"><template #suffix>{{ t('settings.advancedSettings.securityPage.seconds') }}</template></n-input-number>
      </n-form-item>
      <n-form-item :label="t('settings.advancedSettings.securityPage.loginProtectionScope')" :label-props="{ id: 'api-scope-label' }">
        <n-select v-model:value="form.apiScope" :options="scopeOptions" aria-labelledby="api-scope-label" />
      </n-form-item>
      <template v-if="form.apiScope === 'subnet'">
        <n-form-item :label="t('settings.advancedSettings.securityPage.loginProtectionIpv4Prefix')" :label-props="{ for: 'api-ipv4-prefix' }">
          <n-input-number v-model:value="form.apiIpv4Prefix" :min="1" :max="32" :precision="0" :input-props="{ id: 'api-ipv4-prefix' }"><template #prefix>/</template></n-input-number>
        </n-form-item>
        <n-form-item :label="t('settings.advancedSettings.securityPage.loginProtectionIpv6Prefix')" :label-props="{ for: 'api-ipv6-prefix' }">
          <n-input-number v-model:value="form.apiIpv6Prefix" :min="1" :max="128" :precision="0" :input-props="{ id: 'api-ipv6-prefix' }"><template #prefix>/</template></n-input-number>
        </n-form-item>
      </template>
      <n-form-item :label="t('settings.advancedSettings.securityPage.apiRate')" :label-props="{ for: 'api-rate' }">
        <n-input-number v-model:value="form.apiRequestsPerSecond" :min="1" :max="1000" :precision="0" :input-props="{ id: 'api-rate' }" />
      </n-form-item>
      <n-form-item :label="t('settings.advancedSettings.securityPage.apiBurst')" :label-props="{ for: 'api-burst' }">
        <n-input-number v-model:value="form.apiBurst" :min="1" :max="1000" :precision="0" :input-props="{ id: 'api-burst' }" />
      </n-form-item>
    </n-form>
  </div>
</template>

<style scoped>
.api-protection-form { display: grid; gap: 16px; }
.api-protection-form :deep(.n-input-number) { width: 100%; }
@media (max-width: 760px) { .api-protection-form { grid-template-columns: 1fr; } }
</style>
