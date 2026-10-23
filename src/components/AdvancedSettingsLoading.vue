<script setup lang="ts">
import { t } from '@/i18n/runtime'

defineProps<{ embedded?: boolean }>()
</script>

<template>
  <section
    :class="embedded ? 'advanced-settings-inline-loading' : 'onekvm-page-loading'"
    role="status"
    aria-busy="true"
    :aria-label="t('common.loading', 'Loading...')"
  >
    <n-spin v-if="embedded" size="small" />
    <div v-else class="onekvm-html-loading-content">
      <img class="onekvm-html-loading-brand" src="/brand/onekvm-logo-inverse.svg" alt="OneKVM" />
      <div class="onekvm-html-loading-spinner" aria-hidden="true" />
    </div>
  </section>
</template>

<style scoped>
.advanced-settings-inline-loading { display: grid; flex: 1; min-height: 120px; place-items: center; }
</style>
