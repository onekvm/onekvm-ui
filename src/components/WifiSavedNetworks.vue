<script setup lang="ts">
import { computed, reactive, shallowRef } from 'vue'
import { Plus, Settings2 } from '@lucide/vue'
import { api, type SavedWifiNetwork, type WifiProfileSettings, type WifiStatus } from '@/api/client'
import { t } from '@/i18n/runtime'
import { wifiProfileError } from '@/lib/wifi-profile'

const props = defineProps<{ status: WifiStatus; interfaceName: string; disabled?: boolean }>()
const emit = defineEmits<{ updated: [status: WifiStatus] }>()
const modal = shallowRef(false)
const editing = shallowRef(false)
const busy = shallowRef(false)
const error = shallowRef('')
const modalError = shallowRef('')
const replacePassword = shallowRef(false)
const forgetTarget = shallowRef<SavedWifiNetwork | null>(null)
const draft = reactive({ ssid: '', password: '', auto_connect: true, priority: 0, hidden: false, band: '', bssid: '' })
const saved = computed(() => props.status.saved_networks || [])
const locked = computed(() => props.disabled || busy.value || props.status.connecting)
const payload = computed<WifiProfileSettings>(() => ({ ...draft, interface: props.interfaceName,
  password: editing.value && !replacePassword.value ? undefined : draft.password }))
const validation = computed(() => wifiProfileError(payload.value, editing.value))
const bandOptions = computed(() => [{ label: t('network.wifi.anyBand', 'Automatic'), value: '' },
  ...(props.status.radio_bands || ['2.4', '5']).map(band => ({ label: `${band} GHz`, value: band }))])
const invalidHint = computed(() => validation.value ? t(`network.wifi.invalid_${validation.value}`, 'Check the Wi-Fi settings.') : '')

function open(profile?: SavedWifiNetwork) {
  editing.value = !!profile
  replacePassword.value = !profile
  modalError.value = ''
  Object.assign(draft, { ssid: profile?.ssid || '', password: '', auto_connect: profile?.auto_connect ?? true,
    priority: profile?.priority ?? 0, hidden: profile?.hidden ?? true, band: profile?.band || '', bssid: profile?.bssid || '' })
  modal.value = true
}
async function run(action: () => Promise<WifiStatus>, inModal = false): Promise<boolean> {
  busy.value = true
  if (inModal) modalError.value = ''; else error.value = ''
  try { emit('updated', await action()); return true }
  catch (reason) {
    const message = reason instanceof Error ? reason.message : String(reason)
    if (inModal) modalError.value = message; else error.value = message
    return false
  } finally { busy.value = false }
}
async function save(connect: boolean) {
  if (locked.value || validation.value) return
  if (!await run(() => api.saveWifiNetwork(payload.value), true)) return
  if (connect && !await run(() => api.connectWifi(draft.ssid, undefined, props.interfaceName), true)) return
  draft.password = ''
  modal.value = false
}
async function forget() {
  if (!forgetTarget.value || locked.value) return false
  const ssid = forgetTarget.value.ssid
  if (await run(() => api.forgetWifiNetwork(ssid, props.interfaceName))) forgetTarget.value = null
  return false
}
</script>

<template>
  <section class="wifi-saved" :aria-label="t('network.wifi.savedNetworks', 'Saved networks')">
    <div class="wifi-saved-heading">
      <strong>{{ t('network.wifi.savedNetworks', 'Saved networks') }}</strong>
      <n-button size="small" :disabled="locked" @click="open()"><template #icon><Plus :size="16" /></template>{{ t('network.wifi.addNetwork', 'Add network') }}</n-button>
    </div>
    <ul v-if="saved.length" class="wifi-saved-list">
      <li v-for="network in saved" :key="network.ssid" class="wifi-saved-row">
        <div class="wifi-saved-info">
          <strong>{{ network.ssid }}</strong>
          <span>{{ network.auto_connect ? t('network.wifi.autoConnect', 'Auto-connect') : t('network.wifi.manualConnect', 'Manual connection') }} · {{ t('network.wifi.priority', 'Priority') }} {{ network.priority }}<template v-if="network.hidden"> · {{ t('network.wifi.hidden', 'Hidden network') }}</template></span>
        </div>
        <div class="wifi-saved-actions">
          <n-button size="small" :disabled="locked || status.mode === 'ap' || (status.connected && status.station_ssid === network.ssid)" @click="run(() => api.connectWifi(network.ssid, undefined, interfaceName))">{{ status.connected && status.station_ssid === network.ssid ? t('network.wifi.connected', 'Connected') : t('network.wifi.connect', 'Connect') }}</n-button>
          <n-button size="small" :disabled="locked" :aria-label="`${t('network.wifi.advanced', 'Advanced settings')} ${network.ssid}`" @click="open(network)"><template #icon><Settings2 :size="16" /></template>{{ t('network.wifi.advanced', 'Advanced settings') }}</n-button>
          <n-button size="small" quaternary :disabled="locked" @click="forgetTarget = network">{{ t('network.wifi.forget', 'Forget') }}</n-button>
        </div>
      </li>
    </ul>
    <p v-else class="wifi-saved-muted">{{ t('network.wifi.noSavedNetworks', 'Successfully connected networks are saved on this interface.') }}</p>
    <p v-if="error" class="wifi-saved-error" role="alert">{{ error }}</p>

    <n-modal :show="!!forgetTarget" preset="dialog" :title="t('network.wifi.forget', 'Forget')" :positive-text="t('network.wifi.forget', 'Forget')" :negative-text="t('common.cancel', 'Cancel')" :loading="busy" :mask-closable="!busy" :closable="!busy" :close-on-esc="!busy" @positive-click="forget" @negative-click="forgetTarget = null" @update:show="!$event && !busy && (forgetTarget = null)">
      <p>{{ t('network.wifi.forgetConfirm', 'Forget {ssid}? Its saved password will be removed.').replace('{ssid}', forgetTarget?.ssid || '') }}</p>
      <p v-if="status.connected && status.station_ssid === forgetTarget?.ssid" class="wifi-saved-muted">{{ t('network.wifi.forgetCurrent', 'This disconnects the current network. Use another interface to keep access.') }}</p>
    </n-modal>

    <n-modal v-model:show="modal" preset="card" class="wifi-profile-modal" :title="editing ? t('network.wifi.advanced', 'Advanced settings') : t('network.wifi.addNetwork', 'Add network')" :mask-closable="!busy" :closable="!busy" :close-on-esc="!busy" @after-leave="draft.password = ''">
      <n-form label-placement="top" :show-feedback="false" class="wifi-profile-form">
        <n-form-item :label="t('network.wifi.ssid', 'SSID')"><n-input v-model:value="draft.ssid" :disabled="editing || busy" :maxlength="32" /></n-form-item>
        <n-checkbox v-if="editing" v-model:checked="replacePassword" :disabled="busy">{{ t('network.wifi.changePassword', 'Change password') }}</n-checkbox>
        <n-form-item v-if="replacePassword" :label="t('network.wifi.networkPassword', 'Network password')"><n-input v-model:value="draft.password" type="password" show-password-on="click" :disabled="busy" :placeholder="t('network.wifi.openPasswordHint', 'Leave blank for an open network')" /></n-form-item>
        <div class="wifi-profile-checks">
          <n-checkbox v-model:checked="draft.auto_connect" :disabled="busy">{{ t('network.wifi.autoConnect', 'Auto-connect') }}</n-checkbox>
          <n-checkbox v-model:checked="draft.hidden" :disabled="busy">{{ t('network.wifi.hidden', 'Hidden network') }}</n-checkbox>
        </div>
        <div class="wifi-profile-grid">
          <n-form-item :label="t('network.wifi.priority', 'Priority')"><n-input-number v-model:value="draft.priority" :min="0" :max="999" :precision="0" :disabled="busy" /></n-form-item>
          <n-form-item :label="t('network.wifi.band', 'Band')"><n-select v-model:value="draft.band" :options="bandOptions" :disabled="busy" /></n-form-item>
        </div>
        <p class="wifi-saved-muted">{{ t('network.wifi.priorityHint', 'A higher priority is preferred when several saved networks are available.') }}</p>
        <n-form-item label="BSSID"><n-input v-model:value="draft.bssid" :disabled="busy" :placeholder="t('network.wifi.bssidHint', 'Optional: lock to an access point MAC address')" /></n-form-item>
        <p v-if="(draft.ssid && invalidHint) || modalError" class="wifi-saved-error" role="alert">{{ modalError || invalidHint }}</p>
      </n-form>
      <template #footer><div class="wifi-profile-footer">
        <n-button :disabled="busy" @click="modal = false">{{ t('common.cancel', 'Cancel') }}</n-button>
        <n-button :loading="busy" :disabled="locked || !!validation" @click="save(false)">{{ t('common.save', 'Save') }}</n-button>
        <n-button v-if="!editing" type="primary" :loading="busy" :disabled="locked || status.mode === 'ap' || !!validation" @click="save(true)">{{ t('network.wifi.saveConnect', 'Save and connect') }}</n-button>
      </div></template>
    </n-modal>
  </section>
</template>

<style scoped>
.wifi-saved { display: grid; gap: 8px; margin: 12px 0; }
.wifi-saved-heading, .wifi-saved-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.wifi-saved-heading strong { font-size: 13px; }
.wifi-saved-list { list-style: none; padding: 0; margin: 0; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.wifi-saved-row { padding: 12px; background: var(--onekvm-surface-inset); }
.wifi-saved-row + .wifi-saved-row { border-top: 1px solid var(--border); }
.wifi-saved-info { display: grid; gap: 4px; min-width: 0; }
.wifi-saved-info strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wifi-saved-info span, .wifi-saved-muted { color: var(--muted-foreground); font-size: 12px; line-height: 1.5; margin: 0; }
.wifi-saved-actions, .wifi-profile-checks, .wifi-profile-footer { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.wifi-profile-footer { justify-content: flex-end; }
.wifi-profile-form { display: grid; gap: 14px; }
.wifi-profile-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.wifi-profile-grid :deep(.n-input-number) { width: 100%; }
.wifi-saved-error { color: var(--destructive, #d95757); font-size: 12px; margin: 0; }
@media (max-width: 680px) { .wifi-saved-row { align-items: stretch; flex-direction: column; } .wifi-saved-actions { justify-content: flex-end; } }
@media (max-width: 400px) { .wifi-profile-grid { grid-template-columns: 1fr; } }
</style>
<style>
.wifi-profile-modal { width: min(520px, calc(100vw - 32px)); }
</style>
