<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { NButton, NRadio, NRadioGroup } from 'naive-ui'
import { Check } from '@/icons'
import { t } from '@/i18n/runtime'
import { useThemeMenu } from '@/composables/useThemeMenu'
import { useOneKVMTheme } from '@/theme/runtime'
import { oneKVMThemeCSSVariables } from '@/theme/model'
import {
  customThemeColorNames,
  customThemeColorIssue,
  normalizeThemeColors,
  resolveCustomThemeColors,
  type CustomThemeColorName,
  type CustomThemeColors,
} from '@/theme/colors'
import ThemeColorField from './ThemeColorField.vue'

defineProps<{ disabled?: boolean }>()
const { themeChoices, selectedThemeChoice, selectThemeChoice } = useThemeMenu()
const { theme, baseTheme, customColors, setColors } = useOneKVMTheme()
const drafts = shallowRef<Record<string, CustomThemeColors>>({})
const draft = computed(() => drafts.value[theme.value.id] || customColors.value)
const normalized = computed(() => normalizeThemeColors(draft.value))
const preview = computed(() => resolveCustomThemeColors(baseTheme.value, normalized.value || {}))
const previewStyle = computed(() => Object.fromEntries(
  Object.entries(oneKVMThemeCSSVariables).map(([name, variable]) => [variable, preview.value.tokens[name as keyof typeof oneKVMThemeCSSVariables]]),
))
const issue = computed(() => normalized.value ? customThemeColorIssue(preview.value) : 'format')
const error = computed(() => issue.value ? t(`settings.advancedSettings.personalizationPage.themeColors.errors.${issue.value}`) : '')
const dirty = computed(() => customThemeColorNames.some(name => (
  draft.value[name] || baseTheme.value.tokens[name]
) !== (customColors.value[name] || baseTheme.value.tokens[name])))
const customized = computed(() => Object.keys(customColors.value).length > 0 || Object.keys(draft.value).length > 0)
const fields = computed(() => customThemeColorNames.map(name => ({
  name,
  label: t(`settings.advancedSettings.personalizationPage.themeColors.fields.${name}`),
  value: draft.value[name] ?? baseTheme.value.tokens[name],
  fallback: baseTheme.value.tokens[name],
})))
const presets = ['#3b82f6', '#8b5cf6', '#0d9488', '#db2777', '#d97706', '#64748b']

function updateColor(name: CustomThemeColorName, value: string) {
  const colors = { ...draft.value, [name]: value }
  if (value === baseTheme.value.tokens[name]) delete colors[name]
  drafts.value = { ...drafts.value, [theme.value.id]: colors }
}

function clearDraft() {
  const next = { ...drafts.value }
  delete next[theme.value.id]
  drafts.value = next
}

function applyColors() {
  if (issue.value || !normalized.value) return
  if (setColors(normalized.value)) clearDraft()
}

function resetColors() {
  setColors(null)
  clearDraft()
}
</script>

<template>
  <div class="personalization-tab-content">
    <section class="personalization-section">
      <header>
        <h2>{{ t('settings.appearance.theme') }}</h2>
        <p>{{ t('settings.advancedSettings.personalizationPage.themeColors.scope') }}</p>
      </header>
      <NRadioGroup :value="selectedThemeChoice" :disabled="disabled" class="theme-choices" :aria-label="t('settings.appearance.theme')" @update:value="selectThemeChoice(String($event))">
        <label v-for="choice in themeChoices" :key="choice.key" class="theme-choice" :class="{ 'is-active': selectedThemeChoice === choice.key }">
          <NRadio :value="choice.key" />
          <component :is="choice.icon" :size="18" aria-hidden="true" />
          <span>{{ choice.label }}</span>
        </label>
      </NRadioGroup>
    </section>
    <section class="personalization-section">
      <header>
        <h2>{{ t('settings.advancedSettings.personalizationPage.themeColors.title') }}</h2>
        <p>{{ t('settings.advancedSettings.personalizationPage.themeColors.perTheme') }}</p>
      </header>
      <div class="theme-preset-colors" :aria-label="t('settings.advancedSettings.personalizationPage.themeColors.presets')">
        <button
          v-for="color in presets"
          :key="color"
          type="button"
          class="theme-preset-color"
          :style="{ '--swatch': color }"
          :aria-label="`${t('settings.advancedSettings.personalizationPage.themeColors.fields.primary')} ${color}`"
          :aria-pressed="preview.tokens.primary === color"
          :disabled="disabled"
          @click="updateColor('primary', color)"
        ><Check v-if="preview.tokens.primary === color" :size="16" aria-hidden="true" /></button>
      </div>
      <ThemeColorField v-for="field in fields" :key="field.name" :model-value="field.value" :fallback="field.fallback" :label="field.label" :disabled="disabled" @update:model-value="updateColor(field.name, $event)" />
      <p v-if="error" class="theme-color-error" role="status">{{ error }}</p>
      <div class="theme-preview" :style="previewStyle">
        <span class="theme-preview-label">{{ t('settings.advancedSettings.personalizationPage.preview') }}</span>
        <div class="theme-preview-card">
          <div class="theme-preview-heading">OneKVM <span class="theme-preview-status">● {{ t('settings.advancedSettings.personalizationPage.themeColors.connected') }}</span></div>
          <span class="theme-preview-details">1920 × 1080 · 60 FPS</span>
          <span class="theme-preview-action">{{ t('settings.advancedSettings.personalizationPage.themeColors.primaryAction') }}</span>
        </div>
      </div>
      <footer class="theme-color-actions">
        <NButton :disabled="disabled || !customized" @click="resetColors">{{ t('settings.advancedSettings.personalizationPage.themeColors.reset') }}</NButton>
        <NButton type="primary" :disabled="disabled || !dirty || !!issue" @click="applyColors">{{ t('settings.advancedSettings.personalizationPage.themeColors.apply') }}</NButton>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.theme-choices { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.theme-choice { display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); color: var(--foreground); cursor: pointer; }
.theme-choice.is-active { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 8%, var(--card)); }
.theme-preset-colors { display: flex; flex-wrap: wrap; gap: 8px; }
.theme-preset-color { display: grid; place-items: center; width: 44px; height: 44px; padding: 4px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); cursor: pointer; }
.theme-preset-color::before { content: ''; grid-area: 1 / 1; width: 28px; height: 28px; border-radius: var(--radius-small); background: var(--swatch); }
.theme-preset-color[aria-pressed="true"] { border-color: var(--primary); }
.theme-preset-color :deep(svg) { z-index: 1; grid-area: 1 / 1; color: #fff; filter: drop-shadow(0 1px 1px #000); }
.theme-preset-color:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
.theme-preset-color:disabled { opacity: .5; cursor: default; }
.theme-color-error { margin: 0; color: var(--destructive); font-size: 12px; line-height: 1.5; }
.theme-preview { display: grid; gap: 12px; padding: 16px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--background); color: var(--foreground); }
.theme-preview-label { color: var(--muted-foreground); font-size: 12px; }
.theme-preview-card { display: grid; gap: 12px; padding: 16px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); color: var(--card-foreground); }
.theme-preview-heading { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; font-size: 15px; font-weight: 600; }
.theme-preview-status { color: var(--success); font-size: 12px; font-weight: 400; }
.theme-preview-details { color: var(--muted-foreground); font-family: var(--onekvm-font-mono); font-size: 12px; }
.theme-preview-action { justify-self: start; padding: 8px 16px; border-radius: var(--radius); background: var(--primary); color: var(--primary-foreground); font-size: 13px; }
.theme-color-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; }
@media (max-width: 640px) { .theme-choices { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
