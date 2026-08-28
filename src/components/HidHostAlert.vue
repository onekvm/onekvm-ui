<script setup lang="ts">
import { computed } from 'vue'

import { hidHostAlert, type HIDHostAlert } from '@/lib/hid-status'
import { t } from '@/i18n/runtime'

const props = defineProps<{
  hid?: { available: boolean; connected: boolean } | null
}>()

const kind = computed(() => hidHostAlert(props.hid))
const copy = computed<Record<HIDHostAlert, { title: string; detail: string }>>(() => ({
  disconnected: {
    title: t('deviceStatus.hidDisconnectedTitle', 'USB keyboard and mouse disconnected'),
    detail: t(
      'deviceStatus.hidDisconnected',
      'The target PC has not enumerated this USB gadget. Keystrokes and mouse movement will not reach the host.',
    ),
  },
  unavailable: {
    title: t('deviceStatus.hidUnavailableTitle', 'USB keyboard and mouse unavailable'),
    detail: t('deviceStatus.hidUnavailable', 'USB keyboard and mouse are not available on this device.'),
  },
}))
</script>

<template>
  <n-alert
    v-if="kind"
    type="warning"
    :bordered="false"
    class="hid-host-alert"
    :title="copy[kind].title"
  >
    {{ copy[kind].detail }}
  </n-alert>
</template>

<style scoped>
.hid-host-alert :deep(.n-alert-body) {
  font-size: 12px;
  line-height: 1.45;
}
</style>
