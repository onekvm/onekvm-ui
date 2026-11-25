<script setup lang="ts">
import { computed } from 'vue'

import type { OneKVMStatus } from '@/api/client'
import type { ConsoleProblemAnchor } from '@/lib/console-problems'
import { hidHostAlert } from '@/lib/hid-status'
import { usbInputProblemFor } from '@/lib/usb-input-problems'
import { t } from '@/i18n/runtime'
import ConsoleProblemContent from './ConsoleProblemContent.vue'

const props = defineProps<{
  hid?: OneKVMStatus['hid'] | null
  /** The input whose popover shows it; others show only a disconnected gadget. */
  anchor?: ConsoleProblemAnchor
}>()

const unavailable = computed(() => hidHostAlert(props.hid) === 'unavailable')
const problem = computed(() => (props.hid ? usbInputProblemFor(props.anchor, { hid: props.hid } as OneKVMStatus) : null))
</script>

<template>
  <n-alert
    v-if="unavailable"
    type="warning"
    :bordered="false"
    class="hid-host-alert"
    :title="t('deviceStatus.hidUnavailableTitle', 'USB keyboard and mouse unavailable')"
  >
    <div>{{ t('deviceStatus.hidUnavailable', 'USB keyboard and mouse are not available on this device.') }}</div>
  </n-alert>
  <n-alert
    v-else-if="problem"
    type="warning"
    :bordered="false"
    class="hid-host-alert"
    :title="problem.title()"
    role="alert"
  >
    <ConsoleProblemContent :problem="problem" compact />
  </n-alert>
</template>

<style scoped>
.hid-host-alert :deep(.n-alert-body) {
  font-size: 12px;
  line-height: 1.45;
}
</style>
