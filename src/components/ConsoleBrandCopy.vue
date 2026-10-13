<script setup lang="ts">
withDefaults(defineProps<{
  title: string
  subtitle?: string
  badge?: string
}>(), {
  subtitle: '',
  badge: '',
})
</script>

<template>
  <div class="brand-copy">
    <span class="brand-title-row">
      <span class="brand-name" :title="title">{{ title }}</span>
      <span v-if="badge" class="brand-badge">{{ badge }}</span>
    </span>
    <span v-if="subtitle" class="brand-device" :title="subtitle">
      {{ subtitle }}
    </span>
  </div>
</template>
