<script setup lang="ts">
defineProps<{
  title: string
  description?: string
}>()
</script>

<template>
  <section class="settings-panel">
    <header class="settings-panel-header">
      <h2>{{ title }}</h2>
      <p v-if="description">{{ description }}</p>
    </header>
    <div class="settings-panel-body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.settings-panel {
  display: grid;
  gap: 16px;
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--border, var(--border));
  border-radius: var(--radius-large, 7px);
  background: var(--card, var(--card));
}
.settings-panel-header h2 {
  margin: 0;
  color: var(--foreground, var(--foreground));
  font-size: 14px;
  font-weight: 650;
}
.settings-panel-header p {
  margin: 5px 0 0;
  color: var(--muted-foreground, var(--muted-foreground));
  font-size: 11px;
  line-height: 1.5;
}
.settings-panel-body {
  display: grid;
  min-width: 0;
  gap: 16px;
}

@media (max-width: 760px) {
  .settings-panel { padding: 16px 14px; }
}
</style>
