<script setup lang="ts">
import { computed } from 'vue'
import { Plus, Trash2 } from '@lucide/vue'

import type { KeyboardShortcut } from '@/api/client'
import { t } from '@/i18n/runtime'
import { MAX_SHORTCUTS } from '@/lib/keyboard-shortcuts'

import ShortcutKeyRecorder from './ShortcutKeyRecorder.vue'

const props = defineProps<{
  modelValue: KeyboardShortcut[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: KeyboardShortcut[]]
  validity: [valid: boolean]
}>()

function rowError(shortcut: KeyboardShortcut, index: number, shortcuts = props.modelValue) {
  if (!shortcut.keys.length) return t('keyboard.shortcuts.keysRequired', 'Record at least one key')
  const name = shortcut.name.trim().toLocaleLowerCase()
  if (!name) return ''
  const duplicate = shortcuts.findIndex((item) => item.name.trim().toLocaleLowerCase() === name)
  if (duplicate !== index) return t('keyboard.shortcuts.nameDuplicate', 'Shortcut names must be unique')
  return ''
}

const valid = computed(() => props.modelValue.length <= MAX_SHORTCUTS && props.modelValue.every((item, index) => !rowError(item, index)))

function update(index: number, value: Partial<KeyboardShortcut>) {
  const shortcuts = props.modelValue.map((item, itemIndex) => itemIndex === index ? { ...item, ...value } : item)
  emit('update:modelValue', shortcuts)
  emit('validity', shortcuts.length <= MAX_SHORTCUTS && shortcuts.every((item, itemIndex) => !rowError(item, itemIndex, shortcuts)))
}

function add() {
  if (props.modelValue.length >= MAX_SHORTCUTS) return
  emit('update:modelValue', [...props.modelValue, { name: '', keys: [] }])
  emit('validity', false)
}

function remove(index: number) {
  const shortcuts = props.modelValue.filter((_, itemIndex) => itemIndex !== index)
  emit('update:modelValue', shortcuts)
  emit('validity', shortcuts.every((item, itemIndex) => !rowError(item, itemIndex, shortcuts)))
}

defineExpose({ valid })
</script>

<template>
  <div class="shortcut-editor">
    <div v-if="modelValue.length" class="shortcut-list">
      <div v-for="(shortcut, index) in modelValue" :key="index" class="shortcut-row">
        <n-form-item
          :label="t('keyboard.shortcuts.name', 'Name')"
          :validation-status="rowError(shortcut, index) ? 'error' : undefined"
          :feedback="rowError(shortcut, index)"
        >
          <n-input
            :value="shortcut.name"
            :disabled="disabled"
            maxlength="64"
            :placeholder="t('keyboard.shortcuts.namePlaceholder', 'Optional')"
            @update:value="update(index, { name: $event })"
          />
        </n-form-item>
        <n-form-item :label="t('keyboard.shortcuts.keys', 'Key combination')">
          <ShortcutKeyRecorder
            :model-value="shortcut.keys"
            :disabled="disabled"
            @update:model-value="update(index, { keys: $event })"
          />
        </n-form-item>
        <n-tooltip>
          <template #trigger>
            <n-button
              quaternary
              type="error"
              class="shortcut-remove"
              :disabled="disabled"
              :aria-label="t('common.delete', 'Delete')"
              @click="remove(index)"
            >
              <template #icon><Trash2 /></template>
            </n-button>
          </template>
          {{ t('common.delete', 'Delete') }}
        </n-tooltip>
      </div>
    </div>
    <n-empty v-else size="small" :description="t('keyboard.shortcuts.empty', 'No shortcuts')" />
    <n-button dashed :disabled="disabled || modelValue.length >= MAX_SHORTCUTS" @click="add">
      <template #icon><Plus /></template>
      {{ t('keyboard.shortcuts.add', 'Add shortcut') }}
    </n-button>
  </div>
</template>
