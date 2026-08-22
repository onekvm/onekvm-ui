<script setup lang="ts">
import { t } from '@/i18n/runtime'
</script>

<template>
  <section class="advanced-settings-loading-page" aria-busy="true">
    <div class="advanced-settings-loading" role="status" aria-live="polite">
      <n-spin size="large" />
      <span>{{ t('common.loading', 'Loading...') }}</span>
    </div>
  </section>
</template>
