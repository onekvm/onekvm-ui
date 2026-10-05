<script setup lang="ts">
import type { Component } from 'vue'
import { ChevronRight, LoaderCircle } from '@lucide/vue'

import type { SettingsListTone } from '@/lib/settings-nav'

export type SettingsAppRow = {
  key: string
  label: string
  icon: Component
  iconURL?: string
  tone: SettingsListTone
  loading?: boolean
}

export type SettingsAppGroup = {
  id: string
  label: string
  items: SettingsAppRow[]
}

defineProps<{
  title: string
  subtitle?: string
  groups: SettingsAppGroup[]
}>()

const emit = defineEmits<{
  select: [key: string]
}>()
</script>

<template>
  <div class="settings-app-list">
    <header class="settings-app-heading">
      <h1 class="settings-app-large-title">{{ title }}</h1>
      <p v-if="subtitle" class="settings-app-subtitle">{{ subtitle }}</p>
    </header>
    <nav class="settings-app-nav" :aria-label="title">
      <section v-for="group in groups" :key="group.id" class="settings-app-group">
        <h2 v-if="group.label" class="settings-app-group-title">{{ group.label }}</h2>
        <div class="settings-app-group-card">
          <button
            v-for="item in group.items"
            :key="item.key"
            type="button"
            class="settings-app-row"
            :aria-busy="item.loading || undefined"
            @click="emit('select', item.key)"
          >
            <span class="settings-app-icon" :class="`tone-${item.tone}`" aria-hidden="true">
              <LoaderCircle v-if="item.loading" class="spin" :size="16" />
              <img v-else-if="item.iconURL" class="settings-app-custom-icon" :src="item.iconURL" alt="" />
              <component v-else :is="item.icon" :size="16" />
            </span>
            <span class="settings-app-label">{{ item.label }}</span>
            <ChevronRight class="settings-app-chevron" :size="18" aria-hidden="true" />
          </button>
        </div>
      </section>
    </nav>
  </div>
</template>

<style scoped>
.settings-app-list {
  display: grid;
  align-content: start;
  gap: 24px;
  padding: 8px 16px calc(32px + env(safe-area-inset-bottom, 0px));
}

.settings-app-heading {
  display: grid;
  gap: 4px;
  padding: 8px 4px 2px;
}

.settings-app-large-title {
  margin: 0;
  color: var(--foreground);
  font-size: 32px;
  font-weight: 700;
  letter-spacing: -0.045em;
  line-height: 1.1;
  text-wrap: balance;
}

.settings-app-subtitle {
  margin: 0;
  color: var(--muted-foreground);
  font-size: 13px;
  line-height: 1.3;
}

.settings-app-nav {
  display: grid;
  gap: 22px;
}

.settings-app-group {
  display: grid;
  gap: 8px;
}

.settings-app-group-title {
  margin: 0 12px;
  color: var(--muted-foreground);
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0.06em;
  line-height: 1.2;
  text-transform: uppercase;
}

.settings-app-group-card {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--card);
}

.settings-app-row {
  display: flex;
  width: 100%;
  min-height: 52px;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border: 0;
  border-bottom: 1px solid var(--border);
  color: var(--foreground);
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.settings-app-row:last-child { border-bottom: 0; }

.settings-app-row:hover,
.settings-app-row:focus-visible {
  background: var(--accent);
}

.settings-app-row:active {
  background: var(--secondary);
}

.settings-app-icon {
  display: grid;
  width: 29px;
  height: 29px;
  flex: 0 0 29px;
  place-items: center;
  border-radius: 7px;
  color: var(--primary-foreground);
}

.settings-app-icon.tone-device { background: var(--primary); }
.settings-app-icon.tone-network {
  background: color-mix(in srgb, var(--primary) 72%, #22d3ee);
}
.settings-app-icon.tone-extensions {
  background: color-mix(in srgb, var(--primary) 52%, #8b5cf6);
}
.settings-app-icon.tone-admin {
  color: var(--secondary-foreground);
  background: var(--secondary);
}

.settings-app-custom-icon {
  width: 16px;
  height: 16px;
  object-fit: contain;
}

.settings-app-label {
  flex: 1;
  min-width: 0;
  font-size: 16px;
  font-weight: 500;
  line-height: 1.25;
}

.settings-app-chevron {
  flex: 0 0 auto;
  color: var(--muted-foreground);
}

@media (prefers-reduced-motion: reduce) {
  .settings-app-row { transition: none; }
}
</style>
