<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, useId, type HTMLAttributes } from 'vue'
import { NTab, NTabs, useMessage } from 'naive-ui'

import {
  api,
  extensionTranslation,
  type ExtensionSummary,
  type NotificationChannelResult,
  type NotificationChannels,
  type NotificationConfig,
  type WebhookConfig,
} from '@/api/client'
import { hasPermission } from '@/build'
import { useAuth } from '@/composables/useAuth'
import { useNotifications } from '@/composables/useNotifications'
import { currentLanguage, t } from '@/i18n/runtime'
import { Bell, Plus, RefreshCw, Save, Settings, Trash2, X } from '@/icons'
import NotificationList from './notifications/NotificationList.vue'

const props = defineProps<{ catalog?: ExtensionSummary[] }>()
const emit = defineEmits<{ 'open-plugins': []; 'open-plugin': [id: string] }>()

type Category = 'web_messages' | 'sign_in' | 'video_signal' | 'network'

const message = useMessage()
const { auth } = useAuth()
const canManage = computed(() => hasPermission(auth, 'settings.manage'))
const { entries, loading: listLoading, watchList, clear, remove } = useNotifications()
const releaseList = watchList()

const form = ref<NotificationConfig | null>(null)
const saved = shallowRef('')
// Saved header values are not sent back; a blank value keeps the saved one.
const savedHeaders = shallowRef(new Set<string>())
const loading = shallowRef(false)
const saving = shallowRef(false)
const error = shallowRef('')
const channels = shallowRef<NotificationChannels | null>(null)
const testing = reactive<Record<string, boolean>>({})

const tabNames = ['recent', 'record', 'channels'] as const
type Tab = typeof tabNames[number]
const activeTab = ref<Tab>('recent')
const idPrefix = useId()
const tabID = (name: Tab) => `${idPrefix}-tab-${name}`
const panelID = (name: Tab) => `${idPrefix}-panel-${name}`
const tabLabels = computed<Record<Tab, string>>(() => ({
  recent: t('settings.advancedSettings.notificationsPage.recent', 'Recent'),
  record: t('settings.advancedSettings.notificationsPage.record', 'Record'),
  channels: t('settings.advancedSettings.notificationsPage.channels', 'Channels'),
}))

async function handleTabKeydown(event: KeyboardEvent, name: Tab) {
  const index = tabNames.indexOf(name)
  let next = index
  if (event.key === 'ArrowRight') next = (index + 1) % tabNames.length
  else if (event.key === 'ArrowLeft') next = (index + tabNames.length - 1) % tabNames.length
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = tabNames.length - 1
  else if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  activeTab.value = tabNames[next]!
  await nextTick()
  document.getElementById(tabID(activeTab.value))?.focus()
}

function tabAttributes(name: Tab): HTMLAttributes {
  return {
    id: tabID(name),
    role: 'tab',
    tabindex: activeTab.value === name ? 0 : -1,
    'aria-selected': activeTab.value === name,
    'aria-controls': panelID(name),
    onKeydown: (event: KeyboardEvent) => handleTabKeydown(event, name),
  }
}

const categories = computed<{ key: Category; label: string; hint: string }[]>(() => [
  {
    key: 'web_messages',
    label: t('settings.advancedSettings.notificationsPage.webMessages', 'Console prompts'),
    hint: t('settings.advancedSettings.notificationsPage.webMessagesHint', 'Prompts shown in the console. They are not sent to channels.'),
  },
  {
    key: 'sign_in',
    label: t('settings.advancedSettings.notificationsPage.signIn', 'Sign-ins'),
    hint: t('settings.advancedSettings.notificationsPage.signInHint', 'Successful and failed sign-ins, with the user name and source address.'),
  },
  {
    key: 'video_signal',
    label: t('settings.advancedSettings.notificationsPage.videoSignal', 'Video signal'),
    hint: t('settings.advancedSettings.notificationsPage.videoSignalHint', 'Video signal lost and restored.'),
  },
  {
    key: 'network',
    label: t('settings.advancedSettings.notificationsPage.network', 'Network'),
    hint: t('settings.advancedSettings.notificationsPage.networkHint', 'Network disconnects, reconnects and address changes.'),
  },
])

const levelOptions = computed(() => [
  { value: 'info', label: t('settings.advancedSettings.notificationsPage.levelAll', 'All') },
  { value: 'warning', label: t('settings.advancedSettings.notificationsPage.levelWarning', 'Warnings and errors') },
  { value: 'error', label: t('settings.advancedSettings.notificationsPage.levelError', 'Errors only') },
])

function normalized(config: NotificationConfig): NotificationConfig {
  return {
    ...config,
    webhook: {
      ...config.webhook,
      url: config.webhook.url.trim(),
      headers: config.webhook.headers.map((header) => ({ name: header.name.trim(), value: header.value.trim() })),
    },
  }
}

const dirty = computed(() => !!form.value && JSON.stringify(normalized(form.value)) !== saved.value)
const webhookUrlValid = computed(() => {
  const url = form.value?.webhook.url.trim() ?? ''
  if (!url) return !form.value?.webhook.enabled
  try {
    const parsed = new URL(url)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && !!parsed.hostname
  } catch {
    return false
  }
})
const headersValid = computed(() => {
  const names = new Set<string>()
  return (form.value?.webhook.headers ?? []).every((header) => {
    const name = header.name.trim().toLowerCase()
    if (!/^[!#$%&'*+\-.^_`|~0-9a-z]{1,64}$/.test(name) || names.has(name)) return false
    names.add(name)
    return !['host', 'content-length', 'content-type', 'transfer-encoding', 'connection'].includes(name)
  })
})
const valid = computed(() => webhookUrlValid.value && headersValid.value)

function errorText(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason)
}

async function loadChannels() {
  try {
    channels.value = await api.getNotificationChannels()
  } catch (reason) {
    channels.value = { webhook: { last: null }, extensions: [], error: errorText(reason) }
  }
}

function apply(config: NotificationConfig) {
  form.value = structuredClone(config)
  saved.value = JSON.stringify(normalized(config))
  savedHeaders.value = new Set(config.webhook.headers.map((header) => header.name.toLowerCase()))
}

function headerValuePlaceholder(name: string) {
  return savedHeaders.value.has(name.trim().toLowerCase())
    ? t('settings.advancedSettings.notificationsPage.keepValue', 'Leave blank to keep the saved value')
    : t('settings.advancedSettings.notificationsPage.headerValue', 'Value')
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    apply(await api.getNotificationConfig())
  } catch (reason) {
    error.value = errorText(reason)
  } finally {
    loading.value = false
  }
  void loadChannels()
}

async function save() {
  if (!form.value || !valid.value) return
  saving.value = true
  try {
    apply(await api.saveNotificationConfig(normalized(form.value)))
    message.success(t('settings.success', 'Settings saved'))
  } catch (reason) {
    message.error(errorText(reason))
  } finally {
    saving.value = false
  }
}

async function test(id: string, webhook?: WebhookConfig) {
  testing[id] = true
  try {
    await api.testNotificationChannel(id, webhook)
    message.success(t('settings.advancedSettings.notificationsPage.testSent', 'Test notification sent'))
  } catch (reason) {
    message.error(errorText(reason))
  } finally {
    testing[id] = false
  }
}

function addHeader() {
  form.value?.webhook.headers.push({ name: '', value: '' })
}

function removeHeader(index: number) {
  form.value?.webhook.headers.splice(index, 1)
}

const pluginChannels = computed(() => (channels.value?.extensions ?? []).map((channel) => {
  const extension = props.catalog?.find((item) => item.id === channel.source)
  const plugin = extension ? extensionTranslation(extension, currentLanguage.value).name : channel.source
  return { ...channel, name: channel.title || plugin, plugin }
}))

const timeFormat = computed(() => new Intl.DateTimeFormat(document.documentElement.lang || undefined, {
  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
}))

function lastResult(result: NotificationChannelResult | null | undefined) {
  if (!result) return ''
  const parts: string[] = []
  if (result.at_unix_ms) {
    const at = timeFormat.value.format(new Date(result.at_unix_ms))
    parts.push(result.ok
      ? t('settings.advancedSettings.notificationsPage.lastSent', 'Last sent {{time}}').replace('{{time}}', at)
      : t('settings.advancedSettings.notificationsPage.lastFailed', 'Failed {{time}}: {{error}}')
        .replace('{{time}}', at).replace('{{error}}', result.error || ''))
  }
  if (result.suppressed) {
    parts.push(t('settings.advancedSettings.notificationsPage.suppressed', '{{count}} skipped by the rate limit')
      .replace('{{count}}', String(result.suppressed)))
  }
  return parts.join(' · ')
}

let channelTimer: number | undefined
onMounted(() => {
  void load()
  // Delivery results change in the background.
  channelTimer = window.setInterval(() => { void loadChannels() }, 15_000)
})
onBeforeUnmount(() => {
  window.clearInterval(channelTimer)
  releaseList()
})
</script>

<template>
  <div class="notification-settings-page">
    <NTabs
      v-model:value="activeTab"
      class="host-tabs notification-tabs"
      type="line"
      role="tablist"
      :aria-label="t('settings.advancedSettings.notifications', 'Notifications')"
      aria-orientation="horizontal"
      :animated="false"
    >
      <NTab v-for="name in tabNames" :key="name" :name="name" v-bind="tabAttributes(name)">
        {{ tabLabels[name] }}
      </NTab>
    </NTabs>

    <div v-show="activeTab === 'recent'" :id="panelID('recent')" class="notification-tab-panel" role="tabpanel" :aria-labelledby="tabID('recent')" tabindex="0">
      <section class="notification-panel">
        <div class="notification-card-header">
          <p class="notification-hint">{{ t('settings.advancedSettings.notificationsPage.recentHint', 'Cleared when the device restarts.') }}</p>
          <n-button v-if="entries.length" size="small" @click="clear">
            <template #icon><Trash2 aria-hidden="true" /></template>
            {{ t('notifications.clear', 'Clear all') }}
          </n-button>
        </div>
        <NotificationList v-if="entries.length" :entries="entries" removable @remove="remove" />
        <p v-else-if="!listLoading" class="notification-empty">{{ t('notifications.empty', 'No notifications') }}</p>
      </section>
    </div>

    <template v-if="activeTab !== 'recent'">
      <n-alert v-if="error" type="error" :bordered="false">
        {{ error }}
        <template v-if="!form" #action>
          <n-button :loading="loading" @click="load">
            <template #icon><RefreshCw aria-hidden="true" /></template>
            {{ t('common.retry', 'Retry') }}
          </n-button>
        </template>
      </n-alert>
    </template>

    <n-spin v-if="activeTab !== 'recent'" :show="loading && !form">
      <div v-if="form" class="notification-settings-sections">
        <div v-show="activeTab === 'record'" :id="panelID('record')" class="notification-tab-panel" role="tabpanel" :aria-labelledby="tabID('record')" tabindex="0">
          <section v-for="category in categories" :key="category.key" class="notification-panel">
            <div class="notification-card-header">
              <div class="notification-card-title">
                <h2 :id="`notification-category-${category.key}`">{{ category.label }}</h2>
                <p class="notification-hint">{{ category.hint }}</p>
              </div>
              <n-switch
                v-model:value="form[category.key]"
                :disabled="!canManage || saving"
                :aria-labelledby="`notification-category-${category.key}`"
              />
            </div>
          </section>
        </div>

        <div v-show="activeTab === 'channels'" :id="panelID('channels')" class="notification-tab-panel" role="tabpanel" :aria-labelledby="tabID('channels')" tabindex="0">
          <p class="notification-hint">{{ t('settings.advancedSettings.notificationsPage.channelsHint', 'Sign-in, video signal and network notifications are sent to enabled channels.') }}</p>

          <section class="notification-panel" aria-labelledby="notification-webhook-heading">
            <div class="notification-card-header">
              <div class="notification-card-title">
                <h2 id="notification-webhook-heading">Webhook</h2>
                <p class="notification-hint">{{ t('settings.advancedSettings.notificationsPage.webhookHint', 'Sends a JSON POST to the URL.') }}</p>
                <p v-if="lastResult(channels?.webhook.last)" class="notification-status" :class="{ failed: channels?.webhook.last?.ok === false }">
                  {{ lastResult(channels?.webhook.last) }}
                </p>
              </div>
              <div class="notification-card-actions">
                <n-button
                  v-if="form.webhook.enabled"
                  size="small"
                  :loading="testing.webhook"
                  :disabled="!canManage || !form.webhook.url.trim() || !valid"
                  @click="test('webhook', normalized(form).webhook)"
                >
                  <template #icon><Bell aria-hidden="true" /></template>
                  {{ t('settings.advancedSettings.notificationsPage.test', 'Send test') }}
                </n-button>
                <n-switch
                  v-model:value="form.webhook.enabled"
                  :disabled="!canManage || saving"
                  aria-labelledby="notification-webhook-heading"
                />
              </div>
            </div>
            <div v-if="form.webhook.enabled" class="notification-webhook-fields">
              <label class="notification-field">
                <span>{{ t('settings.advancedSettings.notificationsPage.webhookUrl', 'URL') }}</span>
                <n-input
                  v-model:value="form.webhook.url"
                  :disabled="!canManage || saving"
                  :status="webhookUrlValid ? undefined : 'error'"
                  placeholder="https://"
                  :input-props="{ inputmode: 'url', autocomplete: 'off', spellcheck: false }"
                />
              </label>
              <label class="notification-field">
                <span>{{ t('settings.advancedSettings.notificationsPage.minLevel', 'Send') }}</span>
                <n-select v-model:value="form.webhook.min_level" :options="levelOptions" :disabled="!canManage || saving" />
              </label>
              <div class="notification-field">
                <span>{{ t('settings.advancedSettings.notificationsPage.headers', 'Request headers') }}</span>
                <div v-for="(header, index) in form.webhook.headers" :key="index" class="notification-header-row">
                  <n-input
                    v-model:value="header.name"
                    :disabled="!canManage || saving"
                    :placeholder="t('settings.advancedSettings.notificationsPage.headerName', 'Name')"
                    :status="headersValid ? undefined : 'error'"
                    :input-props="{ autocomplete: 'off', spellcheck: false }"
                  />
                  <n-input
                    v-model:value="header.value"
                    type="password"
                    show-password-on="click"
                    :disabled="!canManage || saving"
                    :placeholder="headerValuePlaceholder(header.name)"
                    :input-props="{ autocomplete: 'off' }"
                  />
                  <n-button
                    quaternary
                    circle
                    :disabled="!canManage || saving"
                    :aria-label="t('common.delete', 'Delete')"
                    @click="removeHeader(index)"
                  >
                    <template #icon><X aria-hidden="true" /></template>
                  </n-button>
                </div>
                <div>
                  <n-button
                    v-if="form.webhook.headers.length < 8"
                    size="small"
                    dashed
                    :disabled="!canManage || saving"
                    @click="addHeader"
                  >
                    <template #icon><Plus aria-hidden="true" /></template>
                    {{ t('settings.advancedSettings.notificationsPage.addHeader', 'Add header') }}
                  </n-button>
                </div>
              </div>
            </div>
          </section>

          <section v-for="channel in pluginChannels" :key="channel.id" class="notification-panel">
            <div class="notification-card-header">
              <div class="notification-card-title">
                <h2>{{ channel.name }}</h2>
                <p v-if="channel.name !== channel.plugin" class="notification-hint">{{ channel.plugin }}</p>
                <p v-if="lastResult(channel.last)" class="notification-status" :class="{ failed: channel.last?.ok === false }">
                  {{ lastResult(channel.last) }}
                </p>
              </div>
              <div class="notification-card-actions">
                <n-button size="small" :loading="testing[channel.id]" :disabled="!canManage" @click="test(channel.id)">
                  <template #icon><Bell aria-hidden="true" /></template>
                  {{ t('settings.advancedSettings.notificationsPage.test', 'Send test') }}
                </n-button>
                <n-button size="small" @click="emit('open-plugin', channel.source)">
                  <template #icon><Settings aria-hidden="true" /></template>
                  {{ t('settings.advancedSettings.notificationsPage.channelSettings', 'Settings') }}
                </n-button>
              </div>
            </div>
          </section>

          <section v-if="channels && !channels.extensions.length" class="notification-panel">
            <div class="notification-card-header">
              <p class="notification-hint">
                {{ channels.error || t('settings.advancedSettings.notificationsPage.noPluginChannels', 'Plugins can add more channels.') }}
              </p>
              <n-button size="small" @click="emit('open-plugins')">
                {{ t('settings.advancedSettings.notificationsPage.openPlugins', 'Plugins') }}
              </n-button>
            </div>
          </section>
        </div>

        <footer v-if="canManage" class="notification-actions">
          <n-button type="primary" :loading="saving" :disabled="loading || !dirty || !valid" @click="save">
            <template #icon><Save aria-hidden="true" /></template>
            {{ t('common.save', 'Save') }}
          </n-button>
        </footer>
      </div>
    </n-spin>
  </div>
</template>

<style scoped>
.notification-settings-page, .notification-settings-sections, .notification-tab-panel { display: grid; gap: 20px; min-width: 0; }
.notification-tab-panel:focus-visible { outline: 2px solid var(--primary); outline-offset: 4px; border-radius: var(--radius); }
.notification-tabs { min-width: 0; }
.notification-tabs :deep(.n-tabs-tab) { min-height: 44px; }
.notification-tabs :deep(.n-tabs-tab:focus-visible) { outline: 2px solid var(--primary); outline-offset: -2px; border-radius: var(--radius); }
.notification-panel { display: grid; gap: 16px; min-width: 0; padding: 20px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); }
h2 { margin: 0; color: var(--foreground); font-size: 16px; font-weight: 600; overflow-wrap: anywhere; }
.notification-hint { margin: 0; color: var(--muted-foreground); line-height: 1.6; overflow-wrap: anywhere; }
.notification-card-title .notification-hint { margin-top: 8px; }
.notification-status { margin: 4px 0 0; color: var(--muted-foreground); font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
.notification-status.failed { color: var(--destructive); }
.notification-empty { margin: 0; padding: 24px 0; color: var(--muted-foreground); text-align: center; }
.notification-card-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-width: 0; }
.notification-card-title { min-width: 0; }
.notification-card-actions { display: flex; flex: 0 0 auto; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 12px; }
.notification-webhook-fields { display: grid; gap: 14px; padding-top: 16px; border-top: 1px solid var(--border); }
.notification-field { display: grid; gap: 6px; min-width: 0; }
.notification-field > span { color: var(--muted-foreground); font-size: 13px; }
.notification-header-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; gap: 8px; align-items: center; }
.notification-actions { display: flex; justify-content: flex-end; }
@media (max-width: 760px) {
  .notification-panel { padding: 16px; }
  .notification-card-header { flex-wrap: wrap; }
  .notification-header-row { grid-template-columns: minmax(0, 1fr) auto; }
  .notification-header-row > :nth-child(2) { grid-column: 1; }
}
</style>
