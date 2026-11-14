<script setup lang="ts">
import { NButton, useMessage } from 'naive-ui'
import { t } from '@/i18n/runtime'

defineProps<{ disabled?: boolean }>()

const message = useMessage()

function testMessage() {
  message.destroyAll()
  message.success(t('settings.advancedSettings.personalizationPage.testMessageContent', 'This is a test message.'), {
    duration: 3000,
    closable: true,
  })
}
</script>

<template>
  <NButton size="small" :disabled="disabled" @click="testMessage">
    {{ t('settings.advancedSettings.personalizationPage.testMessage', 'Test message') }}
  </NButton>
</template>
