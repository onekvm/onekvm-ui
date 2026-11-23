<script setup lang="ts">
import { onBeforeUnmount, ref, shallowRef } from 'vue'

import { Trash2 } from '@/icons'
import { useNotifications } from '@/composables/useNotifications'
import { t } from '@/i18n/runtime'
import ControlOverlay from './ControlOverlay.vue'
import NotificationList from './notifications/NotificationList.vue'

defineProps<{
  placement?: 'top-end' | 'bottom-end' | 'right-start' | 'left-start'
  sheet?: boolean
}>()

const emit = defineEmits<{ 'update:show': [show: boolean] }>()

const { entries, loading, load, watchList, markRead, clear, remove } = useNotifications()
const open = ref(false)
/** Entries that were unread when the list opened. */
const fresh = shallowRef<ReadonlySet<number>>(new Set())
let releaseList: (() => void) | null = null

async function updateShow(show: boolean) {
  open.value = show
  emit('update:show', show)
  if (!show) {
    releaseList?.()
    releaseList = null
    return
  }
  releaseList ??= watchList()
  await load()
  if (!open.value) return
  fresh.value = new Set(entries.value.filter((entry) => !entry.read).map((entry) => entry.id))
  void markRead()
}

onBeforeUnmount(() => releaseList?.())
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
    <template #sheet-actions>
      <n-button v-if="entries.length" quaternary size="small" @click="clear">
        <template #icon><Trash2 /></template>
        {{ t('notifications.clear', 'Clear all') }}
      </n-button>
    </template>
    <template #panel>
      <div class="notification-center">
        <header class="control-popover-header notification-center-header">
          <strong>{{ t('notifications.title', 'Notifications') }}</strong>
          <div v-if="entries.length && !sheet" class="control-popover-header-actions">
            <n-button quaternary size="tiny" @click="clear">
              <template #icon><Trash2 /></template>
              {{ t('notifications.clear', 'Clear all') }}
            </n-button>
          </div>
        </header>
        <p v-if="!entries.length && !loading" class="notification-center-empty">{{ t('notifications.empty', 'No notifications') }}</p>
        <NotificationList
          v-else-if="entries.length"
          class="notification-center-list"
          :entries="entries"
          :highlight="fresh"
          removable
          @remove="remove"
        />
      </div>
    </template>
  </ControlOverlay>
</template>

<style scoped>
.notification-center {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.notification-center-empty {
  margin: 8px 0;
  color: var(--muted-foreground);
  font-size: 13px;
  text-align: center;
}

.notification-center-list {
  max-height: min(420px, 60vh);
  overflow-y: auto;
}
</style>
