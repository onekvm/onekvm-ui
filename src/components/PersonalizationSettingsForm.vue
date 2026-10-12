<script setup lang="ts">
import { computed, watch } from 'vue'
import { Monitor } from '@lucide/vue'

import type { ConsoleTitleSource, PersonalizationConfig } from '@/api/client'
import { t } from '@/i18n/runtime'
import {
  MAX_PERSONALIZATION_TEXT_LENGTH,
  resolveConsoleTitle,
  validPersonalizationText,
} from '@/lib/console-title'

const props = defineProps<{
  modelValue: PersonalizationConfig
  hostname: string
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
    description: t('settings.advancedSettings.personalizationPage.deviceNameSourceHint', 'Use the friendly name saved on this device.'),
  },
  {
    value: 'hostname' as const,
    label: t('settings.advancedSettings.personalizationPage.hostnameSource', 'Hostname'),
    description: t('settings.advancedSettings.personalizationPage.hostnameSourceHint', 'Use the network hostname shown below.'),
  },
  {
    value: 'custom' as const,
    label: t('settings.advancedSettings.personalizationPage.customSource', 'Custom'),
    description: t('settings.advancedSettings.personalizationPage.customSourceHint', 'Use a separate title only for the console.'),
  },
])

const deviceNameValid = computed(() => validPersonalizationText(props.modelValue.device_name))
const customTitleValid = computed(() => validPersonalizationText(
  props.modelValue.custom_console_title,
  props.modelValue.console_title_source === 'custom',
))
const valid = computed(() => deviceNameValid.value && customTitleValid.value)
const previewTitle = computed(() => resolveConsoleTitle(props.modelValue, props.hostname))

watch(valid, value => emit('validity', value), { immediate: true })

function update(patch: Partial<PersonalizationConfig>) {
  emit('update:modelValue', { ...props.modelValue, ...patch })
}

function updateSource(value: string | number | boolean) {
  update({ console_title_source: value as ConsoleTitleSource })
}
</script>

<template>
  <div class="personalization-settings">
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
        <p>{{ t('settings.advancedSettings.personalizationPage.consoleTitleHint', 'Choose the name shown in the console header and browser tab.') }}</p>
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
            <small>{{ source.description }}</small>
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

    <section class="personalization-preview" aria-live="polite">
      <span class="personalization-preview-label">{{ t('settings.advancedSettings.personalizationPage.preview', 'Preview') }}</span>
      <div class="personalization-preview-bar">
        <span class="personalization-preview-icon"><Monitor :size="17" aria-hidden="true" /></span>
        <strong>OneKVM</strong>
        <i aria-hidden="true" />
        <span>{{ previewTitle }}</span>
      </div>
      <small>{{ previewTitle }} - OneKVM</small>
    </section>
  </div>
</template>

<style scoped>
.personalization-settings { display: grid; gap: 22px; }
.personalization-section { display: grid; gap: 16px; }
.personalization-section + .personalization-section { padding-top: 20px; border-top: 1px solid var(--border); }
.personalization-section header h2 { margin: 0; color: var(--foreground); font-size: 14px; }
.personalization-section header p { margin: 4px 0 0; color: var(--muted-foreground); font-size: 11px; line-height: 1.5; }
.personalization-section :deep(.n-form-item) { margin-bottom: 0; }
.personalization-reference { margin: -2px 0 0; }
.personalization-reference > div { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 16px; min-height: 36px; }
.personalization-reference dt { color: var(--muted-foreground); font-size: 12px; }
.personalization-reference dd { min-width: 0; margin: 0; overflow: hidden; color: var(--foreground); font-family: var(--onekvm-font-mono); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.personalization-source-list { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.personalization-source { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: 10px; min-height: 76px; padding: 12px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); cursor: pointer; transition: border-color var(--win11-fast), background-color var(--win11-fast); }
.personalization-source:hover { border-color: var(--border-strong); background: var(--secondary); }
.personalization-source.active { border-color: color-mix(in srgb, var(--primary) 60%, var(--border)); background: color-mix(in srgb, var(--primary) 8%, var(--card)); }
.personalization-source strong, .personalization-source small { display: block; }
.personalization-source strong { color: var(--foreground); font-size: 13px; line-height: 1.35; }
.personalization-source small { margin-top: 4px; color: var(--muted-foreground); font-size: 11px; line-height: 1.45; }
.personalization-custom-form { padding-top: 14px; }
.personalization-preview { display: grid; gap: 8px; padding: 14px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--onekvm-surface-inset); }
.personalization-preview-label { color: var(--muted-foreground); font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
.personalization-preview-bar { display: flex; min-width: 0; min-height: 38px; align-items: center; gap: 9px; padding: 0 11px; border: 1px solid var(--border); border-radius: calc(var(--radius) - 2px); background: var(--card); }
.personalization-preview-icon { display: inline-flex; color: var(--primary); }
.personalization-preview-bar strong { color: var(--foreground); font-size: 13px; }
.personalization-preview-bar i { width: 1px; height: 14px; background: var(--border-strong); }
.personalization-preview-bar > span:last-child { min-width: 0; overflow: hidden; color: var(--onekvm-text-secondary); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.personalization-preview > small { overflow: hidden; color: var(--muted-foreground); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 720px) {
  .personalization-source-list { grid-template-columns: 1fr; }
  .personalization-source { min-height: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .personalization-source { transition: none; }
}
</style>
