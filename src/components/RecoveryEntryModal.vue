<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { api, recoveryNetworkApi, type RecoveryNetworkPreview, type RecoveryNetworkSettings } from '@/api/client'
import { t } from '@/i18n/runtime'

const show = defineModel<boolean>('show', { required: true })
const emit = defineEmits<{ enter: [network: RecoveryNetworkSettings] }>()
const preview = shallowRef<RecoveryNetworkPreview | null>(null)
const draft = ref<RecoveryNetworkSettings | null>(null)
const interfaces = shallowRef<string[]>([])
const loading = shallowRef(false)
const submitting = shallowRef(false)
const error = shallowRef('')
const mode = computed({
  get: () => draft.value?.source === 'system' ? 'system' : draft.value?.mode ?? 'dhcp',
  set: (value: string) => {
    if (!draft.value) return
    draft.value.source = value === 'system' ? 'system' : 'custom'
    if (value === 'dhcp' || value === 'static') draft.value.mode = value
    error.value = ''
  },
})
const modes = computed(() => [
  { value: 'system', label: t('settings.recoveryNetwork.reuse'), hint: t('settings.recoveryNetwork.reuseHint') },
  { value: 'dhcp', label: t('settings.recoveryNetwork.dhcp'), hint: t('settings.recoveryNetwork.dhcpHint') },
  { value: 'static', label: t('settings.recoveryNetwork.static'), hint: t('settings.recoveryNetwork.staticHint') },
])
const interfaceOptions = computed(() => [
  { label: t('settings.recoveryNetwork.primaryInterface'), value: '' },
  ...interfaces.value.map(name => ({ label: name, value: name })),
])
const dns = computed({
  get: () => draft.value?.dns.join(', ') ?? '',
  set: (value: string) => { if (draft.value) draft.value.dns = value.split(/[\s,]+/).filter(Boolean) },
})
const access = computed(() => {
  const network = mode.value === 'system' ? preview.value?.effective : draft.value
  if (!network) return '—'
  const parts = network.mode === 'dhcp' ? ['DHCP'] : [network.address || '—']
  if (network.fallback_enabled) parts.push(network.fallback_address)
  return parts.join(' + ')
})
const effectiveMac = computed(() => (mode.value === 'system' ? '' : draft.value?.mac_address) || preview.value?.effective?.mac_address || '—')
const effectiveDns = computed(() => {
  if (draft.value?.use_custom_dns) return draft.value.dns.join(', ')
  if (mode.value === 'system' && preview.value?.effective?.use_custom_dns) return preview.value.effective.dns.join(', ')
  return t('settings.recoveryNetwork.autoDns')
})

watch(show, async (open, _previous, onCleanup) => {
  if (!open) return
  let active = true
  onCleanup(() => { active = false })
  loading.value = true
  error.value = ''
  draft.value = null
  try {
    const [state, links] = await Promise.all([recoveryNetworkApi.get(), api.getNetworkInterfaces()])
    if (!active) return
    preview.value = state
    draft.value = structuredClone(state.settings)
    interfaces.value = links.filter(link => link.port_type === 'physical' && !/^(wl|ap|lo)/.test(link.name)).map(link => link.name)
  } catch (reason) {
    if (active) error.value = reason instanceof Error ? reason.message : String(reason)
  } finally { if (active) loading.value = false }
}, { immediate: true })

async function enter() {
  if (!draft.value || submitting.value) return
  submitting.value = true
  error.value = ''
  try {
    const settings = { ...draft.value, dns: [...draft.value.dns] }
    const checked = await recoveryNetworkApi.preview(settings)
    if (checked.pending_system_network) throw new Error(t('settings.recoveryNetwork.pending'))
    if (checked.error) throw new Error(checked.error)
    show.value = false
    emit('enter', settings)
  } catch (reason) { error.value = reason instanceof Error ? reason.message : String(reason) }
  finally { submitting.value = false }
}
</script>

<template>
  <n-modal
    v-model:show="show"
    preset="card"
    :title="t('settings.recoveryMode.title')"
    :style="{ width: '560px', maxWidth: 'calc(100vw - 32px)' }"
    :content-style="{ maxHeight: '65dvh', overflowY: 'auto' }"
    :mask-closable="!submitting"
    :close-on-esc="!submitting"
    :closable="!submitting"
    class="recovery-entry-modal"
  >
    <p class="recovery-entry-hint">{{ t('settings.recoveryNetwork.hint') }}</p>
    <n-spin :show="loading">
      <n-form v-if="draft" :disabled="submitting || preview?.pending_system_network" label-placement="top" @submit.prevent="enter">
        <fieldset class="recovery-mode-fieldset" :disabled="submitting || preview?.pending_system_network">
          <legend>{{ t('settings.recoveryNetwork.mode') }}</legend>
          <ul class="recovery-mode-list">
            <li v-for="option in modes" :key="option.value">
              <label class="recovery-mode-option" :class="{ selected: mode === option.value }">
                <input v-model="mode" type="radio" name="recovery-network-mode" :value="option.value" />
                <span class="recovery-mode-copy"><strong>{{ option.label }}</strong><span>{{ option.hint }}</span></span>
              </label>
            </li>
          </ul>
        </fieldset>
        <template v-if="mode !== 'system'">
          <div v-if="mode === 'static'" class="recovery-address-fields">
            <n-form-item :label="t('settings.recoveryNetwork.address')"><n-input v-model:value="draft.address" placeholder="192.168.1.10/24" /></n-form-item>
            <n-form-item :label="t('settings.recoveryNetwork.gateway')"><n-input v-model:value="draft.gateway" placeholder="192.168.1.1" /></n-form-item>
          </div>
          <n-form-item :label="t('settings.recoveryNetwork.fallback')" label-placement="left"><n-switch v-model:value="draft.fallback_enabled" /></n-form-item>
          <n-form-item v-if="draft.fallback_enabled" :label="t('settings.recoveryNetwork.fallbackAddress')"><n-input v-model:value="draft.fallback_address" placeholder="192.168.233.10/24" /></n-form-item>
        </template>
        <details class="recovery-extra-options">
          <summary>{{ t('settings.recoveryNetwork.moreOptions') }}</summary>
          <n-form-item :label="t('settings.recoveryNetwork.interface')"><n-select v-model:value="draft.interface" :options="interfaceOptions" /></n-form-item>
          <n-form-item v-if="mode !== 'system'" :label="t('settings.recoveryNetwork.mac')"><n-input v-model:value="draft.mac_address" :placeholder="t('settings.recoveryNetwork.inheritMac')" /></n-form-item>
          <n-form-item :label="t('settings.recoveryNetwork.customDns')" label-placement="left"><n-switch v-model:value="draft.use_custom_dns" /></n-form-item>
          <n-form-item v-if="draft.use_custom_dns" label="DNS"><n-input v-model:value="dns" placeholder="192.168.1.1, 1.1.1.1" /></n-form-item>
          <p class="recovery-entry-hint">{{ t('settings.recoveryNetwork.limits') }}</p>
        </details>
        <dl class="recovery-network-preview">
          <dt>{{ t('settings.recoveryNetwork.preview') }}</dt><dd>{{ access }}</dd>
          <dt>MAC</dt><dd>{{ effectiveMac }}</dd>
          <dt>DNS</dt><dd>{{ effectiveDns }}</dd>
        </dl>
        <n-alert v-if="preview?.pending_system_network" type="warning" :show-icon="false">{{ t('settings.recoveryNetwork.pending') }}</n-alert>
      </n-form>
      <n-alert v-if="error" type="error" :show-icon="false">{{ error }}</n-alert>
    </n-spin>
    <template #footer>
      <div class="recovery-entry-actions">
        <n-button :disabled="submitting" @click="show = false">{{ t('common.cancel') }}</n-button>
        <n-button type="warning" :loading="submitting" :disabled="loading || !draft || preview?.pending_system_network" @click="enter">{{ t('settings.recoveryMode.confirmAction') }}</n-button>
      </div>
    </template>
  </n-modal>
</template>

<style scoped>
.recovery-entry-hint { margin: 0 0 16px; color: var(--muted-foreground); font-size: 13px; line-height: 1.6; }
.recovery-mode-fieldset { padding: 0; margin: 0 0 20px; border: 0; min-width: 0; }
.recovery-mode-fieldset legend { margin-bottom: 8px; font-size: 13px; }
.recovery-mode-list { display: grid; gap: 8px; padding: 0; margin: 0; list-style: none; }
.recovery-mode-option { display: flex; align-items: center; gap: 12px; min-height: 64px; box-sizing: border-box; padding: 12px 14px; border: 1px solid var(--border); border-radius: 8px; cursor: pointer; }
.recovery-mode-option:hover { background: var(--muted); }
.recovery-mode-option.selected { border-color: var(--primary); background: var(--muted); }
.recovery-mode-option:focus-within { outline: 2px solid var(--primary); outline-offset: 2px; }
.recovery-mode-option input { margin: 0; accent-color: var(--primary); }
.recovery-mode-fieldset:disabled .recovery-mode-option { opacity: .55; cursor: default; }
.recovery-mode-copy { display: grid; gap: 3px; }
.recovery-mode-copy strong { font-size: 14px; font-weight: 500; }
.recovery-mode-copy > span { color: var(--muted-foreground); font-size: 12px; }
.recovery-address-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.recovery-extra-options { margin: 0 0 16px; }
.recovery-extra-options summary { cursor: pointer; padding: 8px 0; margin-bottom: 8px; font-size: 13px; }
.recovery-network-preview { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; margin: 0; padding: 14px 0 0; border-top: 1px solid var(--border); font-size: 12px; }
.recovery-network-preview dt { color: var(--muted-foreground); }
.recovery-network-preview dd { margin: 0; overflow-wrap: anywhere; }
.recovery-entry-actions { display: flex; justify-content: flex-end; gap: 8px; }
@media (max-width: 480px) { .recovery-address-fields { grid-template-columns: 1fr; gap: 0; } }
</style>
