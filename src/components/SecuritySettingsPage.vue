<script setup lang="ts">
import { computed } from 'vue'
import { hasPermission } from '@/build'
import { useAuth } from '@/composables/useAuth'
import { useSecuritySettings } from '@/composables/useSecuritySettings'
import { useSecurityPolicyDrawer } from '@/composables/useSecurityPolicyDrawer'
import { t } from '@/i18n/runtime'
import { RefreshCw, Save } from '@/icons'
import BlockedAddressesPanel from './security/BlockedAddressesPanel.vue'
import LoginProtectionSettings from './security/LoginProtectionSettings.vue'
import ApiProtectionSettings from './security/ApiProtectionSettings.vue'
import ServerDisguiseSettings from './security/ServerDisguiseSettings.vue'
import HoneypotSettings from './security/HoneypotSettings.vue'
import ReverseProxySettings from './security/ReverseProxySettings.vue'
import SecurityPolicyCard from './security/SecurityPolicyCard.vue'
import SecurityPolicyDrawer from './security/SecurityPolicyDrawer.vue'

const { auth } = useAuth()
const canManage = computed(() => hasPermission(auth, 'settings.manage'))
const { form, loading, saving, error, dirty, valid, revision, load, save } = useSecuritySettings()
const { show: policyShow, policy, draft, dirty: policyDirty, valid: policyValid, open, apply } = useSecurityPolicyDrawer(form, save)
const policyTitle = computed(() => t(`settings.advancedSettings.securityPage.${policy.value === 'login' ? 'loginProtection' : policy.value === 'api' ? 'apiProtection' : 'reverseProxy'}`))
</script>

<template>
  <div class="security-settings-page">
    <BlockedAddressesPanel :revision="revision" :can-manage="canManage" class="security-panel" />
    <n-alert v-if="error" type="error" :bordered="false">
      {{ error }}
      <template v-if="!form" #action>
        <n-button :loading="loading" @click="load">
          <template #icon><RefreshCw aria-hidden="true" /></template>
          {{ t('common.retry', 'Retry') }}
        </n-button>
      </template>
    </n-alert>
    <n-spin :show="loading">
      <div v-if="form" class="security-settings-sections">
        <SecurityPolicyCard id="login-protection-heading" v-model="form.enabled" :disabled="!canManage || saving"
          :title="t('settings.advancedSettings.securityPage.loginProtection')" :hint="t('settings.advancedSettings.securityPage.loginProtectionHint')" class="security-panel" @configure="open('login')" />
        <SecurityPolicyCard id="api-protection-heading" v-model="form.apiProtection" :disabled="!canManage || saving"
          :title="t('settings.advancedSettings.securityPage.apiProtection')" :hint="t('settings.advancedSettings.securityPage.apiProtectionHint')" class="security-panel" @configure="open('api')" />
        <SecurityPolicyCard id="reverse-proxy-heading" v-model="form.reverseProxy.enabled" :disabled="!canManage || saving"
          :title="t('settings.advancedSettings.securityPage.reverseProxy')" :hint="t('settings.advancedSettings.securityPage.reverseProxyHint')" class="security-panel" @configure="open('proxy')" />
        <ServerDisguiseSettings v-model="form.serverDisguise" :disabled="!canManage || saving" class="security-panel" />
        <HoneypotSettings v-model="form.honeypotEnabled" :disabled="!canManage || saving" :api-protection="form.apiProtection" class="security-panel" />
        <section class="security-panel">
          <div class="security-toggle-row">
            <div>
              <h2 id="crash-recovery-heading">{{ t('settings.advancedSettings.securityPage.crashRecovery', 'Crash recovery') }}</h2>
              <p class="security-hint">{{ t('settings.advancedSettings.securityPage.crashRecoveryEnabled', 'Enter Recovery after repeated crash restarts') }}</p>
            </div>
            <n-switch v-model:value="form.crashRecovery" :disabled="!canManage || saving" aria-labelledby="crash-recovery-heading" />
          </div>
        </section>
        <footer v-if="canManage" class="security-actions">
          <n-button type="primary" :loading="saving" :disabled="loading || !dirty || !valid" @click="save">
            <template #icon><Save aria-hidden="true" /></template>
            {{ t('common.save', 'Save') }}
          </n-button>
        </footer>
      </div>
    </n-spin>
    <SecurityPolicyDrawer v-model:show="policyShow" :title="policyTitle" :saving="saving" :dirty="policyDirty" :valid="policyValid" :can-manage="canManage" :error="error" @save="apply">
      <template v-if="draft">
        <LoginProtectionSettings v-if="policy === 'login'" v-model="draft" :disabled="!canManage || saving" />
        <ApiProtectionSettings v-else-if="policy === 'api'" v-model="draft" :disabled="!canManage || saving" />
        <ReverseProxySettings v-else v-model="draft.reverseProxy" :disabled="!canManage || saving" />
      </template>
    </SecurityPolicyDrawer>
  </div>
</template>

<style scoped>
.security-settings-page, .security-settings-sections { display: grid; gap: 20px; min-width: 0; }
.security-panel { min-width: 0; padding: 20px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); }
h2 { margin: 0; color: var(--foreground); font-size: 16px; font-weight: 600; }
.security-toggle-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.security-hint { margin: 8px 0 0; color: var(--muted-foreground); line-height: 1.6; }
.security-actions { display: flex; justify-content: flex-end; }
@media (max-width: 760px) { .security-panel { padding: 16px; } }
</style>
