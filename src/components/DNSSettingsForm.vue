<script setup lang="ts">
import { computed } from 'vue'

import { t } from '@/i18n/runtime'
import { isDNSServer } from '@/lib/network'

const props = defineProps<{ modelValue: string[]; dnssec?: boolean; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string[]]; 'update:dnssec': [value: boolean] }>()

const text = computed(() => (props.modelValue || []).join('\n'))

function update(value: string) {
  emit('update:modelValue', value.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean))
}
</script>

<template>
  <section class="network-global-card">
    <header>
      <h2>{{ t('network.dns.title', 'DNS servers') }}</h2>
    </header>
    <n-form label-placement="top" :show-feedback="false">
      <n-form-item :show-label="false">
        <n-input
          :value="text"
          :disabled="disabled"
          type="textarea"
          :autosize="{ minRows: 2, maxRows: 5 }"
          :input-props="{ 'aria-label': t('network.dns.title', 'DNS servers') }"
          placeholder="tls://1.1.1.1:853&#10;https://cloudflare-dns.com/dns-query"
          :status="modelValue.some((server) => !isDNSServer(server)) ? 'error' : undefined"
          @update:value="update"
        />
      </n-form-item>
      <n-form-item :label="t('network.dnssec.title', 'DNSSEC')" :show-feedback="true">
        <n-switch
          :value="Boolean(props.dnssec)"
          :disabled="disabled"
          @update:value="emit('update:dnssec', $event)"
        />
        <template #feedback>
          {{ t('network.dnssec.hint', 'Validate DNS responses with DNSSEC. Leave this off unless your resolvers support it; failed signatures or stripped records will break lookups.') }}
        </template>
      </n-form-item>
    </n-form>
    <div class="dns-help">
      <p class="dns-description">{{ t('network.dns.description', 'Applies to every network interface.\nquic://, h3:// and sdns:// are not supported.') }}</p>
      <p class="dns-examples">{{ t('network.dns.examples', '1.1.1.1 — plain DNS\n1.1.1.1:5353 — plain DNS with a custom port\n[2606:4700:4700::1111]:53 — IPv6 with a port must be in brackets\nudp://1.1.1.1 — plain UDP\ntcp://1.1.1.1:53 — plain TCP\ntls://1.1.1.1 — DoT (IP required)\ntls://1.1.1.1:853#one.one.one.one — DoT with a custom port, name after # is the certificate name\nhttps://cloudflare-dns.com/dns-query — DoH\nhttps://cloudflare-dns.com:443/dns-query — DoH with a custom port') }}</p>
    </div>
  </section>
</template>

<style scoped>
.network-global-card { display: grid; gap: 14px; padding-top: 18px; border-top: 1px solid #30363d; }
.network-global-card header h2 { margin: 0; font-size: 14px; }
.dns-help {
  display: grid;
  grid-template-columns: minmax(12em, 0.9fr) minmax(18em, 1.4fr);
  gap: 8px 28px;
  align-items: start;
}
.dns-description,
.dns-examples {
  margin: 0;
  color: #8f99a3;
  font-size: 11px;
  white-space: pre-line;
  line-height: 1.55;
}
@media (max-width: 720px) {
  .dns-help { grid-template-columns: 1fr; }
}
</style>
