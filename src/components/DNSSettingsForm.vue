<script setup lang="ts">
import { computed } from 'vue'

import { t } from '@/i18n/runtime'
import { isDNSServer } from '@/lib/network'

const props = defineProps<{ modelValue: string[]; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()

const text = computed(() => (props.modelValue || []).join('\n'))

function update(value: string) {
  emit('update:modelValue', value.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean))
}
</script>

<template>
  <section class="network-global-card">
    <header>
      <div>
        <h2>{{ t('network.dns.title', 'DNS servers') }}</h2>
        <p>{{ t('network.dns.description', 'System-wide name servers used by all network interfaces. DoT uses address#name, for example 1.1.1.1#one.one.one.one. DoH uses an https:// URL.') }}</p>
      </div>
    </header>
    <n-form label-placement="top" :show-feedback="false">
      <n-form-item :label="t('network.dns.servers', 'Name servers')">
        <n-input
          :value="text"
          :disabled="disabled"
          type="textarea"
          :autosize="{ minRows: 2, maxRows: 5 }"
          placeholder="1.1.1.1#one.one.one.one&#10;https://cloudflare-dns.com/dns-query"
          :status="modelValue.some((server) => !isDNSServer(server)) ? 'error' : undefined"
          @update:value="update"
        />
        <template #feedback>
          {{ t('network.dns.dohDotHint', 'DoT: 1.1.1.1#one.one.one.one. DoH: https://cloudflare-dns.com/dns-query. Plain IP addresses stay unencrypted.') }}
        </template>
      </n-form-item>
    </n-form>
  </section>
</template>

<style scoped>
.network-global-card { display: grid; gap: 14px; padding-top: 18px; border-top: 1px solid #30363d; }
.network-global-card header h2 { margin: 0; font-size: 14px; }
.network-global-card header p { margin: 4px 0 0; color: #8f99a3; font-size: 11px; }
</style>
