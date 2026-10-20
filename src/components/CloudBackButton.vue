<script setup lang="ts">
import { ChevronLeft } from '@/icons'
import { NButton } from 'naive-ui'
import { isCloudHosted } from '@/api/service-url'
import { t } from '@/i18n/runtime'

withDefaults(defineProps<{ showLabel?: boolean }>(), { showLabel: false })
const cloudHosted = isCloudHosted()

function back() {
  if (window.parent === window) {
    window.location.assign('/app')
    return
  }
  window.parent.postMessage({ type: 'onekvm-cloud-back' }, window.location.origin)
}
</script>

<template>
  <NButton v-if="cloudHosted" class="cloud-back-button" quaternary size="small" attr-type="button"
    :aria-label="t('toolbar.cloudBack', 'Back to devices')"
    :title="t('toolbar.cloudBack', 'Back to devices')" @pointerdown.stop @click="back">
    <template #icon><ChevronLeft :size="18" /></template>
    <span v-if="showLabel">{{ t('toolbar.cloudBack', 'Back to devices') }}</span>
  </NButton>
</template>

<style scoped>
.cloud-back-button { flex-shrink: 0; min-width: 30px; min-height: 30px; }
</style>
