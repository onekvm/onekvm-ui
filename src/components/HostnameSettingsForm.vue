<script setup lang="ts">
import { computed } from 'vue'

import { t } from '@/i18n/runtime'
import { validHostname } from '@/lib/network'

const props = defineProps<{ modelValue: string; mdns?: boolean; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string]; 'update:mdns': [value: boolean] }>()
const valid = computed(() => validHostname(props.modelValue))
</script>

<template>
  <section class="network-hostname-card">
    <header>
      <div>
        <h2>{{ t('settings.device.hostname', 'Hostname') }}</h2>
        <p>{{ t('settings.device.hostnameDesc', 'Name used to identify this device on the network') }}</p>
      </div>
    </header>
    <n-form label-placement="top" :show-feedback="false">
      <n-form-item :show-label="false">
        <n-input
          :value="modelValue"
          :disabled="disabled"
          maxlength="63"
          :input-props="{ 'aria-label': t('settings.device.hostname', 'Hostname') }"
          placeholder="onekvm"
          :status="valid ? undefined : 'error'"
          @update:value="emit('update:modelValue', $event.trim())"
        />
      </n-form-item>
    </n-form>
    <label class="network-inline-option">
      <span>
        <strong>{{ t('network.mdns.title', 'mDNS') }}</strong>
        <small>{{ t('network.mdns.hint', 'Advertise hostname.local on the LAN. Turn this off if you do not use discovery.') }}</small>
      </span>
      <n-switch
        :value="Boolean(props.mdns)"
        :disabled="disabled"
        @update:value="emit('update:mdns', $event)"
      />
    </label>
  </section>
</template>

<style scoped>
.network-hostname-card { display: grid; gap: 16px; padding-top: 20px; border-top: 1px solid var(--border); }
.network-hostname-card header h2 { margin: 0; font-size: 14px; }
.network-hostname-card header p { margin: 4px 0 0; color: var(--muted-foreground); font-size: 11px; line-height: 1.5; }
.network-inline-option {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
  align-items: center;
  min-height: 48px;
  padding-top: 2px;
  cursor: pointer;
}
.network-inline-option strong { display: block; font-size: 13px; }
.network-inline-option small { display: block; margin-top: 3px; color: var(--muted-foreground); font-size: 11px; line-height: 1.45; }
</style>
