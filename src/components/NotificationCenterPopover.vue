<script setup lang="ts">
import { computed, ref } from 'vue'

import { AlertTriangle, CheckCircle2, CircleX, Info, Trash2, X } from '@/icons'
import { useNotifications } from '@/composables/useNotifications'
import { t } from '@/i18n/runtime'
import ControlOverlay from './ControlOverlay.vue'

defineProps<{
  placement?: 'top-end' | 'bottom-end' | 'right-start' | 'left-start'
  sheet?: boolean
}>()

const emit = defineEmits<{ 'update:show': [show: boolean] }>()

const { entries, seenAt, markRead, clear, remove } = useNotifications()
const open = ref(false)
/** Entries newer than this were unread when the list opened. */
const unreadSince = ref(0)

const levelIcon = { error: CircleX, warning: AlertTriangle, success: CheckCircle2, info: Info } as const

function updateShow(show: boolean) {
  if (show) {
    unreadSince.value = seenAt.value
    markRead()
  }
  open.value = show
  emit('update:show', show)
}

const timeFormat = computed(() => new Intl.DateTimeFormat(document.documentElement.lang || undefined, { hour: '2-digit', minute: '2-digit' }))
const dateTimeFormat = computed(() => new Intl.DateTimeFormat(document.documentElement.lang || undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }))

function when(at: number) {
  const date = new Date(at)
  const today = new Date()
  const sameDay = date.toDateString() === today.toDateString()
  return (sameDay ? timeFormat.value : dateTimeFormat.value).format(date)
}
</script>

<template>
  <ControlOverlay
    :show="open"
    :sheet="sheet"
    :placement="placement"
    popover-class="control-popover notification-center-popover"
    @update:show="updateShow"
  >
    <slot />
    <template #title>{{ t('notifications.title', 'Notifications') }}</template>
    <template #panel>
      <div class="notification-center">
        <header class="control-popover-header notification-center-header">
          <strong>{{ t('notifications.title', 'Notifications') }}</strong>
        </header>
        <p v-if="!entries.length" class="notification-center-empty">{{ t('notifications.empty', 'No notifications') }}</p>
        <ol v-else class="notification-center-list">
          <li
            v-for="entry in entries"
            :key="entry.id"
            class="notification-center-item"
            :data-level="entry.level"
            :data-unread="entry.at > unreadSince || undefined"
          >
            <component :is="levelIcon[entry.level]" class="notification-center-icon" :size="16" aria-hidden="true" />
            <div class="notification-center-body">
              <p>{{ entry.text }}</p>
              <time :datetime="new Date(entry.at).toISOString()">
                {{ when(entry.at) }}<template v-if="entry.count > 1"> · ×{{ entry.count }}</template>
              </time>
            </div>
            <n-button quaternary circle size="tiny" class="notification-center-remove" :aria-label="t('notifications.remove', 'Remove')" @click="remove(entry.id)">
              <template #icon><X /></template>
            </n-button>
          </li>
        </ol>
        <footer v-if="entries.length" class="notification-center-footer">
          <n-button quaternary size="small" @click="clear">
            <template #icon><Trash2 /></template>
            {{ t('notifications.clear', 'Clear all') }}
          </n-button>
        </footer>
      </div>
    </template>
  </ControlOverlay>
</template>

<style scoped>
.notification-center {
  display: grid;
  gap: 8px;
  width: min(360px, calc(100vw - 32px));
}

.notification-center-footer {
  display: flex;
  justify-content: flex-end;
}

.notification-center-empty {
  margin: 8px 0;
  color: var(--muted-foreground);
  font-size: 13px;
  text-align: center;
}

.notification-center-list {
  display: grid;
  gap: 2px;
  max-height: min(420px, 60vh);
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.notification-center-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: start;
  gap: 8px;
  padding: 8px;
  border-radius: 6px;
}

.notification-center-item[data-unread] {
  background: var(--onekvm-surface-inset);
}

.notification-center-icon {
  margin-top: 2px;
  color: var(--muted-foreground);
}

.notification-center-item[data-level='error'] .notification-center-icon { color: var(--n-error-color, #e5484d); }
.notification-center-item[data-level='warning'] .notification-center-icon { color: var(--n-warning-color, #f5a524); }
.notification-center-item[data-level='success'] .notification-center-icon { color: var(--n-success-color, #30a46c); }
.notification-center-item[data-level='info'] .notification-center-icon { color: var(--n-info-color, #3b82f6); }

.notification-center-body {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.notification-center-body p {
  margin: 0;
  color: var(--foreground);
  font-size: 13px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.notification-center-body time {
  color: var(--muted-foreground);
  font-size: 11px;
}

.notification-center-remove {
  opacity: 0;
}

.notification-center-item:hover .notification-center-remove,
.notification-center-remove:focus-visible {
  opacity: 1;
}

@media (hover: none) {
  .notification-center-remove { opacity: 1; }
}
</style>
