<script setup lang="ts">
import { useId } from 'vue'
import { NSwitch } from 'naive-ui'
import { t } from '@/i18n/runtime'

const enabled = defineModel<boolean>({ required: true })
const labelId = useId()
</script>

<template>
  <div class="install-enable-option">
    <span :id="labelId">{{ t('settings.plugins.enableAfterInstall', 'Enable after installation') }}</span>
    <n-switch v-model:value="enabled" :aria-labelledby="labelId" />
  </div>
</template>

<style scoped>
.install-enable-option { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 40px; font-size: 13px; }
</style>
