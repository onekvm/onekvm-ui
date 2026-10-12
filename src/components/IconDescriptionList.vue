<script setup lang="ts">
import type { Component } from 'vue'

defineProps<{
  items: ReadonlyArray<{ id: string; icon: Component; label: string; description: string }>
}>()
</script>

<template>
  <ul class="icon-description-list">
    <li v-for="item in items" :key="item.id" class="icon-description-item" :data-item="item.id">
      <span class="icon-description-icon" aria-hidden="true"><component :is="item.icon" :size="20" /></span>
      <div class="icon-description-copy">
        <strong>{{ item.label }}</strong>
        <p>{{ item.description }}</p>
      </div>
    </li>
  </ul>
</template>

<style scoped>
.icon-description-list { margin: 0; padding: 0; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; list-style: none; }
.icon-description-item { display: flex; align-items: flex-start; gap: 12px; padding: 12px; }
.icon-description-item + .icon-description-item { border-top: 1px solid var(--border); }
.icon-description-icon { display: grid; width: 32px; height: 32px; flex: 0 0 32px; place-items: center; color: var(--muted-foreground); }
.icon-description-copy { display: grid; min-width: 0; gap: 3px; overflow-wrap: anywhere; }
.icon-description-copy strong { color: var(--foreground); font-size: 13px; line-height: 1.5; font-weight: 500; }
.icon-description-copy p { margin: 0; color: var(--muted-foreground); font-size: 12px; line-height: 1.5; }
</style>
