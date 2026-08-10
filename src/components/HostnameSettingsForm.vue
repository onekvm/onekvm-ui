<script setup lang="ts">
import { computed } from 'vue'

import { t } from '@/i18n/runtime'
import { validHostname } from '@/lib/network'

const props = defineProps<{ modelValue: string; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const valid = computed(() => validHostname(props.modelValue))
</script>

<template>
  <section class="network-hostname-card">
    <header>
      <div>
        <h2>{{ t('settings.device.hostname', 'Hostname') }}</h2>
        <p>{{ t('settings.device.hostnameDesc', 'Set system hostname') }}</p>
      </div>
    </header>
    <n-form label-placement="top" :show-feedback="false">
      <n-form-item :label="t('settings.device.hostname', 'Hostname')">
        <n-input
          :value="modelValue"
          :disabled="disabled"
          maxlength="63"
          placeholder="onekvm"
          :status="valid ? undefined : 'error'"
          @update:value="emit('update:modelValue', $event.trim())"
        />
      </n-form-item>
    </n-form>
  </section>
</template>

<style scoped>
.network-hostname-card { display: grid; gap: 14px; padding-top: 18px; border-top: 1px solid #30363d; }
.network-hostname-card header h2 { margin: 0; font-size: 14px; }
.network-hostname-card header p { margin: 4px 0 0; color: #8f99a3; font-size: 11px; }
</style>
