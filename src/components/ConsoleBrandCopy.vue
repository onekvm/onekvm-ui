<script setup lang="ts">
withDefaults(defineProps<{
  title: string
  deviceModel?: string
  showDeviceModel?: boolean
  badge?: string
}>(), {
  deviceModel: '',
  showDeviceModel: true,
  badge: '',
})
</script>

<template>
  <div class="brand-copy">
    <span class="brand-title-row">
      <span class="brand-name" :title="title">{{ title }}</span>
      <span v-if="badge" class="brand-badge">{{ badge }}</span>
    </span>
    <span v-if="showDeviceModel && deviceModel" class="brand-device" :title="deviceModel">
      {{ deviceModel }}
    </span>
  </div>
</template>
