<script setup lang="ts">
import { computed } from 'vue'

import { AlertTriangle, CheckCircle2, CircleX, Info, X } from '@/icons'
import { t } from '@/i18n/runtime'
import { notificationText, type NotificationEntry } from '@/lib/notifications'

const props = defineProps<{
  entries: readonly NotificationEntry[]
  /** Entries shown as new. */
  highlight?: ReadonlySet<number>
  removable?: boolean
}>()

const emit = defineEmits<{ remove: [id: number] }>()

const levelIcon = { error: CircleX, warning: AlertTriangle, success: CheckCircle2, info: Info } as const

const timeFormat = computed(() => new Intl.DateTimeFormat(document.documentElement.lang || undefined, { hour: '2-digit', minute: '2-digit' }))
const dateTimeFormat = computed(() => new Intl.DateTimeFormat(document.documentElement.lang || undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }))

function when(at: number) {
  const date = new Date(at)
  const sameDay = date.toDateString() === new Date().toDateString()
  return (sameDay ? timeFormat.value : dateTimeFormat.value).format(date)
}

const rows = computed(() => props.entries.map((entry) => ({ entry, text: notificationText(entry, t) })))
</script>

<template>
  <ol class="notification-list">
    <li
      v-for="{ entry, text } in rows"
      :key="entry.id"
      class="notification-list-item"
      :data-level="entry.level"
      :data-unread="highlight?.has(entry.id) || undefined"
    >
      <component :is="levelIcon[entry.level]" class="notification-list-icon" :size="16" aria-hidden="true" />
      <div class="notification-list-body">
        <p>{{ text }}</p>
        <time :datetime="new Date(entry.at).toISOString()">
          {{ when(entry.at) }}<template v-if="entry.count > 1"> · ×{{ entry.count }}</template>
        </time>
      </div>
      <n-button
        v-if="removable"
        quaternary
        circle
        size="tiny"
        class="notification-list-remove"
        :aria-label="t('notifications.remove', 'Remove')"
        @click="emit('remove', entry.id)"
      >
        <template #icon><X /></template>
      </n-button>
    </li>
  </ol>
</template>

<style scoped>
.notification-list {
  display: grid;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.notification-list-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: start;
  gap: 8px;
  padding: 8px;
  border-radius: 6px;
}

.notification-list-item[data-unread] {
  background: var(--onekvm-surface-inset);
}

.notification-list-icon {
  margin-top: 2px;
  color: var(--muted-foreground);
}

.notification-list-item[data-level='error'] .notification-list-icon { color: var(--n-error-color, #e5484d); }
.notification-list-item[data-level='warning'] .notification-list-icon { color: var(--n-warning-color, #f5a524); }
.notification-list-item[data-level='success'] .notification-list-icon { color: var(--n-success-color, #30a46c); }
.notification-list-item[data-level='info'] .notification-list-icon { color: var(--n-info-color, #3b82f6); }

.notification-list-body {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.notification-list-body p {
  margin: 0;
  color: var(--foreground);
  font-size: 13px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.notification-list-body time {
  color: var(--muted-foreground);
  font-size: 11px;
}

.notification-list-remove {
  opacity: 0;
}

.notification-list-item:hover .notification-list-remove,
.notification-list-remove:focus-visible {
  opacity: 1;
}

@media (hover: none) {
  .notification-list-remove { opacity: 1; }
}
</style>
