<script setup lang="ts">
import { ref } from 'vue'
import { Power, RotateCcw, TimerReset } from '@lucide/vue'

import { t } from '@/i18n/runtime'

type PowerAction = 'on' | 'off' | 'reset'

const props = defineProps<{
  available: boolean
  canPower: boolean
  pwrLed?: boolean
  hddLed?: boolean
  loadingAction: PowerAction | null
  placement?: 'top-end' | 'bottom-end' | 'right-start' | 'left-start'
}>()

const emit = defineEmits<{
  action: [action: PowerAction]
  'update:show': [show: boolean]
}>()

const popoverOpen = ref(false)

function updateShow(show: boolean) {
  popoverOpen.value = show
  emit('update:show', show)
}

function selectAction(action: PowerAction) {
  if (!props.canPower || props.loadingAction) return
  updateShow(false)
  emit('action', action)
}

function ledLabel(value: boolean | undefined) {
  if (value === undefined) return t('deviceStatus.waiting', 'Unknown')
  return value ? t('power.on', 'On') : t('power.off', 'Off')
}
</script>

<template>
  <n-popover
    :show="popoverOpen"
    trigger="click"
    :placement="props.placement || 'bottom-end'"
    :show-arrow="false"
    class="control-popover power-control-popover"
    @update:show="updateShow"
  >
    <template #trigger><slot /></template>

    <div class="power-control-panel">
      <header class="control-popover-header">
        <strong>{{ t('power.title', 'Power') }}</strong>
      </header>

      <div class="power-status-values" :aria-label="t('power.atxStatus', 'ATX status')">
        <div v-if="!available">
          <span>{{ t('power.atxStatus', 'ATX status') }}</span>
          <strong>{{ t('deviceStatus.error', 'Disconnected') }}</strong>
        </div>
        <div v-if="pwrLed !== undefined">
          <span><i class="power-status-led pwr" :data-on="pwrLed" />{{ t('power.pwrLed', 'PWR LED') }}</span>
          <strong>{{ ledLabel(pwrLed) }}</strong>
        </div>
        <div v-if="hddLed !== undefined">
          <span><i class="power-status-led hdd" :data-on="hddLed" />{{ t('power.hddLed', 'HDD LED') }}</span>
          <strong>{{ ledLabel(hddLed) }}</strong>
        </div>
      </div>

      <div v-if="canPower" class="power-control-actions">
        <n-button
          secondary
          :disabled="loadingAction !== null"
          :loading="loadingAction === 'on'"
          @click="selectAction('on')"
        >
          <template #icon><Power /></template>
          {{ t('power.powerShort', 'Power (short click)') }}
        </n-button>
        <n-button
          secondary
          :disabled="loadingAction !== null"
          :loading="loadingAction === 'off'"
          @click="selectAction('off')"
        >
          <template #icon><TimerReset /></template>
          {{ t('power.powerLong', 'Power (long click)') }} · 8s
        </n-button>
        <n-button
          secondary
          :disabled="loadingAction !== null"
          :loading="loadingAction === 'reset'"
          @click="selectAction('reset')"
        >
          <template #icon><RotateCcw /></template>
          {{ t('power.reset', 'Reset') }}
        </n-button>
      </div>
    </div>
  </n-popover>
</template>
