<script setup lang="ts">
import { computed, useId } from 'vue'
import { Check } from '@/icons'
import type { MessagePlacement } from '@/api/client'
import { messagePlacements } from '@/composables/useMessagePlacement'
import { t } from '@/i18n/runtime'

defineProps<{ modelValue: MessagePlacement; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: MessagePlacement] }>()
const name = useId()
const options = computed(() => messagePlacements.map(value => ({
  value,
  label: t(`settings.advancedSettings.personalizationPage.messagePlacements.${value}`),
})))
</script>

<template>
  <fieldset class="message-placement-picker" :disabled="disabled" aria-describedby="message-placement-hint">
    <legend class="placement-legend">{{ t('settings.advancedSettings.personalizationPage.messagePlacement') }}</legend>
    <div class="placement-screen">
      <label
        v-for="option in options"
        :key="option.value"
        class="placement-choice"
        :class="{ 'is-selected': modelValue === option.value }"
      >
        <input
          type="radio"
          :name="name"
          :value="option.value"
          :checked="modelValue === option.value"
          @change="emit('update:modelValue', option.value)"
        />
        <span class="placement-choice-content">
          <span class="placement-check" aria-hidden="true"><Check v-if="modelValue === option.value" :size="11" /></span>
          <span>{{ option.label }}</span>
        </span>
      </label>
    </div>
    <div class="placement-stand" aria-hidden="true" />
  </fieldset>
</template>

<style scoped>
.message-placement-picker { width: 100%; max-width: 580px; min-width: 0; margin: 0; padding: 0; border: 0; }
.placement-legend { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.placement-screen { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); grid-template-rows: repeat(2, 1fr); gap: 20px 12px; aspect-ratio: 16 / 9; min-height: 190px; padding: clamp(12px, 3vw, 22px); border: 2px solid var(--border-strong); border-radius: var(--radius); background: var(--onekvm-surface-inset); }
.placement-choice { position: relative; align-self: start; min-width: 0; cursor: pointer; }
.placement-choice:nth-child(n+4) { align-self: end; }
.placement-choice input { position: absolute; z-index: 1; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: inherit; }
.placement-choice-content { position: relative; display: grid; min-height: 52px; place-items: center; padding: 10px 18px; border: 1px solid var(--border); border-radius: calc(var(--radius) - 2px); background: var(--card); color: var(--muted-foreground); font-size: 12px; font-weight: 500; line-height: 1.4; text-align: center; transition: border-color var(--win11-fast), background-color var(--win11-fast); }
.placement-choice:hover .placement-choice-content { border-color: var(--border-strong); }
.placement-choice.is-selected .placement-choice-content { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 9%, var(--card)); color: var(--foreground); }
.placement-check { position: absolute; top: 5px; right: 5px; display: grid; width: 14px; height: 14px; place-items: center; border: 1px solid var(--border-strong); border-radius: 50%; }
.is-selected .placement-check { border-color: var(--primary); background: var(--primary); color: var(--primary-foreground); }
.placement-choice input:focus-visible + .placement-choice-content { outline: 2px solid var(--ring); outline-offset: 3px; }
.message-placement-picker:disabled .placement-choice { cursor: not-allowed; opacity: .55; }
.placement-stand { width: 76px; height: 15px; margin: 0 auto; border-bottom: 3px solid var(--border-strong); }
.placement-stand::before { display: block; width: 24px; height: 12px; margin: auto; background: var(--border-strong); content: ''; }
@media (max-width: 440px) {
  .placement-screen { column-gap: 8px; }
  .placement-choice-content { padding: 16px 6px 8px; font-size: 11px; }
}
@media (prefers-reduced-motion: reduce) {
  .placement-choice-content { transition: none; }
}
</style>
