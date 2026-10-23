<script setup lang="ts">
import { t } from '@/i18n/runtime'

const enabled = defineModel<boolean>({ required: true })
defineProps<{ disabled: boolean }>()
</script>

<template>
  <section class="disguise-setting" aria-labelledby="server-disguise-heading">
    <div class="disguise-content">
      <h2 id="server-disguise-heading">{{ t('settings.advancedSettings.securityPage.serverDisguise') }}</h2>
      <p>{{ t('settings.advancedSettings.securityPage.serverDisguiseHint') }}</p>
      <code>Server: Microsoft-IIS/6.0<br>X-Powered-By: PHP/5.2.17</code>
    </div>
    <n-switch v-model:value="enabled" :disabled="disabled" class="disguise-switch" aria-labelledby="server-disguise-heading" />
  </section>
</template>

<style scoped>
.disguise-setting { display: flex; align-items: center; gap: 24px; }
.disguise-content { flex: 1; min-width: 0; }
.disguise-switch { flex-shrink: 0; }
h2 { margin: 0; color: var(--foreground); font-size: 16px; font-weight: 600; }
p { margin: 8px 0; color: var(--muted-foreground); line-height: 1.6; }
code { color: var(--onekvm-text-secondary); font-size: 12px; line-height: 1.8; overflow-wrap: anywhere; }
</style>
