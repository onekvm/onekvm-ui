<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import type { SelectProps } from 'naive-ui'
import { t } from '@/i18n/runtime'
import { videoBitratePresets, type VideoBitrateRange } from '@/lib/video-bitrate'
import VideoBitrateInput from './VideoBitrateInput.vue'

const props = defineProps<{
  value?: number
  range?: VideoBitrateRange
  disabled?: boolean
  selectProps?: SelectProps
}>()
const emit = defineEmits<{
  'update:value': [value: number]
  'update:show': [show: boolean]
}>()
const custom = shallowRef(false)
const presets = computed(() => videoBitratePresets(props.range))
const selection = computed(() => custom.value || ((props.value ?? 0) > 0 && !presets.value.includes(props.value!))
  ? 'custom' : props.value ?? 0)
const options = computed(() => [
  { label: t('screen.auto', 'Automatic'), value: 0 },
  ...presets.value.map(value => ({ label: `${value / 1000} Mbps`, value })),
  { label: t('screen.qualityCustom', 'Custom'), value: 'custom' },
])

function updateSelection(value: string | number | null) {
  if (!props.range) return
  custom.value = value === 'custom'
  if (value === 'custom') {
    if (!(props.value && props.value > 0)) {
      emit('update:value', props.range.default > 0 ? props.range.default : props.range.maximum)
    }
  } else if (typeof value === 'number') {
    emit('update:value', value)
  }
}

function updateCustom(value: number | null) {
  if (value === null || !props.range) return
  emit('update:value', Math.max(props.range.minimum, Math.min(props.range.maximum, value)))
}

watch(() => props.value, value => { if (!value) custom.value = false })
</script>

<template>
  <div class="video-bitrate-control">
    <n-select
      v-bind="selectProps"
      :value="selection"
      :options="options"
      :disabled="disabled || !range"
      @update:value="updateSelection"
      @update:show="emit('update:show', $event)"
    />
    <VideoBitrateInput
      v-if="selection === 'custom' && range"
      :value="value"
      :min="range.minimum"
      :max="range.maximum"
      :step="range.step"
      :disabled="disabled"
      :aria-label="t('screen.bitrateBudget', 'Bitrate ceiling')"
      @update:value="updateCustom"
    />
  </div>
</template>

<style scoped>
.video-bitrate-control { display: grid; min-width: 0; gap: 6px; }
</style>
