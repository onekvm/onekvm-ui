<script setup lang="ts">
import { t } from '@/i18n/runtime'

const enabled = defineModel<boolean>({ required: true })
defineProps<{ disabled: boolean; apiProtection: boolean }>()
</script>

<template>
  <section class="honeypot-setting" aria-labelledby="honeypot-heading">
    <div class="honeypot-content">
      <h2 id="honeypot-heading">{{ t('settings.advancedSettings.securityPage.honeypot') }}</h2>
      <p class="honeypot-hint">{{ t('settings.advancedSettings.securityPage.honeypotHint') }}</p>
      <p v-if="!apiProtection" class="honeypot-hint">{{ t('settings.advancedSettings.securityPage.honeypotNeedsApiProtection') }}</p>
    </div>
    <n-switch v-model:value="enabled" :disabled="disabled" class="honeypot-switch" aria-labelledby="honeypot-heading" />
  </section>
</template>

<style scoped>
.honeypot-setting { display: flex; align-items: center; gap: 24px; }
.honeypot-content { flex: 1; min-width: 0; }
.honeypot-switch { flex-shrink: 0; }
h2 { margin: 0; color: var(--foreground); font-size: 16px; font-weight: 600; }
.honeypot-hint { margin: 8px 0 0; color: var(--muted-foreground); line-height: 1.6; }
</style>
