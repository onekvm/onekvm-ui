<script setup lang="ts">
import { shallowRef } from 'vue'
import { useLoginBans } from '@/composables/useLoginBans'
import { t } from '@/i18n/runtime'
import { Plus, RefreshCw } from '@/icons'
import BlockedAddressList from './BlockedAddressList.vue'
import ManualLoginBanDialog from './ManualLoginBanDialog.vue'

const props = defineProps<{ revision: number; canManage: boolean }>()
const { activeBans, now, loading, refreshing, loaded, removing, error, acceptBans, refresh, remove } = useLoginBans(() => props.revision)
const adding = shallowRef(false)
</script>

<template>
  <section aria-labelledby="blocked-addresses-heading">
    <header class="blocked-addresses-header">
      <h2 id="blocked-addresses-heading">
        {{ t('settings.advancedSettings.securityPage.blockedAddresses', 'Blocked network addresses') }}
        <n-tag v-if="loaded && !error" size="small" :bordered="false" round>{{ activeBans.length }}</n-tag>
      </h2>
      <div class="blocked-addresses-actions">
        <n-button secondary :loading="refreshing" @click="refresh">
          <template #icon><RefreshCw aria-hidden="true" /></template>
          {{ t('common.refresh', 'Refresh') }}
        </n-button>
        <n-button v-if="canManage" type="primary" @click="adding = true">
          <template #icon><Plus aria-hidden="true" /></template>
          {{ t('settings.advancedSettings.securityPage.addBan', 'Block address') }}
        </n-button>
      </div>
    </header>
    <p class="blocked-addresses-hint">{{ t('settings.advancedSettings.securityPage.blockedAddressesHint', 'Blocks expire automatically. The list updates automatically.') }}</p>
    <n-alert v-if="error" type="error" :bordered="false" class="blocked-addresses-error">{{ error }}</n-alert>
    <n-spin :show="loading">
      <n-empty v-if="loaded && !error && !activeBans.length" class="blocked-addresses-empty" :description="t('settings.advancedSettings.securityPage.empty', 'No blocked network addresses')" />
      <BlockedAddressList v-else-if="activeBans.length" :bans="activeBans" :now="now" :can-manage="canManage" :removing="removing" @remove="remove" />
    </n-spin>
    <ManualLoginBanDialog v-if="canManage" v-model:show="adding" @added="acceptBans" />
  </section>
</template>

<style scoped>
.blocked-addresses-header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; }
h2 { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0; color: var(--foreground); font-size: 16px; font-weight: 600; }
.blocked-addresses-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.blocked-addresses-hint { margin: 8px 0 20px; color: var(--muted-foreground); line-height: 1.6; }
.blocked-addresses-error { margin-bottom: 16px; }
.blocked-addresses-empty { padding: 32px 0; }
</style>
