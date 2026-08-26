<script setup lang="ts">
import { t } from '@/i18n/runtime'
</script>

<template>
  <section
    class="onekvm-page-loading"
    role="status"
    aria-busy="true"
    :aria-label="t('common.loading', 'Loading...')"
  >
    <div class="onekvm-html-loading-content">
      <img class="onekvm-html-loading-brand" src="/brand/onekvm-logo-inverse.svg" alt="OneKVM" />
      <div class="onekvm-html-loading-spinner" aria-hidden="true" />
    </div>
  </section>
</template>
