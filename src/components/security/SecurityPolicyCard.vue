<script setup lang="ts">
import { Settings2 } from '@/icons'
import { t } from '@/i18n/runtime'

const enabled = defineModel<boolean>({ required: true })
defineProps<{ id: string; title: string; hint: string; disabled: boolean }>()
const emit = defineEmits<{ configure: [] }>()
</script>

<template>
  <section class="security-policy-card" :aria-labelledby="id">
    <div class="security-policy-copy">
      <h2 :id="id">{{ title }}</h2>
      <p>{{ hint }}</p>
    </div>
    <div class="security-policy-controls">
      <n-tooltip>
        <template #trigger>
          <n-button size="small" secondary :aria-label="`${title} · ${t('settings.advancedSettings.securityPage.advancedSettings')}`" aria-haspopup="dialog" @click="emit('configure')">
            <template #icon><Settings2 aria-hidden="true" /></template>
            <span class="security-policy-button-label">{{ t('settings.advancedSettings.securityPage.advancedSettings') }}</span>
          </n-button>
        </template>
        {{ t('settings.advancedSettings.securityPage.advancedSettings') }}
      </n-tooltip>
      <n-switch v-model:value="enabled" :disabled="disabled" :aria-labelledby="id" />
    </div>
  </section>
</template>

<style scoped>
.security-policy-card { display: flex; align-items: center; gap: 24px; }
.security-policy-copy { flex: 1; min-width: 0; }
h2 { margin: 0; color: var(--foreground); font-size: 16px; font-weight: 600; }
p { margin: 8px 0 0; color: var(--muted-foreground); line-height: 1.6; }
.security-policy-controls { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
@media (max-width: 600px) {
  .security-policy-card { gap: 16px; }
  .security-policy-button-label { display: none; }
  .security-policy-controls :deep(.n-button) { width: 32px; padding: 0; }
  .security-policy-controls :deep(.n-button__icon) { margin: 0; }
}
</style>
