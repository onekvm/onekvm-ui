<script setup lang="ts">
import { computed, shallowRef, useId, watch } from 'vue'
import { t } from '@/i18n/runtime'
import { isIPv4 } from '@/lib/network'

const props = withDefaults(defineProps<{
  modelValue: string
  allowAutomatic: boolean
  disabled?: boolean
}>(), { disabled: false })
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const inputID = useId()
const manual = shallowRef(Boolean(props.modelValue))
const draft = shallowRef(props.modelValue)
const useManual = computed(() => !props.allowAutomatic || manual.value)

watch(() => props.modelValue, (value) => {
  // Local edits already updated the draft. External changes replace it.
  if (value === (useManual.value ? draft.value : '')) return
  draft.value = value
  manual.value = Boolean(value)
})
watch(() => props.allowAutomatic, () => {
  draft.value = props.modelValue
  manual.value = Boolean(props.modelValue)
})

function toggleManual(value: boolean) {
  manual.value = value
  emit('update:modelValue', value ? draft.value : '')
}

function updateGateway(value: string) {
  draft.value = value
  emit('update:modelValue', value)
}
</script>

<template>
  <n-form-item class="network-gateway-field" :show-label="false">
    <div class="gateway-field-content">
      <div class="gateway-field-heading">
        <label :for="inputID">{{ t('network.interfaces.gateway', 'Gateway') }}</label>
        <n-checkbox
          v-if="allowAutomatic"
          class="gateway-field-mode"
          :checked="manual"
          :disabled="disabled"
          size="small"
          :aria-label="t('network.interfaces.useCustomGateway', 'Use a manual gateway')"
          @update:checked="toggleManual"
        >
          {{ t('network.interfaces.manualGateway', 'Manual') }}
        </n-checkbox>
      </div>
      <n-input
        :value="useManual ? modelValue : ''"
        :disabled="disabled || !useManual"
        :input-props="{ id: inputID, 'aria-label': t('network.interfaces.gateway', 'Gateway') }"
        :placeholder="useManual ? '192.168.1.1' : t('network.interfaces.automatic', 'Automatic')"
        :status="useManual && modelValue && !isIPv4(modelValue) ? 'error' : undefined"
        @update:value="updateGateway"
      />
    </div>
  </n-form-item>
</template>

<style scoped>
.gateway-field-content { width: 100%; }
.gateway-field-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: var(--n-label-height); padding: var(--n-label-padding); color: var(--n-label-text-color); font-size: var(--n-label-font-size); font-weight: var(--n-label-font-weight); }
.gateway-field-mode { flex: 0 0 auto; font-weight: 400; white-space: nowrap; }
</style>
