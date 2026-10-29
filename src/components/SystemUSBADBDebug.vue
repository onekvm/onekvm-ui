<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, useId } from 'vue'
import { useMessage } from 'naive-ui'
import { api, type USBADBDebugStatus } from '@/api/client'
import { t } from '@/i18n/runtime'

const props = defineProps<{ disabled: boolean }>()
const status = shallowRef<USBADBDebugStatus | null>(null)
const loading = shallowRef(true)
const busy = shallowRef(false)
const error = shallowRef('')
const message = useMessage()
const labelId = useId()
const hintId = useId()
let refreshTimer: number | undefined
let statusRequest = 0

async function refresh() {
  const request = ++statusRequest
  error.value = ''
  try {
    const latest = await api.getUSBADBDebug()
    if (request === statusRequest) status.value = latest
  } catch (reason) {
    if (request === statusRequest) {
      status.value = null
      error.value = reason instanceof Error ? reason.message : String(reason)
    }
  } finally {
    loading.value = false
  }
}

async function toggle(enabled: boolean) {
  if (props.disabled || busy.value || loading.value || !status.value?.available) return
  busy.value = true
  ++statusRequest
  try {
    status.value = await api.setUSBADBDebug(enabled)
    error.value = ''
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : String(reason))
    await refresh()
  } finally {
    busy.value = false
  }
}

onMounted(() => {
  void refresh()
  refreshTimer = window.setInterval(() => {
    if (!busy.value && !loading.value) void refresh()
  }, 10000)
})
onBeforeUnmount(() => window.clearInterval(refreshTimer))
</script>

<template>
  <div class="system-recovery-row usb-adb-debug-row" :aria-busy="loading || busy">
    <div class="usb-adb-debug-copy">
      <strong :id="labelId">{{ t('settings.advancedSettings.systemPage.usbAdb', 'USB ADB Debug Bridge') }}</strong>
      <p :id="hintId" class="usb-adb-debug-hint">{{ t('settings.advancedSettings.systemPage.usbAdbHint', 'Access a root shell over USB until the device restarts. Switching briefly disconnects USB keyboard, mouse, audio and virtual media.') }}</p>
      <p v-if="error" class="usb-adb-debug-error" role="alert">{{ error }}</p>
      <p v-else-if="status && !status.available" class="usb-adb-debug-hint">{{ t('settings.advancedSettings.systemPage.usbAdbUnavailable', 'Unavailable on this device.') }}</p>
    </div>
    <n-switch
      :value="status?.enabled ?? false"
      :loading="loading || busy"
      :disabled="props.disabled || loading || busy || !status?.available"
      :aria-labelledby="labelId"
      :aria-describedby="hintId"
      @update:value="toggle"
    />
  </div>
</template>

<style scoped>
.usb-adb-debug-row { flex-direction: row; border-color: var(--border); background: var(--card); }
.usb-adb-debug-copy { flex: 1; min-width: 0; }
.usb-adb-debug-hint, .usb-adb-debug-error { margin: 6px 0 0; font-size: 12px; line-height: 1.6; }
.usb-adb-debug-hint { color: var(--muted-foreground); }
.usb-adb-debug-error { color: var(--destructive); overflow-wrap: anywhere; }
.usb-adb-debug-row :deep(.n-switch) { flex-shrink: 0; }
</style>
