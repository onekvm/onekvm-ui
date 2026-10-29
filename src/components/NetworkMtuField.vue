<script setup lang="ts">
import { computed } from 'vue'
import { t } from '@/i18n/runtime'
import { validMTU } from '@/lib/network'

const props = defineProps<{ modelValue?: number; ipv6?: boolean; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()
const minimum = computed(() => props.ipv6 ? 1280 : 68)
const invalid = computed(() => !validMTU(props.modelValue, props.ipv6))
</script>

<template>
  <n-form-item :label="t('network.interfaces.mtu', 'MTU (bytes)')" :show-feedback="true" :validation-status="invalid ? 'error' : undefined">
    <n-input-number
      :value="modelValue || null"
      :input-props="{ 'aria-label': t('network.interfaces.mtu', 'MTU (bytes)') }"
      :disabled="disabled"
      :min="minimum"
      :max="65535"
      :precision="0"
      :show-button="false"
      clearable
      :placeholder="t('network.interfaces.mtuUnspecified', 'Unspecified')"
      :status="invalid ? 'error' : undefined"
      @update:value="emit('update:modelValue', $event ?? 0)"
    />
    <template #feedback>
      {{ invalid
        ? t('network.interfaces.mtuInvalid', 'Enter an integer from {min} to 65535.').replace('{min}', String(minimum))
        : t('network.interfaces.mtuHint', 'Leave empty to keep system settings.') }}
    </template>
  </n-form-item>
</template>
