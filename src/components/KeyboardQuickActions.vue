<script setup lang="ts">
import { computed } from 'vue'
import { Keyboard, TextCursorInput } from '@/icons'
import { NButton } from 'naive-ui'
import { t } from '@/i18n/runtime'
import KeyboardChordIcon from './KeyboardChordIcon'

const emit = defineEmits<{ select: [key: 'cad' | 'virtual' | 'send-text'] }>()
const actions = computed(() => [
  { key: 'virtual' as const, label: t('keyboard.virtualKeyboard'), icon: Keyboard },
  { key: 'send-text' as const, label: t('keyboard.paste', 'Send text'), icon: TextCursorInput },
  { key: 'cad' as const, label: t('keyboard.ctrlaltdel'), icon: KeyboardChordIcon },
])
</script>

<template>
  <div class="keyboard-quick-actions" role="group" :aria-label="t('keyboard.actions', 'Actions')">
    <NButton v-for="action in actions" :key="action.key" secondary @click="emit('select', action.key)">
      <component :is="action.icon" :size="18" aria-hidden="true" />
      <span>{{ action.label }}</span>
    </NButton>
  </div>
</template>

<style scoped>
.keyboard-quick-actions { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; padding: 12px 0 4px; }
.keyboard-quick-actions :deep(.n-button) { height: 68px; min-width: 0; padding: 8px 4px; border-radius: 8px; }
.keyboard-quick-actions :deep(.n-button__content) { display: flex; flex-direction: column; gap: 8px; max-width: 100%; font-size: 12px; }
.keyboard-quick-actions span { max-width: 100%; white-space: normal; text-align: center; line-height: 1.3; }
</style>
