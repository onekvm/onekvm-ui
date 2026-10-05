<script setup lang="ts">
import { computed } from 'vue'
import { CircleHelp } from '@lucide/vue'

import { t } from '@/i18n/runtime'
import { isDNSServer } from '@/lib/network'

export type DNSSECMode = 'no' | 'allow-downgrade' | 'yes'

const props = defineProps<{
  modelValue: string[]
  customDnsEnabled?: boolean
  automaticServers?: string[]
  dnssec?: string | boolean
  disabled?: boolean
}>()
const emit = defineEmits<{
  'update:modelValue': [value: string[]]
  'update:customDnsEnabled': [value: boolean]
  'update:dnssec': [value: DNSSECMode]
}>()

const text = computed(() => (props.customDnsEnabled ? props.modelValue : props.automaticServers || []).join('\n'))

const dnssecMode = computed<DNSSECMode>(() => {
  const value = props.dnssec
  if (value === true || value === 'yes') return 'yes'
  if (value === 'allow-downgrade') return 'allow-downgrade'
  return 'no'
})

const dnssecOptions = computed(() => [
  { label: t('network.dnssec.no', 'Off'), value: 'no' },
  { label: t('network.dnssec.allowDowngrade', 'Allow downgrade'), value: 'allow-downgrade' },
  { label: t('network.dnssec.yes', 'Strict'), value: 'yes' },
])

const examples = computed(() => [
  { example: '1.1.1.1', note: t('network.dns.examples.plain', 'Plain DNS') },
  { example: '1.1.1.1:5353', note: t('network.dns.examples.plainPort', 'Plain DNS with a custom port') },
  {
    example: '[2606:4700:4700::1111]:53',
    note: t('network.dns.examples.ipv6Port', 'IPv6 with a port must be in brackets'),
  },
  { example: 'udp://1.1.1.1', note: t('network.dns.examples.udp', 'Plain UDP') },
  { example: 'tcp://1.1.1.1:53', note: t('network.dns.examples.tcp', 'Plain TCP') },
  { example: 'tls://1.1.1.1', note: t('network.dns.examples.dot', 'DoT (IP required)') },
  {
    example: 'tls://1.1.1.1:853#one.one.one.one',
    note: t('network.dns.examples.dotNamed', 'DoT with a custom port; name after # is the certificate name'),
  },
  { example: 'https://cloudflare-dns.com/dns-query', note: t('network.dns.examples.doh', 'DoH') },
  {
    example: 'https://cloudflare-dns.com:443/dns-query',
    note: t('network.dns.examples.dohPort', 'DoH with a custom port'),
  },
])

function update(value: string) {
  emit('update:modelValue', value.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean))
}
</script>

<template>
  <section class="network-global-card">
    <header class="dns-header">
      <h2>{{ t('network.dns.title', 'DNS servers') }}</h2>
      <n-popover
        trigger="click"
        placement="bottom-start"
        :show-arrow="false"
        content-class="dns-examples-popover"
      >
        <template #trigger>
          <n-button
            class="dns-examples-help"
            quaternary
            circle
            size="tiny"
            :aria-label="t('network.dns.examplesHelp', 'DNS server examples')"
          >
            <template #icon><CircleHelp :size="16" /></template>
          </n-button>
        </template>
        <div class="dns-examples-popover-body">
          <p class="dns-popover-description">
            {{ t('network.dns.description', 'Applies to every network interface.\nquic://, h3:// and sdns:// are not supported.') }}
          </p>
          <table class="dns-examples-table">
            <thead>
              <tr>
                <th>{{ t('network.dns.example', 'Example') }}</th>
                <th>{{ t('network.dns.note', 'Notes') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in examples" :key="row.example">
                <td><code>{{ row.example }}</code></td>
                <td>{{ row.note }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </n-popover>
    </header>
    <div class="network-inline-option">
      <span>
        <strong>{{ t('network.dns.custom', 'Use custom DNS servers') }}</strong>
        <small>{{ t('network.dns.customHint', 'When off, use DNS servers supplied by DHCP or IPv6 router advertisements.') }}</small>
      </span>
      <n-switch
        :value="Boolean(customDnsEnabled)"
        :disabled="disabled"
        :aria-label="t('network.dns.custom', 'Use custom DNS servers')"
        @update:value="emit('update:customDnsEnabled', $event)"
      />
    </div>
    <n-form label-placement="top" :show-feedback="false">
      <n-form-item :show-label="false">
        <n-input
          :value="text"
          :disabled="disabled || !customDnsEnabled"
          type="textarea"
          :autosize="{ minRows: 2, maxRows: 5 }"
          :input-props="{ 'aria-label': t('network.dns.title', 'DNS servers') }"
          :placeholder="customDnsEnabled ? 'tls://1.1.1.1:853\nhttps://cloudflare-dns.com/dns-query' : t('network.dns.noAutomatic', 'No DNS servers received yet')"
          :status="customDnsEnabled && (!modelValue.length || modelValue.some((server) => !isDNSServer(server))) ? 'error' : undefined"
          @update:value="update"
        />
      </n-form-item>
    </n-form>
    <small v-if="customDnsEnabled && !modelValue.length" class="dns-validation">
      {{ t('network.dns.required', 'Enter at least one DNS server.') }}
    </small>
    <div class="network-inline-option">
      <span>
        <strong>{{ t('network.dnssec.title', 'DNSSEC') }}</strong>
        <small>{{ t('network.dnssec.hint', 'DNSSEC validation policy. Prefer Off unless your upstream resolvers support DNSSEC; Strict fails closed when signatures are missing or stripped.') }}</small>
      </span>
      <n-select
        class="dnssec-select"
        size="small"
        :value="dnssecMode"
        :options="dnssecOptions"
        :disabled="disabled"
        :consistent-menu-width="false"
        @update:value="emit('update:dnssec', $event)"
      />
    </div>
  </section>
</template>

<style scoped>
.network-global-card { display: grid; gap: 16px; padding-top: 20px; border-top: 1px solid var(--border); }
.dns-header { display: flex; align-items: center; gap: 2px; }
.dns-header h2 { margin: 0; font-size: 14px; }
.dns-examples-help { color: var(--muted-foreground); }
.dns-examples-help:hover { color: var(--foreground); }
.network-inline-option {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(9.5em, 12em);
  gap: 16px;
  align-items: center;
}
.network-inline-option strong { display: block; font-size: 13px; }
.network-inline-option small { display: block; margin-top: 3px; color: var(--muted-foreground); font-size: 11px; line-height: 1.45; }
.network-inline-option :deep(.n-switch) { justify-self: end; }
.dnssec-select { width: 100%; }
.dns-validation { color: var(--error-color, #d03050); font-size: 11px; margin-top: -12px; }
@media (max-width: 760px) {
  .network-inline-option { grid-template-columns: 1fr; gap: 10px; }
}
</style>

<style>
.dns-examples-popover {
  max-width: min(440px, calc(100vw - 32px)) !important;
  padding: 0 !important;
}
.dns-examples-popover-body {
  max-height: min(420px, 70vh);
  overflow: auto;
}
.dns-popover-description {
  margin: 0;
  padding: 12px;
  border-bottom: 1px solid var(--border);
  color: var(--muted-foreground);
  font-size: 11px;
  line-height: 1.55;
  white-space: pre-line;
}
.dns-examples-table { width: 100%; border-collapse: collapse; font-size: 12px; text-align: left; }
.dns-examples-table th { color: var(--muted-foreground); font-weight: 500; background: var(--onekvm-surface-inset); }
.dns-examples-table th,
.dns-examples-table td { padding: 9px 12px; vertical-align: top; }
.dns-examples-table tbody tr + tr { border-top: 1px solid var(--border); }
.dns-examples-table code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  color: var(--foreground);
  white-space: nowrap;
}
.dns-examples-table td:last-child {
  color: var(--muted-foreground);
  white-space: normal;
  line-height: 1.45;
}
@media (max-width: 760px) {
  .dns-examples-popover-body { max-height: min(300px, 45vh); }
  .dns-examples-table th,
  .dns-examples-table td { padding: 10px; }
  .dns-examples-table code { white-space: normal; }
}
</style>
