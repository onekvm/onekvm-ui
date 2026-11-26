<script setup lang="ts">
import { computed, shallowRef, useId } from 'vue'

import {
  extensionLocalizedText,
  type ExtensionSettingProperty,
  type ExtensionSettingValue,
  type NotificationChannelConfig,
  type NotificationChannelSchema,
} from '@/api/client'
import { currentLanguage, t } from '@/i18n/runtime'
import { Bell, Pencil, Plus, Trash2, X } from '@/icons'
import {
  MAX_WEBHOOK_HEADERS,
  WEBHOOK_CHANNEL,
  channelValues,
  fieldEnabled,
  fieldRequired,
  invalidFields,
  isSecret,
  schemaFields,
} from '@/lib/notification-channels'

const props = defineProps<{
  /** Edited in place: the page owns the draft and saves it. */
  channel: NotificationChannelConfig
  typeTitle: string
  /** Form of an extension channel type; absent for a webhook or an unavailable type. */
  schema?: NotificationChannelSchema
  /** The extension that provides the type is not installed or enabled. */
  unavailable: boolean
  /** Password fields and header names (lower case) the device holds for this channel. */
  savedSecrets: readonly string[]
  savedHeaders: readonly string[]
  status: string
  failed: boolean
  testing: boolean
  disabled: boolean
  canManage: boolean
  initiallyOpen: boolean
}>()
const emit = defineEmits<{ test: []; remove: []; 'open-plugin': [] }>()

const id = useId()
const open = shallowRef(props.initiallyOpen)
const isWebhook = computed(() => props.channel.type === WEBHOOK_CHANNEL)
const title = computed(() => props.channel.name.trim() || props.typeTitle)
const invalid = computed(() => invalidFields(props.channel, props.schema, props.savedSecrets))
const testable = computed(() => !invalidFields(props.channel, props.schema, props.savedSecrets, true).length)
// An invalid channel stays open so the fields that block saving are visible.
const expanded = computed(() => open.value || invalid.value.length > 0)
const fields = computed(() => props.schema ? schemaFields(props.schema) : [])
const values = computed(() => channelValues(props.channel))
const editable = computed(() => props.canManage && !props.disabled)

const levelOptions = computed(() => [
  { value: 'info', label: t('settings.advancedSettings.notificationsPage.levelAll', 'All') },
  { value: 'warning', label: t('settings.advancedSettings.notificationsPage.levelWarning', 'Warnings and errors') },
  { value: 'error', label: t('settings.advancedSettings.notificationsPage.levelError', 'Errors only') },
])

function fieldTitle(name: string, property: ExtensionSettingProperty) {
  return extensionLocalizedText(property.i18n, currentLanguage.value, property.title || name)
}

function required(name: string) {
  return !!props.schema && fieldRequired(props.schema, name, values.value)
}

function fieldDisabled(property: ExtensionSettingProperty) {
  return !editable.value || property.readOnly || !fieldEnabled(property, values.value)
}

function setting(name: string) {
  return props.channel.settings?.[name] ?? null
}

function setSetting(name: string, value: ExtensionSettingValue) {
  props.channel.settings = { ...props.channel.settings, [name]: value }
}

function secretPlaceholder(name: string) {
  if (!props.savedSecrets.includes(name)) return ''
  return props.channel.secrets && name in props.channel.secrets
    ? t('settings.plugins.configured', 'Configured')
    : t('settings.plugins.willBeCleared', 'Will be cleared')
}

function setSecret(name: string, value: string) {
  props.channel.secrets = { ...props.channel.secrets, [name]: value }
}

function clearSecret(name: string) {
  const secrets = { ...props.channel.secrets }
  delete secrets[name]
  props.channel.secrets = secrets
}

function enumOptions(property: ExtensionSettingProperty) {
  return (property.enum || []).map((value) => ({ value: value as string | number, label: String(value) }))
}

const webhookUrl = computed({
  get: () => String(props.channel.settings?.url ?? ''),
  set: (url: string) => { props.channel.settings = { url } },
})

function headerValuePlaceholder(name: string) {
  return props.savedHeaders.includes(name.trim().toLowerCase())
    ? t('settings.advancedSettings.notificationsPage.keepValue', 'Leave blank to keep the saved value')
    : t('settings.advancedSettings.notificationsPage.headerValue', 'Value')
}

function addHeader() {
  props.channel.headers = [...(props.channel.headers || []), { name: '', value: '' }]
}

function removeHeader(index: number) {
  props.channel.headers = (props.channel.headers || []).filter((_, item) => item !== index)
}
</script>

<template>
  <section class="notification-channel" :aria-labelledby="`${id}-title`">
    <div class="notification-channel-header">
      <div class="notification-channel-title">
        <h2 :id="`${id}-title`">{{ title }}</h2>
        <p v-if="title !== typeTitle" class="notification-channel-hint">{{ typeTitle }}</p>
        <p v-if="unavailable" class="notification-channel-status failed">
          {{ t('settings.advancedSettings.notificationsPage.channelUnavailable', 'The plugin is not installed or enabled. This channel does not send.') }}
        </p>
        <p v-else-if="status" class="notification-channel-status" :class="{ failed }">{{ status }}</p>
      </div>
      <div class="notification-channel-actions">
        <n-button v-if="unavailable" size="small" @click="emit('open-plugin')">
          {{ t('settings.advancedSettings.notificationsPage.openPlugins', 'Plugins') }}
        </n-button>
        <n-button
          v-else
          size="small"
          :loading="testing"
          :disabled="!canManage || !testable"
          @click="emit('test')"
        >
          <template #icon><Bell aria-hidden="true" /></template>
          {{ t('settings.advancedSettings.notificationsPage.test', 'Send test') }}
        </n-button>
        <n-button
          quaternary
          circle
          size="small"
          :disabled="invalid.length > 0"
          :aria-label="t('settings.advancedSettings.notificationsPage.channelSettings', 'Settings')"
          :aria-expanded="expanded"
          :aria-controls="`${id}-fields`"
          @click="open = !open"
        >
          <template #icon><Pencil aria-hidden="true" /></template>
        </n-button>
        <n-button
          v-if="canManage"
          quaternary
          circle
          size="small"
          :disabled="disabled"
          :aria-label="t('common.delete', 'Delete')"
          @click="emit('remove')"
        >
          <template #icon><Trash2 aria-hidden="true" /></template>
        </n-button>
        <n-switch v-model:value="channel.enabled" :disabled="!editable" :aria-labelledby="`${id}-title`" />
      </div>
    </div>

    <div v-if="expanded" :id="`${id}-fields`" class="notification-channel-fields">
      <label class="notification-channel-field">
        <span>{{ t('settings.advancedSettings.notificationsPage.channelName', 'Name') }}</span>
        <n-input
          v-model:value="channel.name"
          :disabled="!editable"
          :maxlength="64"
          :placeholder="typeTitle"
          :input-props="{ autocomplete: 'off' }"
        />
      </label>
      <label class="notification-channel-field">
        <span>{{ t('settings.advancedSettings.notificationsPage.minLevel', 'Send') }}</span>
        <n-select
          v-model:value="channel.min_level"
          :options="levelOptions"
          :disabled="!editable"
          :aria-label="t('settings.advancedSettings.notificationsPage.minLevel', 'Send')"
        />
      </label>

      <template v-if="isWebhook">
        <label class="notification-channel-field">
          <span>{{ t('settings.advancedSettings.notificationsPage.webhookUrl', 'URL') }}<b v-if="channel.enabled" class="required-mark"> *</b></span>
          <n-input
            v-model:value="webhookUrl"
            :disabled="!editable"
            :status="invalid.includes('url') ? 'error' : undefined"
            placeholder="https://"
            :input-props="{ inputmode: 'url', autocomplete: 'off', spellcheck: false }"
          />
          <small class="notification-channel-hint">{{ t('settings.advancedSettings.notificationsPage.webhookHint', 'Sends a JSON POST to the URL.') }}</small>
        </label>
        <div class="notification-channel-field">
          <span>{{ t('settings.advancedSettings.notificationsPage.headers', 'Request headers') }}</span>
          <div v-for="(header, index) in channel.headers || []" :key="index" class="notification-header-row">
            <n-input
              v-model:value="header.name"
              :disabled="!editable"
              :placeholder="t('settings.advancedSettings.notificationsPage.headerName', 'Name')"
              :status="invalid.includes('headers') ? 'error' : undefined"
              :input-props="{ autocomplete: 'off', spellcheck: false }"
            />
            <n-input
              v-model:value="header.value"
              type="password"
              show-password-on="click"
              :disabled="!editable"
              :placeholder="headerValuePlaceholder(header.name)"
              :input-props="{ autocomplete: 'off' }"
            />
            <n-button
              quaternary
              circle
              :disabled="!editable"
              :aria-label="t('common.delete', 'Delete')"
              @click="removeHeader(index)"
            >
              <template #icon><X aria-hidden="true" /></template>
            </n-button>
          </div>
          <div>
            <n-button
              v-if="(channel.headers || []).length < MAX_WEBHOOK_HEADERS"
              size="small"
              dashed
              :disabled="!editable"
              @click="addHeader"
            >
              <template #icon><Plus aria-hidden="true" /></template>
              {{ t('settings.advancedSettings.notificationsPage.addHeader', 'Add header') }}
            </n-button>
          </div>
        </div>
      </template>

      <template v-for="[name, property] in fields" :key="name">
        <label class="notification-channel-field" :class="{ 'boolean-field': property.type === 'boolean' }">
          <span>{{ fieldTitle(name, property) }}<b v-if="required(name)" class="required-mark"> *</b></span>
          <n-switch
            v-if="property.type === 'boolean'"
            :value="setting(name) === true"
            :disabled="fieldDisabled(property)"
            :aria-label="fieldTitle(name, property)"
            @update:value="(value: boolean) => setSetting(name, value)"
          />
          <n-input-number
            v-else-if="property.type === 'integer' || property.type === 'number'"
            :value="typeof setting(name) === 'number' ? setting(name) as number : null"
            :min="property.minimum"
            :max="property.maximum"
            :precision="property.type === 'integer' ? 0 : undefined"
            :disabled="fieldDisabled(property)"
            :status="invalid.includes(name) ? 'error' : undefined"
            @update:value="(value: number | null) => setSetting(name, value)"
          />
          <div v-else-if="isSecret(property)" class="notification-secret-field">
            <n-input
              :value="channel.secrets?.[name] ?? ''"
              type="password"
              show-password-on="click"
              :maxlength="property.maxLength"
              :disabled="fieldDisabled(property)"
              :placeholder="secretPlaceholder(name)"
              :status="invalid.includes(name) ? 'error' : undefined"
              :input-props="{ autocomplete: 'new-password' }"
              @update:value="(value: string) => setSecret(name, value)"
            />
            <n-button
              v-if="savedSecrets.includes(name) && channel.secrets && name in channel.secrets"
              quaternary
              circle
              :disabled="fieldDisabled(property)"
              :aria-label="t('settings.plugins.clearLabel', 'Clear {name}').replace('{name}', fieldTitle(name, property))"
              @click="clearSecret(name)"
            >
              <template #icon><X aria-hidden="true" /></template>
            </n-button>
          </div>
          <n-select
            v-else-if="property.enum?.length"
            :value="setting(name) as string | number | null"
            :options="enumOptions(property)"
            :disabled="fieldDisabled(property)"
            :aria-label="fieldTitle(name, property)"
            :status="invalid.includes(name) ? 'error' : undefined"
            @update:value="(value: string | number) => setSetting(name, value)"
          />
          <n-input
            v-else
            :value="typeof setting(name) === 'string' ? setting(name) as string : ''"
            :maxlength="property.maxLength"
            :disabled="fieldDisabled(property)"
            :status="invalid.includes(name) ? 'error' : undefined"
            :input-props="{ autocomplete: 'off', spellcheck: false }"
            @update:value="(value: string) => setSetting(name, value)"
          />
        </label>
      </template>
    </div>
  </section>
</template>

<style scoped>
.notification-channel { display: grid; gap: 16px; min-width: 0; padding: 20px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); }
h2 { margin: 0; color: var(--foreground); font-size: 16px; font-weight: 600; overflow-wrap: anywhere; }
.notification-channel-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-width: 0; }
.notification-channel-title { min-width: 0; }
.notification-channel-hint { margin: 4px 0 0; color: var(--muted-foreground); line-height: 1.6; overflow-wrap: anywhere; }
.notification-channel-status { margin: 4px 0 0; color: var(--muted-foreground); font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
.notification-channel-status.failed { color: var(--destructive); }
.notification-channel-actions { display: flex; flex: 0 0 auto; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; }
.notification-channel-fields { display: grid; gap: 14px; padding-top: 16px; border-top: 1px solid var(--border); }
.notification-channel-field { display: grid; gap: 6px; min-width: 0; }
.notification-channel-field > span { color: var(--muted-foreground); font-size: 13px; }
.notification-channel-field.boolean-field { grid-template-columns: minmax(0, 1fr) auto; align-items: center; }
.notification-channel-field small.notification-channel-hint { margin: 0; font-size: 12px; }
.notification-header-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; gap: 8px; align-items: center; }
.notification-secret-field { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: center; }
.required-mark { color: var(--destructive); font-weight: 600; }
@media (max-width: 760px) {
  .notification-channel { padding: 16px; }
  .notification-channel-header { flex-wrap: wrap; }
  .notification-header-row { grid-template-columns: minmax(0, 1fr) auto; }
  .notification-header-row > :nth-child(2) { grid-column: 1; }
}
</style>
