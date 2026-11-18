<script setup lang="ts">
import { useSettingsMode } from '@/composables/useSettingsMode'
import { t } from '@/i18n/runtime'

const { mode, setMode } = useSettingsMode()
</script>

<template>
  <n-radio-group
    class="settings-mode-switch"
    :value="mode"
    size="small"
    :aria-label="t('settings.advancedSettings.mode.label', 'Settings shown')"
    @update:value="setMode"
  >
    <n-radio-button value="simple">{{ t('settings.advancedSettings.mode.simple', 'Simple') }}</n-radio-button>
    <n-radio-button value="advanced">{{ t('settings.advancedSettings.mode.advanced', 'Advanced') }}</n-radio-button>
  </n-radio-group>
</template>

<style scoped>
.settings-mode-switch {
  display: flex;
  width: 100%;
}

.settings-mode-switch :deep(.n-radio-button) {
  flex: 1 1 0;
  min-width: 0;
  text-align: center;
}
</style>
