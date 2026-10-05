<script setup lang="ts">
import { ref } from 'vue'
import { Power, RotateCcw, TimerReset } from '@lucide/vue'

import { t } from '@/i18n/runtime'
import ControlOverlay from './ControlOverlay.vue'

type PowerAction = 'on' | 'off' | 'reset'

const props = defineProps<{
  available: boolean
  canPower: boolean
  pwrLed?: boolean
  hddLed?: boolean
  loadingAction: PowerAction | null
  placement?: 'top-end' | 'bottom-end' | 'right-start' | 'left-start'
  sheet?: boolean
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

function hasLed(value: boolean | undefined | null) {
  return value === true || value === false
}

function ledLabel(value: boolean | undefined | null) {
  return value ? t('power.ledOn', 'On') : t('power.ledOff', 'Off')
}
</script>

<template>
  <ControlOverlay
    :show="popoverOpen"
    :sheet="sheet"
    :placement="props.placement"
    popover-class="control-popover power-control-popover"
    @update:show="updateShow"
  >
    <slot />
    <template #title>{{ t('power.title', 'Power') }}</template>
    <template #panel>
    <div class="power-control-panel">
      <header class="control-popover-header">
        <strong>{{ t('power.title', 'Power') }}</strong>
      </header>

      <div
        v-if="!available || hasLed(pwrLed) || hasLed(hddLed)"
        class="power-status-values"
        :aria-label="t('power.atxStatus', 'ATX status')"
      >
        <div v-if="!available">
          <span>{{ t('power.atxStatus', 'ATX status') }}</span>
          <strong>{{ t('deviceStatus.error', 'Disconnected') }}</strong>
        </div>
        <div v-else-if="hasLed(pwrLed)">
          <span><i class="power-status-led pwr" :data-on="pwrLed === true" />{{ t('power.pwrLed', 'PWR LED') }}</span>
          <strong>{{ ledLabel(pwrLed) }}</strong>
        </div>
        <div v-if="available && hasLed(hddLed)">
          <span><i class="power-status-led hdd" :data-on="hddLed === true" />{{ t('power.hddLed', 'HDD LED') }}</span>
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
    </template>
  </ControlOverlay>
</template>
