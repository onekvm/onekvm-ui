<script setup lang="ts">
import { computed, watch } from 'vue'
import { Activity, GripHorizontal, Keyboard, Monitor, MousePointer2, Settings } from '@lucide/vue'

import type { ConsoleTitleSource, PersonalizationConfig } from '@/api/client'
import { serviceURL } from '@/api/service-url'
import { t } from '@/i18n/runtime'
import {
  MAX_PERSONALIZATION_TEXT_LENGTH,
  resolveConsoleTitle,
  shouldShowDeviceModel,
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

const deviceNameValid = computed(() => validPersonalizationText(props.modelValue.device_name))
const customTitleValid = computed(() => validPersonalizationText(
  props.modelValue.custom_console_title,
  props.modelValue.console_title_source === 'custom',
))
const valid = computed(() => deviceNameValid.value && customTitleValid.value)
const previewTitle = computed(() => resolveConsoleTitle(props.modelValue, props.hostname))
const previewShowsDeviceModel = computed(() => shouldShowDeviceModel(props.modelValue))

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

      <div class="personalization-model-setting">
        <span>
          <strong>{{ t('settings.advancedSettings.personalizationPage.showDeviceModel', 'Show device model') }}</strong>
          <small>{{ t('settings.advancedSettings.personalizationPage.showDeviceModelHint', 'Show the detected device model below the main title.') }}</small>
        </span>
        <n-switch
          :value="previewShowsDeviceModel"
          :disabled="disabled"
          :aria-label="t('settings.advancedSettings.personalizationPage.showDeviceModel', 'Show device model')"
          @update:value="update({ show_device_model: $event })"
        />
      </div>
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
            :device-model="deviceModel"
            :show-device-model="previewShowsDeviceModel"
          />
        </div>
        <span class="toolbar-spacer personalization-preview-spacer" aria-hidden="true">
          <span class="toolbar-handle"><GripHorizontal :size="14" /></span>
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
.personalization-model-setting { display: flex; min-height: 54px; align-items: center; justify-content: space-between; gap: 20px; padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); }
.personalization-model-setting > span { display: grid; gap: 3px; }
.personalization-model-setting strong { color: var(--foreground); font-size: 13px; }
.personalization-model-setting small { color: var(--muted-foreground); font-size: 11px; line-height: 1.45; }
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
