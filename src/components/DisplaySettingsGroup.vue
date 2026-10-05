<script setup lang="ts">
import type { Component } from 'vue'
import { ChevronDown } from '@lucide/vue'

defineProps<{
  title: string
  icon: Component
  collapsible?: boolean
}>()
</script>

<template>
  <component
    :is="collapsible ? 'details' : 'section'"
    class="display-settings-group"
    :aria-label="title"
  >
    <component :is="collapsible ? 'summary' : 'header'" class="display-settings-group-heading">
      <component :is="icon" :size="15" :stroke-width="1.8" aria-hidden="true" />
      <h3 class="display-settings-group-title">{{ title }}</h3>
      <ChevronDown v-if="collapsible" :size="14" class="display-settings-group-chevron" aria-hidden="true" />
    </component>
    <div class="display-status-values">
      <slot />
    </div>
  </component>
</template>

<style scoped>
.display-settings-group {
  min-width: 0;
  padding-top: 10px;
}
.display-settings-group + .display-settings-group {
  margin-top: 10px;
  border-top: 1px solid var(--border);
}
.display-settings-group-heading {
  display: flex;
  min-height: 24px;
  align-items: center;
  gap: 7px;
  color: var(--muted-foreground);
}
.display-settings-group-heading > svg {
  flex: 0 0 auto;
}
.display-settings-group-title {
  margin: 0;
  color: var(--foreground);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
}
summary.display-settings-group-heading {
  border-radius: 4px;
  cursor: pointer;
  list-style: none;
}
summary.display-settings-group-heading::-webkit-details-marker {
  display: none;
}
summary.display-settings-group-heading:hover {
  color: var(--foreground);
}
summary.display-settings-group-heading:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 3px;
}
.display-settings-group-chevron {
  margin-left: auto;
}
.display-settings-group[open] .display-settings-group-chevron {
  transform: rotate(180deg);
}
</style>
