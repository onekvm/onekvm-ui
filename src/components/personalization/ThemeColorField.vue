<script setup lang="ts">
import { computed, useId } from 'vue'
import { NInput } from 'naive-ui'
import { t } from '@/i18n/runtime'
import { normalizeHexColor } from '@/theme/colors'

const props = defineProps<{
  modelValue: string
  fallback: string
  label: string
  disabled?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const id = useId()
const color = computed(() => normalizeHexColor(props.modelValue))
const codeLabel = computed(() => t('settings.advancedSettings.personalizationPage.themeColors.colorCode').replace('{name}', props.label))

function normalizeDraft() {
  if (color.value) emit('update:modelValue', color.value)
}
</script>

<template>
  <div class="theme-color-field">
    <label :for="id">{{ label }}</label>
    <div class="theme-color-inputs">
      <input
        :id="id"
        class="theme-color-well"
        type="color"
        :value="color || fallback"
        :aria-label="label"
        :disabled="disabled"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
      <NInput
        :value="modelValue"
        :disabled="disabled"
        :status="color ? undefined : 'error'"
        :input-props="{ 'aria-label': codeLabel, 'aria-invalid': !color, autocomplete: 'off', spellcheck: false }"
        :maxlength="7"
        placeholder="#RRGGBB"
        @update:value="emit('update:modelValue', $event)"
        @blur="normalizeDraft"
        @keydown.enter.prevent="normalizeDraft"
      />
    </div>
  </div>
</template>

<style scoped>
.theme-color-field { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 210px); align-items: center; gap: 16px; }
.theme-color-field > label { color: var(--foreground); font-size: 13px; }
.theme-color-inputs { display: grid; grid-template-columns: 44px minmax(0, 1fr); gap: 8px; align-items: center; }
.theme-color-well { width: 44px; height: 36px; padding: 3px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--input); cursor: pointer; }
.theme-color-well:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
.theme-color-well:disabled { cursor: default; opacity: .5; }
.theme-color-inputs :deep(input.n-input__input-el) { font-family: var(--onekvm-font-mono); }
@media (max-width: 520px) {
  .theme-color-field { grid-template-columns: 1fr; gap: 8px; }
  .theme-color-well { height: 44px; }
}
</style>
