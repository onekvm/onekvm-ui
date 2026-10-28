<script setup lang="ts">
import { Zap } from '@/icons'
import { computed, shallowRef } from 'vue'

import { t } from '@/i18n/runtime'

const props = defineProps<{
  endpoints: { inn: number; out: number }
  label?: string
}>()

const showTooltip = shallowRef(false)
const count = computed(() => props.endpoints.inn + props.endpoints.out)
const description = computed(() => (
  props.label || t('settings.advancedSettings.usbPage.capacityCost', 'Uses {count} USB capacity units ({in} upstream, {out} downstream).')
).replace('{count}', String(count.value))
  .replace('{in}', String(props.endpoints.inn))
  .replace('{out}', String(props.endpoints.out)))
</script>

<template>
  <n-tooltip v-model:show="showTooltip" :style="{ maxWidth: '280px' }">
    <template #trigger>
      <n-tag
        class="usb-capacity-badge"
        size="small"
        type="warning"
        :bordered="false"
        role="img"
        :aria-label="description"
        tabindex="0"
        @focus="showTooltip = true"
        @blur="showTooltip = false"
        @keydown.esc="showTooltip = false"
      >
        <span class="usb-capacity-badge-content" aria-hidden="true">
          <Zap :size="12" />
          <sup class="usb-capacity-directions">
            <span v-if="endpoints.inn > 0">↑{{ endpoints.inn }}</span>
            <span v-if="endpoints.out > 0">↓{{ endpoints.out }}</span>
          </sup>
        </span>
      </n-tag>
    </template>
    {{ description }}
  </n-tooltip>
</template>

<style scoped>
.usb-capacity-badge { flex: 0 0 auto; font-variant-numeric: tabular-nums; }
.usb-capacity-badge:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
.usb-capacity-badge-content { display: inline-flex; align-items: center; gap: 2px; height: 18px; font-weight: 600; white-space: nowrap; }
.usb-capacity-directions { display: inline-flex; align-self: flex-start; gap: 2px; font-size: 10px; line-height: 1; }
</style>
