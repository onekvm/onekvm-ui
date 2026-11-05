<script setup lang="ts">
import { computed, watch } from 'vue'
import { type ConsoleSubtitlePart, type ConsoleTitleSource, type PersonalizationConfig } from '@/api/client'
import {
  MAX_PERSONALIZATION_TEXT_LENGTH,
  normalizeConsoleSubtitleParts,
  validPersonalizationText,
} from '@/lib/console-title'
import { t } from '@/i18n/runtime'
const props = defineProps<{
  modelValue: PersonalizationConfig
  hostname: string
  deviceModel: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: PersonalizationConfig]
  validity: [valid: boolean]
}>()

const sources = computed(() => [
  {
    value: 'device_name' as const,
    label: t('settings.advancedSettings.personalizationPage.deviceNameSource', 'Device name'),
  },
  {
    value: 'hostname' as const,
    label: t('settings.advancedSettings.personalizationPage.hostnameSource', 'Hostname'),
  },
  {
    value: 'custom' as const,
    label: t('settings.advancedSettings.personalizationPage.customSource', 'Custom'),
  },
])

const subtitleOptions = computed(() => [
  {
    value: 'hostname' as const,
    label: t('settings.advancedSettings.personalizationPage.subtitleHostname', 'Hostname'),
  },
  {
    value: 'device_model' as const,
    label: t('settings.advancedSettings.personalizationPage.subtitleDeviceModel', 'Device model'),
  },
  {
    value: 'custom' as const,
    label: t('settings.advancedSettings.personalizationPage.subtitleCustom', 'Custom'),
  },
])

const deviceNameValid = computed(() => validPersonalizationText(props.modelValue.device_name))
const customTitleValid = computed(() => validPersonalizationText(
  props.modelValue.custom_console_title,
  props.modelValue.console_title_source === 'custom',
))
const subtitleParts = computed(() => normalizeConsoleSubtitleParts(props.modelValue))
const customSubtitleSelected = computed(() => subtitleParts.value.includes('custom'))
const customSubtitleValid = computed(() => validPersonalizationText(
  props.modelValue.custom_console_subtitle || '',
  customSubtitleSelected.value,
))
const valid = computed(() => deviceNameValid.value && customTitleValid.value && customSubtitleValid.value)
watch(valid, value => emit('validity', value), { immediate: true })

function update(patch: Partial<PersonalizationConfig>) {
  emit('update:modelValue', { ...props.modelValue, ...patch })
}

function updateSource(value: string | number | boolean) {
  update({ console_title_source: value as ConsoleTitleSource })
}

function updateSubtitleParts(values: Array<string | number>) {
  const selected = new Set(values.map(String))
  update({
    console_subtitle_parts: subtitleOptions.value
      .map(option => option.value)
      .filter(value => selected.has(value)) as ConsoleSubtitlePart[],
  })
}
</script>

<template>
  <div class="personalization-tab-content">
    <section class="personalization-section">
      <header>
        <h2>{{ t('settings.advancedSettings.personalizationPage.deviceIdentity', 'Device identity') }}</h2>
        <p>{{ t('settings.advancedSettings.personalizationPage.deviceIdentityHint', 'Give this OneKVM a friendly name without changing its network hostname.') }}</p>
      </header>
      <n-form label-placement="top">
        <n-form-item
          :label="t('settings.advancedSettings.personalizationPage.deviceName', 'Device name')"
          :validation-status="deviceNameValid ? undefined : 'error'"
          :feedback="deviceNameValid ? undefined : t('settings.advancedSettings.personalizationPage.nameInvalid', 'Enter 1–64 visible characters.')"
          :show-feedback="!deviceNameValid"
        >
          <n-input
            :value="modelValue.device_name"
            :disabled="disabled"
            :maxlength="MAX_PERSONALIZATION_TEXT_LENGTH"
            show-count
            :placeholder="t('settings.advancedSettings.personalizationPage.deviceNamePlaceholder', 'OneKVM')"
            :input-props="{ 'aria-label': t('settings.advancedSettings.personalizationPage.deviceName', 'Device name') }"
            @update:value="update({ device_name: $event })"
          />
        </n-form-item>
      </n-form>
      <dl class="personalization-reference">
        <div>
          <dt>{{ t('settings.advancedSettings.personalizationPage.hostnameReference', 'Current hostname') }}</dt>
          <dd>{{ hostname || '—' }}</dd>
        </div>
      </dl>
    </section>

    <section class="personalization-section">
      <header>
        <h2>{{ t('settings.advancedSettings.personalizationPage.consoleTitle', 'Console title') }}</h2>
        <p>{{ t('settings.advancedSettings.personalizationPage.consoleTitleHint', 'Choose what replaces OneKVM as the main toolbar title. The browser tab follows it.') }}</p>
      </header>
      <n-radio-group
        :value="modelValue.console_title_source"
        :disabled="disabled"
        class="personalization-source-list"
        :aria-label="t('settings.advancedSettings.personalizationPage.consoleTitle', 'Console title')"
        @update:value="updateSource"
      >
        <label v-for="source in sources" :key="source.value" class="personalization-source" :class="{ active: modelValue.console_title_source === source.value }">
          <n-radio :value="source.value" />
          <span>
            <strong>{{ source.label }}</strong>
          </span>
        </label>
      </n-radio-group>

      <n-collapse-transition :show="modelValue.console_title_source === 'custom'">
        <n-form label-placement="top" class="personalization-custom-form">
          <n-form-item
            :label="t('settings.advancedSettings.personalizationPage.customTitle', 'Custom title')"
            :validation-status="customTitleValid ? undefined : 'error'"
            :feedback="customTitleValid ? undefined : t('settings.advancedSettings.personalizationPage.nameInvalid', 'Enter 1–64 visible characters.')"
            :show-feedback="!customTitleValid"
          >
            <n-input
              :value="modelValue.custom_console_title"
              :disabled="disabled"
              :maxlength="MAX_PERSONALIZATION_TEXT_LENGTH"
              show-count
              :placeholder="t('settings.advancedSettings.personalizationPage.customTitlePlaceholder', 'Rack 3 · Main server')"
              :input-props="{ 'aria-label': t('settings.advancedSettings.personalizationPage.customTitle', 'Custom title') }"
              @update:value="update({ custom_console_title: $event })"
            />
          </n-form-item>
        </n-form>
      </n-collapse-transition>

    </section>

    <section class="personalization-section">
      <header>
        <h2>{{ t('settings.advancedSettings.personalizationPage.consoleSubtitle', 'Second line') }}</h2>
        <p>{{ t('settings.advancedSettings.personalizationPage.consoleSubtitleHint', 'Choose the details shown below the main title. Leave all options unselected to hide the second line.') }}</p>
      </header>
      <n-checkbox-group
        :value="subtitleParts"
        class="personalization-source-list"
        :aria-label="t('settings.advancedSettings.personalizationPage.consoleSubtitle', 'Second line')"
        @update:value="updateSubtitleParts"
      >
        <n-checkbox
          v-for="option in subtitleOptions"
          :key="option.value"
          :value="option.value"
          :disabled="disabled"
          class="personalization-source"
          :class="{ active: subtitleParts.includes(option.value) }"
        >
          <strong>{{ option.label }}</strong>
        </n-checkbox>
      </n-checkbox-group>

      <p v-if="!subtitleParts.length" class="personalization-subtitle-hidden" role="status">
        {{ t('settings.advancedSettings.personalizationPage.subtitleHidden', 'The second line is hidden.') }}
      </p>

      <n-collapse-transition :show="customSubtitleSelected">
        <n-form label-placement="top" class="personalization-custom-form">
          <n-form-item
            :label="t('settings.advancedSettings.personalizationPage.customSubtitle', 'Custom second-line text')"
            :validation-status="customSubtitleValid ? undefined : 'error'"
            :feedback="customSubtitleValid ? undefined : t('settings.advancedSettings.personalizationPage.nameInvalid', 'Enter 1–64 visible characters.')"
            :show-feedback="!customSubtitleValid"
          >
            <n-input
              :value="modelValue.custom_console_subtitle"
              :disabled="disabled"
              :maxlength="MAX_PERSONALIZATION_TEXT_LENGTH"
              show-count
              :placeholder="t('settings.advancedSettings.personalizationPage.customSubtitlePlaceholder', 'Primary rack')"
              :input-props="{ 'aria-label': t('settings.advancedSettings.personalizationPage.customSubtitle', 'Custom second-line text') }"
              @update:value="update({ custom_console_subtitle: $event })"
            />
          </n-form-item>
        </n-form>
      </n-collapse-transition>
    </section>
  </div>
</template>

<style scoped>
.personalization-reference { margin: -2px 0 0; }
.personalization-reference > div { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 16px; min-height: 36px; }
.personalization-reference dt { color: var(--muted-foreground); font-size: 12px; }
.personalization-reference dd { min-width: 0; margin: 0; overflow: hidden; color: var(--foreground); font-family: var(--onekvm-font-mono); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.personalization-source-list { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.personalization-source { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 10px; min-height: 44px; padding: 12px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); cursor: pointer; transition: border-color var(--win11-fast), background-color var(--win11-fast); }
.personalization-source:hover { border-color: var(--border-strong); background: var(--secondary); }
.personalization-source.active { border-color: color-mix(in srgb, var(--primary) 60%, var(--border)); background: color-mix(in srgb, var(--primary) 8%, var(--card)); }
.personalization-source:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
.personalization-source.n-checkbox--disabled { cursor: not-allowed; }
.personalization-source :deep(.n-checkbox__label) { min-width: 0; padding: 0; }
.personalization-source strong { display: block; color: var(--foreground); font-size: 13px; line-height: 1.35; }
.personalization-custom-form { padding-top: 14px; }
.personalization-subtitle-hidden { margin: -2px 0 0; color: var(--muted-foreground); font-size: 11px; line-height: 1.45; }
@media (max-width: 720px) {
  .personalization-source-list { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) {
  .personalization-source { transition: none; }
}
</style>
