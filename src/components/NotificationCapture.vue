<script setup lang="ts">
// Records every prompt shown through the shared message provider.
import { useMessage, type MessageOptions } from 'naive-ui'

import { notify } from '@/composables/useNotifications'
import { NOTIFICATION_LEVELS, type NotificationLevel } from '@/lib/notifications'

const CAPTURED = Symbol.for('onekvm.notification-capture')
type MessageApi = ReturnType<typeof useMessage> & { [CAPTURED]?: true }
type Show = (content: unknown, options?: MessageOptions) => unknown

const api = useMessage() as MessageApi
if (!api[CAPTURED]) {
  api[CAPTURED] = true
  for (const level of NOTIFICATION_LEVELS) {
    const show = api[level] as unknown as Show
    ;(api as unknown as Record<NotificationLevel, Show>)[level] = (content, options) => {
      if (typeof content === 'string') notify(level, content)
      return show(content, options)
    }
  }
  const create = api.create as unknown as Show
  ;(api as unknown as { create: Show }).create = (content, options) => {
    const type = options?.type
    if (typeof content === 'string' && NOTIFICATION_LEVELS.includes(type as NotificationLevel)) {
      notify(type as NotificationLevel, content)
    }
    return create(content, options)
  }
}
</script>

<template>
  <template v-if="false" />
</template>
