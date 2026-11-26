<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, useId, type HTMLAttributes } from 'vue'
import { NTab, NTabs, useMessage } from 'naive-ui'

import {
  api,
  extensionLocalizedText,
  extensionTranslation,
  type ExtensionSummary,
  type NotificationChannelConfig,
  type NotificationChannelResult,
  type NotificationChannels,
  type NotificationConfig,
} from '@/api/client'
import { hasPermission } from '@/build'
import { useAuth } from '@/composables/useAuth'
import { useNotifications } from '@/composables/useNotifications'
import { currentLanguage, t } from '@/i18n/runtime'
import { Plus, RefreshCw, Save, Trash2 } from '@/icons'
import {
  MAX_CHANNELS,
  WEBHOOK_CHANNEL,
  invalidFields,
  newChannel,
  normalizedChannel,
} from '@/lib/notification-channels'
import NotificationChannelCard from './notifications/NotificationChannelCard.vue'
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
// Saved secrets read back blank; a blank value keeps the saved one.
const savedChannels = shallowRef<NotificationChannelConfig[]>([])
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

function normalized(config: NotificationConfig): NotificationConfig {
  return { ...config, channels: config.channels.map(normalizedChannel) }
}

const dirty = computed(() => !!form.value && JSON.stringify(normalized(form.value)) !== saved.value)

function channelType(channel: NotificationChannelConfig) {
  return channels.value?.types.find((kind) => kind.type === channel.type)
}

function savedChannel(channel: NotificationChannelConfig) {
  return channel.id ? savedChannels.value.find((item) => item.id === channel.id && item.type === channel.type) : undefined
}

function savedSecrets(channel: NotificationChannelConfig) {
  return Object.keys(savedChannel(channel)?.secrets || {})
}

function savedHeaders(channel: NotificationChannelConfig) {
  return (savedChannel(channel)?.headers || []).map((header) => header.name.toLowerCase())
}

function pluginName(source: string) {
  const extension = props.catalog?.find((item) => item.id === source)
  return extension ? extensionTranslation(extension, currentLanguage.value).name : source
}

function typeTitle(type: string) {
  if (type === WEBHOOK_CHANNEL) return 'Webhook'
  const kind = channels.value?.types.find((item) => item.type === type)
  const source = type.split('/')[0] || type
  return extensionLocalizedText(kind?.i18n, currentLanguage.value, kind?.title || '') || pluginName(source)
}

// Unknown until the types are read; a channel of a missing type is kept but not sent.
function unavailable(channel: NotificationChannelConfig) {
  return channel.type !== WEBHOOK_CHANNEL && !!channels.value && !channels.value.error && !channelType(channel)
}

const valid = computed(() => (form.value?.channels ?? []).every((channel) =>
  !invalidFields(channel, channelType(channel)?.settings_schema, savedSecrets(channel)).length))

const addOptions = computed(() => [
  { key: WEBHOOK_CHANNEL, label: typeTitle(WEBHOOK_CHANNEL) },
  ...(channels.value?.types ?? []).map((kind) => ({ key: kind.type, label: typeTitle(kind.type) })),
])

function addChannel(type: string) {
  if (!form.value || form.value.channels.length >= MAX_CHANNELS) return
  form.value.channels.push(newChannel(type, channels.value?.types.find((kind) => kind.type === type)?.settings_schema))
}

function removeChannel(index: number) {
  form.value?.channels.splice(index, 1)
}

// New channels have no ID until they are saved.
const channelKeys = new WeakMap<NotificationChannelConfig, string>()
let nextKey = 0
function channelKey(channel: NotificationChannelConfig) {
  let key = channelKeys.get(channel)
  if (!key) {
    key = channel.id ? `saved-${channel.id}` : `new-${++nextKey}`
    channelKeys.set(channel, key)
  }
  return key
}

function openPlugin(channel: NotificationChannelConfig) {
  const source = channel.type.split('/')[0] || ''
  if (props.catalog?.some((item) => item.id === source)) emit('open-plugin', source)
  else emit('open-plugins')
}

function errorText(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason)
}

async function loadChannels() {
  try {
    channels.value = await api.getNotificationChannels()
  } catch (reason) {
    channels.value = { types: [], results: {}, error: errorText(reason) }
  }
}

function apply(config: NotificationConfig) {
  const channels = config.channels ?? []
  form.value = structuredClone({ ...config, channels })
  saved.value = JSON.stringify(normalized({ ...config, channels }))
  savedChannels.value = structuredClone(channels)
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

async function test(channel: NotificationChannelConfig) {
  const key = channelKey(channel)
  testing[key] = true
  try {
    await api.testNotificationChannel(normalizedChannel(channel))
    message.success(t('settings.advancedSettings.notificationsPage.testSent', 'Test notification sent'))
  } catch (reason) {
    message.error(errorText(reason))
  } finally {
    testing[key] = false
  }
}

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

          <NotificationChannelCard
            v-for="(channel, index) in form.channels"
            :key="channelKey(channel)"
            :channel="channel"
            :type-title="typeTitle(channel.type)"
            :schema="channelType(channel)?.settings_schema"
            :unavailable="unavailable(channel)"
            :saved-secrets="savedSecrets(channel)"
            :saved-headers="savedHeaders(channel)"
            :status="channel.id ? lastResult(channels?.results[channel.id]) : ''"
            :failed="!!channel.id && channels?.results[channel.id]?.ok === false"
            :testing="!!testing[channelKey(channel)]"
            :disabled="saving"
            :can-manage="canManage"
            :initially-open="!channel.id"
            @test="test(channel)"
            @remove="removeChannel(index)"
            @open-plugin="openPlugin(channel)"
          />

          <div v-if="canManage && form.channels.length < MAX_CHANNELS">
            <n-dropdown trigger="click" :options="addOptions" :disabled="saving" @select="addChannel">
              <n-button dashed :disabled="saving">
                <template #icon><Plus aria-hidden="true" /></template>
                {{ t('settings.advancedSettings.notificationsPage.addChannel', 'Add channel') }}
              </n-button>
            </n-dropdown>
          </div>

          <section v-if="channels && !channels.types.length" class="notification-panel">
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
.notification-empty { margin: 0; padding: 24px 0; color: var(--muted-foreground); text-align: center; }
.notification-card-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-width: 0; }
.notification-card-title { min-width: 0; }
.notification-actions { display: flex; justify-content: flex-end; }
@media (max-width: 760px) {
  .notification-panel { padding: 16px; }
  .notification-card-header { flex-wrap: wrap; }
}
</style>
