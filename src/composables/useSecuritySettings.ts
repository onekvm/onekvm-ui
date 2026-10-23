import { computed, onMounted, ref, shallowRef } from 'vue'
import { api, type OneKVMServiceSettings, type OneKVMSecuritySettings, type ReverseProxySettings } from '@/api/client'
import { defaultReverseProxySettings, validReverseProxySettings } from '@/lib/reverse-proxy'
import { t } from '@/i18n/runtime'
import { useMessage } from 'naive-ui'

export interface SecuritySettingsForm {
  reverseProxy: ReverseProxySettings
  apiProtection: boolean
  apiMaxFailures: number | null
  apiBanDurationSeconds: number | null
  apiScope: 'ip' | 'subnet'
  apiIpv4Prefix: number | null
  apiIpv6Prefix: number | null
  apiWindowSeconds: number | null
  apiRequestsPerSecond: number | null
  apiBurst: number | null
  honeypotEnabled: boolean
  serverDisguise: boolean
  enabled: boolean
  blockWeakCredentials: boolean
  maxFailures: number | null
  banDurationHours: number | null
  scope: 'ip' | 'subnet'
  ipv4Prefix: number | null
  ipv6Prefix: number | null
  crashRecovery: boolean
}

function formFromSettings(settings: OneKVMServiceSettings): SecuritySettingsForm {
  return {
    reverseProxy: settings.reverse_proxy ?? defaultReverseProxySettings(),
    apiProtection: settings.api_protection_enabled ?? true,
    apiMaxFailures: settings.api_protection_max_failures ?? 8,
    apiBanDurationSeconds: settings.api_protection_ban_duration_seconds ?? 600,
    apiScope: settings.api_protection_scope ?? "ip",
    apiIpv4Prefix: settings.api_protection_ipv4_prefix ?? 24,
    apiIpv6Prefix: settings.api_protection_ipv6_prefix ?? 64,
    apiWindowSeconds: settings.api_protection_window_seconds ?? 10,
    apiRequestsPerSecond: settings.api_protection_requests_per_second ?? 10,
    apiBurst: settings.api_protection_burst ?? 40,
    honeypotEnabled: settings.honeypot_enabled ?? true,
    serverDisguise: settings.server_disguise_enabled ?? true,
    enabled: settings.login_protection_enabled,
    blockWeakCredentials: settings.login_protection_block_weak_credentials ?? false,
    maxFailures: settings.login_protection_max_failures,
    banDurationHours: settings.login_protection_ban_duration_seconds / 3600,
    scope: settings.login_protection_scope,
    ipv4Prefix: settings.login_protection_ipv4_prefix,
    ipv6Prefix: settings.login_protection_ipv6_prefix,
    crashRecovery: settings.crash_recovery_enabled,
  }
}

function integerInRange(value: number | null, max: number) {
  return value !== null && Number.isInteger(value) && value >= 1 && value <= max
}

export function validSecuritySettings(value: SecuritySettingsForm | null): boolean {
  return value !== null && integerInRange(value.maxFailures, 100)
    && value.banDurationHours !== null && Number.isFinite(value.banDurationHours)
    && value.banDurationHours >= 1 / 3600 && value.banDurationHours <= 720
    && integerInRange(value.ipv4Prefix, 32) && integerInRange(value.ipv6Prefix, 128)
    && integerInRange(value.apiMaxFailures, 100) && integerInRange(value.apiWindowSeconds, 3600)
    && integerInRange(value.apiRequestsPerSecond, 1000) && integerInRange(value.apiBurst, 1000)
    && integerInRange(value.apiBanDurationSeconds, 2592000)
    && integerInRange(value.apiIpv4Prefix, 32) && integerInRange(value.apiIpv6Prefix, 128)
    && validReverseProxySettings(value.reverseProxy)
}

export function useSecuritySettings() {
  const message = useMessage()
  const form = ref<SecuritySettingsForm | null>(null)
  const saved = shallowRef('')
  const loading = shallowRef(true)
  const saving = shallowRef(false)
  const error = shallowRef('')
  const revision = shallowRef(0)
  const dirty = computed(() => form.value !== null && JSON.stringify(form.value) !== saved.value)
  const valid = computed(() => validSecuritySettings(form.value))

  function assign(settings: OneKVMServiceSettings) {
    form.value = formFromSettings(settings)
    saved.value = JSON.stringify(form.value)
  }

  async function load() {
    loading.value = true
    error.value = ''
    try {
      assign(await api.getOneKVMServiceSettings())
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason)
    } finally {
      loading.value = false
    }
  }

  async function save() {
    if (!form.value || !valid.value || !dirty.value || saving.value) return false
    saving.value = true
    error.value = ''
    const value = form.value
    const update: OneKVMSecuritySettings = {
      reverse_proxy: value.reverseProxy,
      api_protection_enabled: value.apiProtection,
      api_protection_max_failures: value.apiMaxFailures!,
      api_protection_ban_duration_seconds: value.apiBanDurationSeconds!,
      api_protection_scope: value.apiScope,
      api_protection_ipv4_prefix: value.apiIpv4Prefix!,
      api_protection_ipv6_prefix: value.apiIpv6Prefix!,
      api_protection_window_seconds: value.apiWindowSeconds!,
      api_protection_requests_per_second: value.apiRequestsPerSecond!,
      api_protection_burst: value.apiBurst!,
      honeypot_enabled: value.honeypotEnabled,
      server_disguise_enabled: value.serverDisguise,
      login_protection_enabled: value.enabled,
      login_protection_block_weak_credentials: value.blockWeakCredentials,
      login_protection_max_failures: value.maxFailures!,
      login_protection_ban_duration_seconds: Math.round(value.banDurationHours! * 3600),
      login_protection_scope: value.scope,
      login_protection_ipv4_prefix: value.ipv4Prefix!,
      login_protection_ipv6_prefix: value.ipv6Prefix!,
      crash_recovery_enabled: value.crashRecovery,
    }
    try {
      assign(await api.saveOneKVMSecuritySettings(update))
      revision.value++
      message.success(t('settings.success', 'Settings saved'))
      return true
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason)
      return false
    } finally {
      saving.value = false
    }
  }

  onMounted(load)
  return { form, loading, saving, error, dirty, valid, revision, load, save }
}
