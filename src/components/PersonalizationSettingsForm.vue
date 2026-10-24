<script setup lang="ts">
import { computed, watch } from 'vue'
import { Activity, GripVertical, Keyboard, Monitor, MousePointer2, Settings } from '@/icons'

import type { ConsoleSubtitlePart, ConsoleTitleSource, PersonalizationConfig } from '@/api/client'
import { serviceURL } from '@/api/service-url'
import { t } from '@/i18n/runtime'
import {
  MAX_PERSONALIZATION_TEXT_LENGTH,
  normalizeConsoleSubtitleParts,
  resolveConsoleSubtitle,
  resolveConsoleTitle,
  validPersonalizationText,
} from '@/lib/console-title'
import ConsoleBrandCopy from './ConsoleBrandCopy.vue'

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

const subtitleOptions = computed(() => [
  {
    value: 'hostname' as const,
    label: t('settings.advancedSettings.personalizationPage.subtitleHostname', 'Hostname'),
    description: t('settings.advancedSettings.personalizationPage.subtitleHostnameHint', 'Show the current network hostname.'),
  },
  {
    value: 'device_model' as const,
    label: t('settings.advancedSettings.personalizationPage.subtitleDeviceModel', 'Device model'),
    description: t('settings.advancedSettings.personalizationPage.subtitleDeviceModelHint', 'Show the detected device model.'),
  },
  {
    value: 'custom' as const,
    label: t('settings.advancedSettings.personalizationPage.subtitleCustom', 'Custom'),
    description: t('settings.advancedSettings.personalizationPage.subtitleCustomHint', 'Append your own short description.'),
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
const previewTitle = computed(() => resolveConsoleTitle(props.modelValue, props.hostname))
const previewSubtitle = computed(() => resolveConsoleSubtitle(
  props.modelValue,
  props.hostname,
  props.deviceModel,
))

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
  <div class="personalization-settings">
    <section class="personalization-section">
      <header>
        <h2>{{ t('settings.advancedSettings.personalizationPage.windowBehavior', 'Window behavior') }}</h2>
      </header>
      <div class="personalization-switch-row">
        <div>
          <label id="dim-windows-label">{{ t('settings.advancedSettings.personalizationPage.dimWindowsOnKvmFocus', 'Translucent windows when KVM has focus') }}</label>
          <p id="dim-windows-hint">{{ t('settings.advancedSettings.personalizationPage.dimWindowsOnKvmFocusHint', 'Set all windows to 50% opacity while controlling KVM. Focusing a window restores its opacity.') }}</p>
        </div>
        <n-switch
          :value="modelValue.dim_windows_on_kvm_focus ?? true"
          :disabled="disabled"
          aria-labelledby="dim-windows-label"
          aria-describedby="dim-windows-hint"
          @update:value="update({ dim_windows_on_kvm_focus: $event })"
        />
      </div>
    </section>

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
          <small>{{ option.description }}</small>
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

    <section class="personalization-preview" aria-live="polite">
      <span class="personalization-preview-label">{{ t('settings.advancedSettings.personalizationPage.preview', 'Preview') }}</span>
      <div class="toolbar personalization-preview-toolbar">
        <div class="brand">
          <span class="brand-logo" aria-hidden="true">
            <img class="brand-mark" :src="serviceURL('/brand/onekvm-app-icon.svg')" alt="" draggable="false" />
          </span>
          <ConsoleBrandCopy
            :title="previewTitle"
            :subtitle="previewSubtitle"
          />
        </div>
        <span class="toolbar-spacer personalization-preview-spacer" aria-hidden="true">
          <span class="toolbar-handle"><GripVertical :size="14" /></span>
        </span>
        <div class="device-controls personalization-preview-devices" aria-hidden="true">
          <n-button quaternary size="small" class="device-indicator" data-state="ready" tabindex="-1">
            <template #icon><Monitor /></template>
            <span class="device-led" />
          </n-button>
          <n-button quaternary size="small" class="device-indicator personalization-preview-optional" data-state="ready" tabindex="-1">
            <template #icon><MousePointer2 /></template>
            <span class="device-led" />
          </n-button>
          <n-button quaternary size="small" class="device-indicator personalization-preview-optional" data-state="ready" tabindex="-1">
            <template #icon><Keyboard /></template>
            <span class="device-led" />
          </n-button>
        </div>
        <div class="toolbar-actions personalization-preview-actions" aria-hidden="true">
          <n-button quaternary size="small" tabindex="-1"><template #icon><Activity /></template></n-button>
          <n-button quaternary size="small" tabindex="-1"><template #icon><Settings /></template></n-button>
        </div>
      </div>
      <small>{{ t('settings.advancedSettings.personalizationPage.browserTab', 'Browser tab') }} · {{ previewTitle }} - OneKVM</small>
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
.personalization-switch-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 16px; }
.personalization-switch-row label { color: var(--foreground); font-size: 13px; }
.personalization-switch-row p { margin: 4px 0 0; color: var(--muted-foreground); font-size: 11px; line-height: 1.5; }
.personalization-reference { margin: -2px 0 0; }
.personalization-reference > div { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 16px; min-height: 36px; }
.personalization-reference dt { color: var(--muted-foreground); font-size: 12px; }
.personalization-reference dd { min-width: 0; margin: 0; overflow: hidden; color: var(--foreground); font-family: var(--onekvm-font-mono); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.personalization-source-list { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.personalization-source { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: 10px; min-height: 76px; padding: 12px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); cursor: pointer; transition: border-color var(--win11-fast), background-color var(--win11-fast); }
.personalization-source:hover { border-color: var(--border-strong); background: var(--secondary); }
.personalization-source.active { border-color: color-mix(in srgb, var(--primary) 60%, var(--border)); background: color-mix(in srgb, var(--primary) 8%, var(--card)); }
.personalization-source:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
.personalization-source.n-checkbox--disabled { cursor: not-allowed; }
.personalization-source :deep(.n-checkbox__label) { min-width: 0; padding: 0; }
.personalization-source strong, .personalization-source small { display: block; }
.personalization-source strong { color: var(--foreground); font-size: 13px; line-height: 1.35; }
.personalization-source small { margin-top: 4px; color: var(--muted-foreground); font-size: 11px; line-height: 1.45; }
.personalization-custom-form { padding-top: 14px; }
.personalization-subtitle-hidden { margin: -2px 0 0; color: var(--muted-foreground); font-size: 11px; line-height: 1.45; }
.personalization-preview { display: grid; gap: 8px; padding: 14px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--onekvm-surface-inset); }
.personalization-preview-label { color: var(--muted-foreground); font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
.personalization-preview-toolbar { z-index: auto; width: 100%; height: var(--onekvm-toolbar-bar); overflow: hidden; border: 1px solid var(--border); border-radius: calc(var(--radius) - 2px); pointer-events: none; }
.personalization-preview-toolbar .brand { min-width: 0; cursor: default; touch-action: auto; }
.personalization-preview-toolbar .brand-logo { cursor: default; touch-action: auto; }
.personalization-preview-spacer { min-width: 8px; cursor: default; touch-action: auto; }
.personalization-preview-spacer .toolbar-handle { cursor: default; }
.personalization-preview-devices,
.personalization-preview-actions { flex: 0 0 auto; }
.personalization-preview > small { overflow: hidden; color: var(--muted-foreground); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 720px) {
  .personalization-source-list { grid-template-columns: 1fr; }
  .personalization-source { min-height: 0; }
  .personalization-preview-toolbar { padding-inline: 7px; }
  .personalization-preview-toolbar :deep(.brand-copy) { display: grid; max-width: min(180px, 42vw); }
  .personalization-preview-optional { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .personalization-source { transition: none; }
}
</style>
