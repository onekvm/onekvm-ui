<script setup lang="ts">
import { computed, ref } from 'vue'
import { useMessage } from 'naive-ui'

import { api } from '@/api/client'
import { hidHostAlert, type HIDHostAlert } from '@/lib/hid-status'
import { t } from '@/i18n/runtime'

const props = defineProps<{
  hid?: { available: boolean; connected: boolean } | null
}>()

const message = useMessage()
const resetting = ref(false)
const kind = computed(() => hidHostAlert(props.hid))
const copy = computed<Record<HIDHostAlert, { title: string; detail: string }>>(() => ({
  disconnected: {
    title: t('deviceStatus.hidDisconnectedTitle', 'USB keyboard and mouse are not connected'),
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

async function resetUSB() {
  if (resetting.value) return
  resetting.value = true
  try {
    await api.resetUSB()
    message.success(t('deviceStatus.usbResetSuccess', 'USB has been reset.'))
  } catch (error) {
    message.error(t('deviceStatus.usbResetFailed', 'Failed to reset USB.'))
    console.error('reset USB failed', error)
  } finally {
    resetting.value = false
  }
}
</script>

<template>
  <n-alert
    v-if="kind"
    type="warning"
    :bordered="false"
    class="hid-host-alert"
    :title="copy[kind].title"
  >
    <div>{{ copy[kind].detail }}</div>
    <n-button
      v-if="kind === 'disconnected'"
      class="hid-host-reset"
      size="small"
      secondary
      type="warning"
      :loading="resetting"
      @click="resetUSB"
    >
      {{ t('deviceStatus.resetUsb', 'Reset USB') }}
    </n-button>
  </n-alert>
</template>

<style scoped>
.hid-host-alert :deep(.n-alert-body) {
  font-size: 12px;
  line-height: 1.45;
}

.hid-host-reset {
  margin-top: 10px;
}
</style>
