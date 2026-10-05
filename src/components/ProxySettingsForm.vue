<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'

import type { ProxyConfig } from '@/api/client'
import { t } from '@/i18n/runtime'
import { validProxyURL } from '@/lib/network'

const props = defineProps<{ modelValue?: ProxyConfig; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: ProxyConfig] }>()

const emptyProxy = (): ProxyConfig => ({})
const hasProxy = (value?: ProxyConfig) => Boolean(
  value?.http?.trim() || value?.https?.trim() || value?.no_proxy?.trim(),
)

const enabled = shallowRef(hasProxy(props.modelValue))
const disabledDraft = shallowRef<ProxyConfig | null>(null)
let lastEmittedSnapshot: string | null = null

const proxySnapshot = (value?: ProxyConfig) => JSON.stringify({
  http: value?.http || '',
  https: value?.https || '',
  no_proxy: value?.no_proxy || '',
})

const current = computed<Required<ProxyConfig>>(() => ({
    http: props.modelValue?.http || '',
    https: props.modelValue?.https || '',
    no_proxy: props.modelValue?.no_proxy || '',
}))

watch(() => props.modelValue, (value) => {
  if (proxySnapshot(value) === lastEmittedSnapshot) {
    lastEmittedSnapshot = null
    return
  }
  enabled.value = hasProxy(value)
  if (hasProxy(value)) disabledDraft.value = null
})

function updateModel(value: ProxyConfig) {
  lastEmittedSnapshot = proxySnapshot(value)
  emit('update:modelValue', value)
}

function setEnabled(value: boolean) {
  enabled.value = value
  if (!value) {
    disabledDraft.value = { ...current.value }
    updateModel(emptyProxy())
    return
  }
  if (disabledDraft.value && hasProxy(disabledDraft.value)) {
    updateModel({ ...disabledDraft.value })
  }
}

function update<K extends keyof ProxyConfig>(key: K, value: ProxyConfig[K]) {
  updateModel({ ...current.value, [key]: value })
}
</script>

<template>
  <section class="network-hostname-card">
    <header>
      <div>
        <h2>{{ t('network.proxy.title', 'Proxy server') }}</h2>
        <p>{{ t('network.proxy.description', 'Route device-originated traffic such as updates and ACME through an HTTP(S) or SOCKS proxy.') }}</p>
      </div>
      <n-switch
        :value="enabled"
        :disabled="disabled"
        :aria-label="t('network.proxy.enable', 'Enable proxy server')"
        @update:value="setEnabled"
      />
    </header>
    <n-collapse-transition :show="enabled">
      <n-form label-placement="top" :show-feedback="true" class="proxy-settings-fields">
        <n-form-item :label="t('network.proxy.http', 'HTTP proxy')">
          <n-input
            :value="current.http"
            :disabled="disabled"
            placeholder="http://proxy.example:8080"
            clearable
            :status="validProxyURL(current.http) ? undefined : 'error'"
            @update:value="update('http', $event.trim())"
          />
        </n-form-item>
        <n-form-item :label="t('network.proxy.https', 'HTTPS proxy')">
          <n-input
            :value="current.https"
            :disabled="disabled"
            :placeholder="t('network.proxy.httpsPlaceholder', 'Same as HTTP proxy if empty')"
            clearable
            :status="validProxyURL(current.https) ? undefined : 'error'"
            @update:value="update('https', $event.trim())"
          />
        </n-form-item>
        <n-form-item :label="t('network.proxy.noProxy', 'No proxy')">
          <n-input
            :value="current.no_proxy"
            :disabled="disabled"
            placeholder="localhost,127.0.0.1,10.0.0.0/8"
            clearable
            @update:value="update('no_proxy', $event.trim())"
          />
        </n-form-item>
      </n-form>
    </n-collapse-transition>
  </section>
</template>

<style scoped>
.network-hostname-card {
  display: grid;
  gap: 16px;
  padding-top: 20px;
  border-top: 1px solid var(--border, var(--border));
}
.network-hostname-card > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.network-hostname-card header h2 { margin: 0; font-size: 14px; }
.network-hostname-card header p { margin: 4px 0 0; color: var(--muted-foreground); font-size: 11px; line-height: 1.5; }
.proxy-settings-fields :deep(.n-form-item:last-child) {
  margin-bottom: 0;
}
</style>
