<script setup lang="ts">
import type { Component } from 'vue'

defineProps<{
  icon: Component
  title: string
  subtitle: string
}>()
</script>

<template>
  <div class="control-popover-heading">
    <span class="control-popover-heading-icon" aria-hidden="true"><component :is="icon" :size="16" /></span>
    <span class="control-popover-heading-text">
      <strong>{{ title }}</strong>
      <small>{{ subtitle }}</small>
    </span>
  </div>
</template>

<style scoped>
.control-popover-heading {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 9px;
}

.control-popover-heading-text {
  display: grid;
  min-width: 0;
  gap: 1px;
}

.control-popover-heading-text small {
  overflow: hidden;
  color: var(--muted-foreground);
  font-size: 10px;
  font-weight: 400;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.control-popover-heading-icon {
  display: grid;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--secondary);
  color: var(--foreground);
}
</style>
