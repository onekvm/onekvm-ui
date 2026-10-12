<script setup lang="ts">
import type { Component } from 'vue'

defineProps<{ id?: string; icon: Component }>()
</script>

<template>
  <h3 :id="id" class="plugin-details-section-title">
    <component :is="icon" :size="16" aria-hidden="true" />
    <slot />
  </h3>
</template>

<style scoped>
.plugin-details-section-title { display: flex; align-items: center; gap: 7px; margin: 0; color: var(--foreground); font-size: 13px; font-weight: 500; }
.plugin-details-section-title :deep(svg) { flex: 0 0 auto; }
</style>
