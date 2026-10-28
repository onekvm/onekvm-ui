<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import type { SelectProps } from 'naive-ui'

import { t } from '@/i18n/runtime'
import type { AudioInputSource } from '@/lib/audio-settings'

defineOptions({ inheritAttrs: false })
const props = defineProps<{
  options: SelectProps['options']
  disabled?: boolean
  unavailable: boolean
  to?: SelectProps['to']
}>()
const source = defineModel<AudioInputSource>({ required: true })
const showTooltip = shallowRef(false)
const unavailableHint = computed(() => t('usbAudio.hdmiUnsupported', 'This device does not support HDMI audio. Only USB audio is available.'))
</script>

<template>
  <n-tooltip
    v-model:show="showTooltip"
    :disabled="!props.unavailable"
    :to="props.to"
    :style="{ maxWidth: '280px' }"
  >
    <template #trigger>
      <div
        class="audio-source-select"
        :tabindex="props.unavailable ? 0 : undefined"
        :aria-label="props.unavailable ? unavailableHint : undefined"
        @focus="showTooltip = true"
        @blur="showTooltip = false"
        @keydown.esc="showTooltip = false"
      >
        <n-select
          v-bind="$attrs"
          v-model:value="source"
          :options="props.options"
          :disabled="props.disabled || props.unavailable"
          :to="props.to"
          :aria-label="t('usbAudio.source', 'Input source')"
        />
      </div>
    </template>
    {{ unavailableHint }}
  </n-tooltip>
</template>

<style scoped>
.audio-source-select { width: 100%; min-width: 0; }
.audio-source-select:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; border-radius: 3px; }
</style>
