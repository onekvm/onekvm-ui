<script setup lang="ts">
import { computed } from 'vue'
import type { ManagedNetworkInterface } from '@/api/client'
import { t } from '@/i18n/runtime'
import { isDNSServer, usesCustomDNS } from '@/lib/network'
import NetworkSettingsForm from './NetworkSettingsForm.vue'

const props = defineProps<{ modelValue: ManagedNetworkInterface; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: ManagedNetworkInterface] }>()
const customDns = computed(() => usesCustomDNS(props.modelValue))
const dnsInvalid = computed(() => customDns.value && (!(props.modelValue.dns || []).length || (props.modelValue.dns || []).some(server => !isDNSServer(server))))
function setDns(text: string) {
  emit('update:modelValue', { ...props.modelValue, dns: text.split(/[\s,]+/).filter(Boolean) })
}
</script>

<template>
  <div class="wifi-ip-settings">
    <NetworkSettingsForm :model-value="modelValue" :disabled="disabled" :show-device="false" @update:model-value="emit('update:modelValue', $event)" />
    <n-form-item :label="t('network.dns.title', 'DNS servers')">
      <div class="wifi-ip-dns">
        <n-checkbox :checked="customDns" :disabled="disabled" @update:checked="emit('update:modelValue', { ...modelValue, use_custom_dns: $event })">{{ t('network.dns.custom', 'Use custom DNS servers') }}</n-checkbox>
        <n-input :value="(modelValue.dns || []).join('\n')" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }" :disabled="disabled || !customDns" :status="dnsInvalid ? 'error' : undefined" :placeholder="t('network.wifi.dnsHint', 'One DNS server per line; automatic DNS comes from DHCP or IPv6 RA.')" @update:value="setDns" />
      </div>
    </n-form-item>
  </div>
</template>

<style scoped>
.wifi-ip-settings, .wifi-ip-dns { display: grid; gap: 12px; width: 100%; }
</style>
