<script setup lang="ts">
import { ExternalLink } from '@lucide/vue'
import { computed } from 'vue'

import { t } from '@/i18n/runtime'
import { DEFAULT_DISCOVERY_URL, validDiscoveryURL } from '@/lib/network'

const props = defineProps<{ modelValue?: string; enabled?: boolean; useCustomUrl?: boolean; disabled?: boolean }>()
const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:enabled': [value: boolean]
  'update:useCustomUrl': [value: boolean]
}>()

const url = computed(() => props.modelValue ?? DEFAULT_DISCOVERY_URL)
const valid = computed(() => validDiscoveryURL(url.value))
const activeUrl = computed(() => props.useCustomUrl ? url.value : DEFAULT_DISCOVERY_URL)
</script>

<template>
  <section class="network-discovery-card">
    <header>
      <div>
        <h2>{{ t('network.discovery.title', 'Device discovery') }}</h2>
        <p>{{ t('network.discovery.description', 'Find and open OneKVM devices on your local network.') }}</p>
      </div>
      <n-button
        tag="a"
        text
        :href="props.enabled !== false && (!props.useCustomUrl || valid) ? activeUrl : undefined"
        target="_blank"
        rel="noopener noreferrer"
        :disabled="props.enabled === false || (props.useCustomUrl && !valid)"
      >
        <template #icon><ExternalLink :size="14" /></template>
        {{ t('network.discovery.open', 'Open discovery page') }}
      </n-button>
    </header>
    <label class="network-inline-option">
      <span>
        <strong>{{ t('network.discovery.enabled', 'Allow this device to be discovered') }}</strong>
        <small>{{ t('network.discovery.enabledHint', 'When off, the discovery page can no longer find this device.') }}</small>
      </span>
      <n-switch
        :value="props.enabled !== false"
        :disabled="disabled"
        @update:value="emit('update:enabled', $event)"
      />
    </label>
    <label class="network-inline-option" :class="{ 'is-disabled': props.enabled === false }">
      <span>
        <strong>{{ t('network.discovery.custom', 'Use a custom discovery URL') }}</strong>
        <small>{{ t('network.discovery.customHint', 'The default is https://find.onekvm.org.') }}</small>
      </span>
      <n-switch
        :value="Boolean(props.useCustomUrl)"
        :disabled="disabled || props.enabled === false"
        @update:value="emit('update:useCustomUrl', $event)"
      />
    </label>
    <n-collapse-transition :show="props.enabled !== false && Boolean(props.useCustomUrl)">
      <n-form label-placement="top" :show-feedback="true">
        <n-form-item
          :label="t('network.discovery.url', 'Discovery URL')"
          :validation-status="valid ? undefined : 'error'"
          :feedback="valid ? undefined : t('network.discovery.invalid', 'Enter a valid HTTP or HTTPS URL.')"
          :show-feedback="!valid"
        >
          <n-input
            :value="url"
            :disabled="disabled"
            :status="valid ? undefined : 'error'"
            placeholder="https://find.onekvm.org"
            @update:value="emit('update:modelValue', $event.trim())"
          />
        </n-form-item>
      </n-form>
    </n-collapse-transition>
  </section>
</template>

<style scoped>
.network-discovery-card { display: grid; gap: 16px; padding-top: 20px; border-top: 1px solid var(--border); }
.network-discovery-card header { display: flex; align-items: start; justify-content: space-between; gap: 16px; }
.network-discovery-card h2 { margin: 0; font-size: 14px; }
.network-discovery-card header p { margin: 4px 0 0; color: var(--muted-foreground); font-size: 11px; line-height: 1.5; }
.network-discovery-card :deep(.n-form-item) { margin-bottom: 0; }
.network-inline-option { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; align-items: center; min-height: 48px; cursor: pointer; }
.network-inline-option strong { display: block; font-size: 13px; }
.network-inline-option small { display: block; margin-top: 3px; color: var(--muted-foreground); font-size: 11px; line-height: 1.45; }
.network-inline-option.is-disabled { opacity: .55; cursor: default; }
@media (max-width: 640px) {
  .network-discovery-card header { align-items: start; flex-direction: column; }
}
</style>
