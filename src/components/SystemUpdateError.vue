<script setup lang="ts">
import { computed } from 'vue'
import { systemUpdateErrorText } from '@/lib/system-update-error'
import { t } from '@/i18n/runtime'

const props = defineProps<{ error: string }>()
const summary = computed(() => systemUpdateErrorText(props.error, t))
</script>

<template>
  <div class="system-update-error-message">
    <span>{{ summary }}</span>
    <details v-if="summary !== error">
      <summary>{{ t('settings.advancedSettings.systemPage.updateErrors.details', 'Technical details') }}</summary>
      <pre>{{ error }}</pre>
    </details>
  </div>
</template>

<style scoped>
.system-update-error-message { overflow-wrap: anywhere; }
details { margin-top: 8px; }
summary { cursor: pointer; }
pre { max-height: 220px; overflow: auto; white-space: pre-wrap; font-size: 12px; }
</style>
