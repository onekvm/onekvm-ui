<script setup lang="ts">
import { ref, watch } from 'vue'
import { Save } from '@lucide/vue'

import type { KeyboardShortcut } from '@/api/client'
import { useOverlayMount } from '@/composables/useOverlayMount'
import { t } from '@/i18n/runtime'
import { normalizeShortcuts } from '@/lib/keyboard-shortcuts'

import KeyboardShortcutEditor from './KeyboardShortcutEditor.vue'

const props = defineProps<{
  show: boolean
  shortcuts: KeyboardShortcut[]
}>()

const emit = defineEmits<{
  'update:show': [show: boolean]
  save: [shortcuts: KeyboardShortcut[]]
}>()

const overlayTo = useOverlayMount()
const draft = ref<KeyboardShortcut[]>([])
const valid = ref(true)

watch(() => props.show, (show) => {
  if (!show) return
  draft.value = props.shortcuts.map((shortcut) => ({ name: shortcut.name, keys: [...shortcut.keys] }))
  valid.value = true
})

function save() {
  if (!valid.value) return
  emit('save', normalizeShortcuts(draft.value))
  emit('update:show', false)
}
</script>

<template>
  <n-drawer
    :show="show"
    :to="overlayTo"
    placement="right"
    class="shortcut-drawer"
    :width="620"
    @update:show="emit('update:show', $event)"
  >
    <n-drawer-content closable :title="t('keyboard.shortcuts.browserTitle', 'Browser shortcuts')">
      <KeyboardShortcutEditor v-model="draft" @validity="valid = $event" />
      <template #footer>
        <div class="shortcut-drawer-actions">
          <n-button @click="emit('update:show', false)">{{ t('common.cancel', 'Cancel') }}</n-button>
          <n-button type="primary" :disabled="!valid" @click="save">
            <template #icon><Save /></template>
            {{ t('common.save', 'Save') }}
          </n-button>
        </div>
      </template>
    </n-drawer-content>
  </n-drawer>
</template>
