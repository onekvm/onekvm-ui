<script setup lang="ts">
// Configuration values and bounds are in kbps; the input displays Mbps.
withDefaults(defineProps<{
  value?: number | null
  min?: number
  max?: number
  step?: number
  disabled?: boolean
}>(), { step: 1000 })

const emit = defineEmits<{ 'update:value': [value: number | null] }>()

function updateValue(value: number | null) {
  emit('update:value', value === null ? null : Math.round(value * 1000))
}
</script>

<template>
  <n-input-number
    :value="value == null ? null : value / 1000"
    :min="min === undefined ? undefined : min / 1000"
    :max="max === undefined ? undefined : max / 1000"
    :step="step / 1000"
    :precision="3"
    :disabled="disabled"
    @update:value="updateValue"
  >
    <template #suffix>Mbps</template>
  </n-input-number>
</template>
