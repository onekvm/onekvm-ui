<script setup lang="ts">
import { computed, onMounted, onUnmounted, shallowRef } from 'vue'
import { api, type NetworkApplyStatus } from '@/api/client'
import { t } from '@/i18n/runtime'

const props = defineProps<{ initial: NetworkApplyStatus }>()
const emit = defineEmits<{ finished: [] }>()
const state = shallowRef(props.initial)
const seconds = shallowRef(props.initial.seconds_remaining)
const busy = shallowRef(false)
const error = shallowRef('')
let deadline = Date.now() + seconds.value * 1000
let timer: ReturnType<typeof setInterval> | undefined
let polling = false
let ticks = 0
let disposed = false
const message = computed(() => (state.value.ready === false
  ? t('network.confirm.preparing', 'Applying network settings…')
  : t('network.confirm.message', 'Please confirm configuration within {{time}}')).replace('{{time}}', `${seconds.value}s`))
const links = computed(() => (state.value.new_addresses || []).map(address => {
  const url = new URL(window.location.href)
  url.hostname = address.includes(':') ? `[${address}]` : address
  url.search = ''
  if (state.value.confirm_token) url.searchParams.set('network-confirm', state.value.confirm_token)
  url.hash = '/settings/advanced/network'
  return { href: url.toString(), label: url.origin }
}).filter(link => new URL(link.href).origin !== window.location.origin))

async function poll() {
  if (polling || disposed) return
  polling = true
  try {
    const next = await api.getNetworkApplyStatus()
    if (disposed) return
    if (!next.pending) { emit('finished'); return }
    state.value = next
    deadline = Date.now() + next.seconds_remaining * 1000
    error.value = ''
  } catch {
    if (!disposed) error.value = t('network.confirm.connectionLostNoNewAddress', 'Reconnect to the device to confirm the new settings; otherwise the previous settings return automatically.')
  } finally { polling = false }
}
async function confirm() {
  busy.value = true
  try { await api.confirmNetworkApply(); emit('finished') }
  catch (reason) { error.value = reason instanceof Error ? reason.message : String(reason) }
  finally { busy.value = false }
}
onMounted(() => {
  void poll()
  timer = setInterval(() => {
    seconds.value = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
    if (++ticks % 3 === 0) void poll()
  }, 1000)
})
onUnmounted(() => { disposed = true; if (timer) clearInterval(timer) })
</script>

<template>
  <n-modal :show="true" preset="card" :title="t('network.confirm.title', 'Confirm Network Configuration')" :style="{ width: '480px', maxWidth: 'calc(100vw - 32px)' }" :mask-closable="false" :closable="false" :close-on-esc="false">
    <p>{{ message }}</p>
    <p>{{ t('network.confirm.description', 'If not confirmed, configuration will automatically rollback to previous state') }}</p>
    <n-alert v-if="error" type="warning" :bordered="false">{{ error }}</n-alert>
    <div v-if="links.length" class="network-confirm-links">
      <span>{{ t('network.confirm.openNewAddress', 'Open the new device address:') }}</span>
      <n-button v-for="link in links" :key="link.href" tag="a" :href="link.href" target="_blank" secondary>{{ link.label }}</n-button>
    </div>
    <template #footer><n-button type="primary" :loading="busy" :disabled="state.ready === false || seconds === 0" @click="confirm">{{ t('network.confirm.confirm', 'Confirm Configuration') }}</n-button></template>
  </n-modal>
</template>

<style scoped>
.network-confirm-links { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 16px; }
.network-confirm-links > span { width: 100%; color: var(--muted-foreground); font-size: 13px; }
</style>
