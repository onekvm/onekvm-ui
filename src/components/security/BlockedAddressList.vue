<script setup lang="ts">
import { computed } from 'vue'
import type { LoginBan } from '@/api/client'
import { t } from '@/i18n/runtime'

const props = defineProps<{ bans: LoginBan[]; now: number; canManage: boolean; removing: string }>()
const emit = defineEmits<{ remove: [id: string] }>()
const rows = computed(() => props.bans.map(ban => {
  const seconds = ban.expires_at === null ? null : Math.max(0, Math.ceil(ban.expires_at - props.now / 1000))
  const hours = seconds === null ? 0 : Math.floor(seconds / 3600)
  const minutes = seconds === null ? 0 : Math.floor((seconds % 3600) / 60)
  return {
    ...ban,
    reasonLabel: (ban.source === 'api_scan' || ban.source === 'honeypot')
      ? t(`settings.advancedSettings.securityPage.apiReason_${ban.reason}`, t('settings.advancedSettings.securityPage.apiProtection'))
      : ban.source === 'manual' ? ban.reason : ban.source === 'weak_credentials'
      ? t('settings.advancedSettings.securityPage.weakCredentialsReason', 'Weak login combination')
      : t('settings.advancedSettings.securityPage.failedLoginsReason', 'Repeated failed logins'),
    sourceLabel: ban.source === 'manual' ? t('settings.advancedSettings.securityPage.manual', 'Manual')
      : t('settings.advancedSettings.securityPage.automatic', 'Automatic'),
    triggerLabel: ban.address.includes('/') && ban.trigger_ip
      ? t('settings.advancedSettings.securityPage.triggeredBy', 'Triggered by {ip}').replace('{ip}', ban.trigger_ip) : '',
    expiration: ban.expires_at === null ? t('settings.advancedSettings.securityPage.permanent', 'Permanent') : new Date(ban.expires_at * 1000).toLocaleString(),
    remaining: seconds === null ? t('settings.advancedSettings.securityPage.permanent', 'Permanent')
      : hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m ${seconds % 60}s`,
  }
}))
</script>

<template>
  <div class="blocked-list-desktop">
    <table>
      <thead><tr>
        <th scope="col">{{ t('settings.advancedSettings.securityPage.address', 'Network address') }}</th>
        <th scope="col">{{ t('settings.advancedSettings.securityPage.reason', 'Reason') }}</th>
        <th scope="col">{{ t('settings.advancedSettings.securityPage.expiresAt', 'Expires at') }}</th>
        <th scope="col">{{ t('settings.advancedSettings.securityPage.remaining', 'Time remaining') }}</th>
        <th v-if="canManage" scope="col"><span class="blocked-action-label">{{ t('settings.advancedSettings.securityPage.unblock', 'Unblock') }}</span></th>
      </tr></thead>
      <tbody><tr v-for="ban in rows" :key="ban.id">
        <td class="blocked-address">{{ ban.address }}</td>
        <td class="blocked-reason">{{ ban.reasonLabel }}<small v-if="ban.triggerLabel" class="blocked-trigger">{{ ban.triggerLabel }}</small><small>{{ ban.sourceLabel }}<template v-if="ban.source !== 'manual' && ban.source !== 'api_scan' && ban.source !== 'honeypot'"> · {{ t('settings.advancedSettings.securityPage.failures', 'Failed attempts') }}: {{ ban.failures }}</template></small></td>
        <td>{{ ban.expiration }}</td>
        <td>{{ ban.remaining }}</td>
        <td v-if="canManage"><n-button size="small" secondary :loading="removing === ban.id" :disabled="Boolean(removing) && removing !== ban.id" :aria-label="`${t('settings.advancedSettings.securityPage.unblock', 'Unblock')} ${ban.address}`" @click="emit('remove', ban.id)">{{ t('settings.advancedSettings.securityPage.unblock', 'Unblock') }}</n-button></td>
      </tr></tbody>
    </table>
  </div>
  <ul class="blocked-list-mobile">
    <li v-for="ban in rows" :key="ban.id">
      <div class="blocked-mobile-header">
        <span class="blocked-address">{{ ban.address }}</span>
        <n-button v-if="canManage" size="small" secondary :loading="removing === ban.id" :disabled="Boolean(removing) && removing !== ban.id" :aria-label="`${t('settings.advancedSettings.securityPage.unblock', 'Unblock')} ${ban.address}`" @click="emit('remove', ban.id)">{{ t('settings.advancedSettings.securityPage.unblock', 'Unblock') }}</n-button>
      </div>
      <p class="blocked-reason">{{ ban.reasonLabel }}<small v-if="ban.triggerLabel" class="blocked-trigger">{{ ban.triggerLabel }}</small><small>{{ ban.sourceLabel }}<template v-if="ban.source !== 'manual' && ban.source !== 'api_scan' && ban.source !== 'honeypot'"> · {{ t('settings.advancedSettings.securityPage.failures', 'Failed attempts') }}: {{ ban.failures }}</template></small></p>
      <dl>
        <div><dt>{{ t('settings.advancedSettings.securityPage.expiresAt', 'Expires at') }}</dt><dd>{{ ban.expiration }}</dd></div>
        <div v-if="ban.expires_at !== null"><dt>{{ t('settings.advancedSettings.securityPage.remaining', 'Time remaining') }}</dt><dd>{{ ban.remaining }}</dd></div>
      </dl>
    </li>
  </ul>
</template>

<style scoped>
.blocked-list-desktop { overflow-x: auto; }
.blocked-action-label { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
table { width: 100%; border-collapse: collapse; text-align: left; font-variant-numeric: tabular-nums; }
th { padding: 12px; color: var(--muted-foreground); font-size: 12px; font-weight: 500; white-space: nowrap; }
td { padding: 12px; border-top: 1px solid var(--border); color: var(--onekvm-text-secondary); white-space: nowrap; }
.blocked-address { color: var(--foreground); font-family: var(--font-family-mono, monospace); overflow-wrap: anywhere; white-space: normal; }
.blocked-reason { min-width: 120px; max-width: 280px; overflow-wrap: anywhere; white-space: normal; }
.blocked-reason small { display: block; margin-top: 4px; color: var(--muted-foreground); font-size: 12px; }
.blocked-reason .blocked-trigger { color: var(--onekvm-text-secondary); }
.blocked-list-mobile { display: none; }
@media (max-width: 760px) {
  .blocked-list-desktop { display: none; }
  .blocked-list-mobile { display: grid; gap: 16px; margin: 0; padding: 0; list-style: none; }
  li { padding-top: 16px; border-top: 1px solid var(--border); }
  .blocked-mobile-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .blocked-mobile-header .n-button { flex-shrink: 0; }
  .blocked-reason { max-width: none; margin: 12px 0; }
  dl { display: grid; gap: 8px; margin: 0; font-size: 12px; font-variant-numeric: tabular-nums; }
  dl > div { display: flex; justify-content: space-between; gap: 12px; }
  dt { flex-shrink: 0; color: var(--muted-foreground); }
  dd { margin: 0; color: var(--onekvm-text-secondary); text-align: right; }
}
</style>
