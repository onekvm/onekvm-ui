<script setup lang="ts">
import { computed, reactive, ref, watch, type Component } from 'vue'
import { Box, CheckCircle2, Download, FileUp, Info, PackageCheck, Power, PowerOff, Save, Trash2, Upload, X, icons } from '@lucide/vue'
import { useMessage } from 'naive-ui'

import {
  api,
  extensionAssetURL,
  extensionLocalizedText,
  extensionRouteURL,
  extensionTranslation,
  type ExtensionSettingProperty,
  type ExtensionSettingValue,
  type ExtensionPackagePreview,
  type ExtensionSummary,
  type ExtensionStatus,
  type ExtensionUpload,
} from '@/api/client'
import { currentLanguage, t } from '@/i18n/runtime'

const props = defineProps<{ active: boolean; catalog?: ExtensionSummary[]; catalogLoading?: boolean }>()
const emit = defineEmits<{ catalog: [value: ExtensionSummary[]] }>()

type ExtensionDraft = {
  enabled: boolean
  settings: Record<string, ExtensionSettingValue>
  secretTouched: Record<string, boolean>
}

const message = useMessage()
const extensions = ref<ExtensionSummary[]>([])
const details = reactive<Record<string, ExtensionStatus>>({})
const drafts = reactive<Record<string, ExtensionDraft>>({})
const loading = ref(false)
const detailLoading = ref('')
const expanded = ref('')
const busy = ref('')
const loadError = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const installModalOpen = ref(false)
const installPhase = ref<'select' | 'uploading' | 'ready' | 'installing' | 'success'>('select')
const installFile = ref<File | null>(null)
const stagedUpload = ref<ExtensionUpload | null>(null)
const uploadProgress = ref(0)
const installError = ref('')
const packageDragging = ref(false)

const memoryBudget = computed(() => {
	const status = extensions.value.find((extension) => (extension.memory_budget_total_bytes || 0) > 0)
	return {
		used: status?.memory_budget_used_bytes || 0,
		total: status?.memory_budget_total_bytes || 0,
	}
})
const memoryBudgetPercentage = computed(() => {
	if (!memoryBudget.value.total) return 0
	return Math.min(100, Math.round(memoryBudget.value.used / memoryBudget.value.total * 100))
})
const memoryBudgetOver = computed(() => memoryBudget.value.used > memoryBudget.value.total)

function formatMemoryBudget(bytes: number) {
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KiB`
	const mib = bytes / (1024 * 1024)
	return `${Number.isInteger(mib) ? mib : mib.toFixed(1)} MiB`
}

function insufficientMemoryBudgetMessage(required: number, available: number, used: number, total: number) {
	return replace(t(
		'settings.plugins.memoryBudgetInsufficient',
		'Cannot enable this plugin: it needs {required} of memory budget, but only {available} is available ({used} of {total} already allocated).',
	), {
		required: formatMemoryBudget(required),
		available: formatMemoryBudget(available),
		used: formatMemoryBudget(used),
		total: formatMemoryBudget(total),
	})
}

function defaultValue(property: ExtensionSettingProperty): ExtensionSettingValue {
  if (property.default !== undefined) return property.default
  if (property.type === 'boolean') return false
  if (property.type === 'integer' || property.type === 'number') return property.minimum ?? 0
  return ''
}

function syncDraft(status: ExtensionStatus) {
  const settings: Record<string, ExtensionSettingValue> = {}
  for (const [name, property] of Object.entries(status.settings_schema.properties || {})) {
    settings[name] = Object.prototype.hasOwnProperty.call(status.settings || {}, name)
      ? status.settings[name]
      : defaultValue(property)
  }
  drafts[status.id] = { enabled: status.enabled, settings, secretTouched: {} }
}

function fields(status: ExtensionStatus) {
  return Object.entries(status.settings_schema.properties || {})
}

function secretConfigured(status: ExtensionStatus, name: string) {
  return status.secrets_configured?.includes(`/${name}`) || false
}

function textValue(id: string, name: string) {
  const value = drafts[id]?.settings[name]
  return typeof value === 'string' ? value : ''
}

function numberValue(id: string, name: string) {
  const value = drafts[id]?.settings[name]
  return typeof value === 'number' ? value : null
}

function settingEnumOptions(property: ExtensionSettingProperty) {
  return (property.enum || []).map(value => ({
    value,
    label: typeof value === 'string' ? value.toUpperCase() : String(value),
  }))
}

function booleanValue(id: string, name: string) {
  return drafts[id]?.settings[name] === true
}

function settingEnabled(id: string, property: ExtensionSettingProperty) {
  const condition = property.enabled_when
  if (!condition) return true
  return drafts[id]?.settings[condition.field] === condition.equals
}

function setValue(id: string, name: string, value: ExtensionSettingValue) {
  if (drafts[id]) drafts[id].settings[name] = value
}

function setSecretValue(id: string, name: string, value: string) {
  const draft = drafts[id]
  if (!draft) return
  draft.settings[name] = value
  draft.secretTouched[name] = true
}

function clearSecret(id: string, name: string) {
  setSecretValue(id, name, '')
}

function secretPlaceholder(status: ExtensionStatus, name: string) {
  const draft = drafts[status.id]
  if (draft?.secretTouched[name] && draft.settings[name] === '') {
    return t('settings.plugins.willBeCleared', 'Will be cleared')
  }
  return secretConfigured(status, name) ? t('settings.plugins.configured', 'Configured') : ''
}

function settingTitle(property: ExtensionSettingProperty) {
  return extensionLocalizedText(property.i18n, currentLanguage.value, property.title)
}

function fileRoutes(status: ExtensionStatus) {
  return (status.routes || []).filter((route) => route.backend === 'file')
}

function replace(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce((result, [name, value]) => result.split(`{${name}}`).join(value), template)
}

async function load(showSpinner = true) {
  if (showSpinner) loading.value = true
  loadError.value = ''
  try {
    extensions.value = await api.getExtensions()
    emit('catalog', extensions.value)
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    if (showSpinner) loading.value = false
  }
}

async function execute(key: string, operation: () => Promise<unknown>, success: string) {
  busy.value = key
  try {
    await operation()
    message.success(success)
    await load(false)
  } catch (error) {
    message.error(extensionErrorMessage(error))
    await load(false)
  } finally {
    busy.value = ''
  }
}

function chooseLocalPackage() {
  fileInput.value?.click()
}

function openInstaller() {
  resetInstaller()
  installModalOpen.value = true
}

function resetInstaller() {
  installPhase.value = 'select'
  installFile.value = null
  stagedUpload.value = null
  uploadProgress.value = 0
  installError.value = ''
  packageDragging.value = false
  if (fileInput.value) fileInput.value.value = ''
}

async function closeInstaller() {
  if (installPhase.value === 'installing') return
  const token = stagedUpload.value?.token
  installModalOpen.value = false
  if (token && installPhase.value !== 'success') {
    try {
      await api.discardStagedExtension(token)
    } catch {
      // Staged uploads expire automatically; closing the dialog must stay fast.
    }
  }
}

function packageValidationError(file: File) {
  const lowerName = file.name.toLowerCase()
  if (!lowerName.endsWith('.ipk') && !lowerName.endsWith('.ipks')) {
    return t('settings.plugins.invalidPackage', 'Select an IPK or IPKS package')
  }
  if (file.size > 32 * 1024 * 1024) {
    return t('settings.plugins.packageTooLarge', 'Plugin package exceeds 32 MiB')
  }
  return ''
}

async function stagePackage(file: File) {
  const validationError = packageValidationError(file)
  if (validationError) {
    installError.value = validationError
    return
  }
  installFile.value = file
  installError.value = ''
  uploadProgress.value = 0
  installPhase.value = 'uploading'
  try {
    stagedUpload.value = await api.stageLocalExtension(file, (percentage) => {
      uploadProgress.value = percentage
    })
    installPhase.value = 'ready'
  } catch (error) {
    installError.value = extensionErrorMessage(error)
    installPhase.value = 'select'
  }
}

async function uploadLocalPackage(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  await stagePackage(file)
}

async function dropLocalPackage(event: DragEvent) {
  packageDragging.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) await stagePackage(file)
}

async function chooseAnotherPackage() {
  const token = stagedUpload.value?.token
  if (token) {
    try {
      await api.discardStagedExtension(token)
    } catch {
      // A missing/expired token is already discarded from the user's view.
    }
  }
  resetInstaller()
  chooseLocalPackage()
}

async function installStagedPackage() {
  const upload = stagedUpload.value
  if (!upload) return
  installError.value = ''
  installPhase.value = 'installing'
  try {
    await api.installStagedExtension(upload.token)
    installPhase.value = 'success'
    message.success(t('settings.plugins.installed', 'Plugin installed'))
    await load(false)
  } catch (error) {
    installError.value = extensionErrorMessage(error)
    installPhase.value = 'ready'
  }
}

function uploadedPackage() {
  return stagedUpload.value?.package
}

function packageSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}

function packageActionLabel(status: ExtensionPackagePreview) {
  return status.installed
    ? t('settings.plugins.updatePlugin', 'Update plugin')
    : t('settings.plugins.installPlugin', 'Install plugin')
}

function extensionName(status: ExtensionSummary) {
  return extensionTranslation(status, currentLanguage.value).name
}

function extensionDescription(status: ExtensionSummary) {
  return extensionTranslation(status, currentLanguage.value).description || replace(
    t('settings.plugins.fallbackDescription', '{kind} plugin for OneKVM'),
    { kind: status.kind },
  )
}

function extensionKind(status: ExtensionSummary) {
  if (status.kind === 'protocol') return t('settings.plugins.kindProtocol', 'Protocol')
  if (status.kind === 'service') return t('settings.plugins.kindService', 'Service')
  return status.kind
}

function extensionErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error)
	const budget = raw.match(/memory budget is insufficient: required=(\d+) available=(\d+) used=(\d+) total=(\d+)/)
	if (budget) {
		return insufficientMemoryBudgetMessage(Number(budget[1]), Number(budget[2]), Number(budget[3]), Number(budget[4]))
	}
  const conflict = raw.match(/\bextension ([a-z0-9][a-z0-9-]{1,62}) conflicts with enabled extension ([a-z0-9][a-z0-9-]{1,62}) on machine ([a-z0-9][a-z0-9-]{1,62})\b/)
  if (!conflict) return raw

  const name = (id: string) => {
    const status = extensions.value.find((candidate) => candidate.id === id)
    return status ? extensionName(status) : id
  }
  return t(
    'settings.plugins.activationConflict',
    'Cannot enable {extension} because {conflict} is enabled. These plugins are mutually exclusive on this device.',
  )
    .replace('{extension}', name(conflict[1]))
    .replace('{conflict}', name(conflict[2]))
}

function extensionIcon(status: ExtensionSummary): { component: Component; url: string } {
  const icon = status.icon
  if (icon?.source === 'custom') return { component: Box, url: extensionAssetURL(status, icon.path) }
  if (icon?.source === 'lucide') {
    const name = icon.name.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('')
    return { component: (icons as Record<string, Component>)[name] || Box, url: '' }
  }
  return { component: Box, url: '' }
}

function packageIconComponent(status: ExtensionSummary) {
  const icon = extensionIcon(status)
  return icon.url ? Box : icon.component
}

async function setEnabled(status: ExtensionSummary, enabled: boolean) {
	if (enabled && status.memory_budget_bytes && memoryBudget.value.total) {
		const available = Math.max(0, memoryBudget.value.total - memoryBudget.value.used)
		if (status.memory_budget_bytes > available) {
			message.error(insufficientMemoryBudgetMessage(
				status.memory_budget_bytes, available, memoryBudget.value.used, memoryBudget.value.total,
			))
			return
		}
	}
  await execute(
    `${status.id}:toggle`,
    () => api.extensionAction(status.id, enabled ? 'enable' : 'disable'),
    enabled
      ? t('settings.plugins.enabledMessage', 'Plugin enabled')
      : t('settings.plugins.disabledMessage', 'Plugin disabled'),
  )
}

async function toggleDetails(status: ExtensionSummary) {
  if (expanded.value === status.id) {
    expanded.value = ''
    return
  }
  expanded.value = status.id
  if (details[status.id]?.version === status.version) return
  detailLoading.value = status.id
  try {
    const detail = await api.getExtension(status.id)
    details[status.id] = detail
    syncDraft(detail)
  } catch (error) {
    message.error(extensionErrorMessage(error))
    expanded.value = ''
  } finally {
    detailLoading.value = ''
  }
}

async function save(status: ExtensionStatus) {
  const draft = drafts[status.id]
  if (!draft) return
  const settings: Record<string, ExtensionSettingValue> = {}
  for (const [name, property] of fields(status)) {
    if (property.readOnly) continue
    const value = draft.settings[name]
    if (property.format === 'password' && secretConfigured(status, name) && !draft.secretTouched[name]) continue
    settings[name] = value
  }
  busy.value = `${status.id}:save`
  try {
    await api.updateExtension(status.id, { settings })
    const detail = await api.getExtension(status.id)
    details[status.id] = detail
    syncDraft(detail)
    message.success(t('settings.success', 'Settings saved'))
    await load(false)
  } catch (error) {
    message.error(extensionErrorMessage(error))
  } finally {
    busy.value = ''
  }
}

function statusType(status: ExtensionSummary) {
  if (status.error) return 'error'
  if (status.running) return 'success'
  return 'default'
}

function statusText(status: ExtensionSummary) {
  if (!status.installed) return t('settings.plugins.statusAvailable', 'Available')
  if (status.error) return t('settings.plugins.statusError', 'Error')
  if (!status.enabled) return t('settings.plugins.statusDisabled', 'Disabled')
  if (status.running) return t('settings.plugins.statusEnabled', 'Enabled')
  return t('settings.plugins.statusStopped', 'Stopped')
}

function pluginCount() {
  return replace(t('settings.plugins.count', '{count} plugins'), { count: String(extensions.value.length) })
}

function uninstallPrompt(status: ExtensionSummary) {
  return replace(t('settings.plugins.uninstallConfirm', 'Uninstall {name}?'), { name: extensionName(status) })
}

function uninstallLabel(status: ExtensionSummary) {
  return replace(t('settings.plugins.uninstallLabel', 'Uninstall {name}'), { name: extensionName(status) })
}

watch(() => props.catalog, (catalog) => {
  if (!catalog) return
  extensions.value = catalog
  for (const [id, detail] of Object.entries(details)) {
    const summary = catalog.find((status) => status.id === id)
    if (!summary || summary.version !== detail.version) {
      delete details[id]
      delete drafts[id]
      if (expanded.value === id) expanded.value = ''
    }
  }
}, { immediate: true })

watch(() => props.active, (active) => {
  if (active && !props.catalog) void load()
}, { immediate: true })
</script>

<template>
  <section class="extension-manager">
    <header class="extension-manager-heading">
      <span>{{ pluginCount() }}</span>
		<div v-if="memoryBudget.total" class="extension-memory-budget">
			<span>
				{{ t('settings.plugins.memoryBudget', 'Plugin memory budget') }}:
				{{ formatMemoryBudget(memoryBudget.used) }} / {{ formatMemoryBudget(memoryBudget.total) }}
			</span>
			<n-progress
				type="line"
				:percentage="memoryBudgetPercentage"
				:show-indicator="false"
				:height="5"
				:border-radius="3"
				:status="memoryBudgetOver ? 'error' : 'success'"
			/>
		</div>
      <div class="catalog-actions">
        <input ref="fileInput" class="package-input" type="file" accept=".ipk,.ipks,application/vnd.onekvm.ipk,application/vnd.onekvm.ipks" @change="uploadLocalPackage" />
        <n-button size="small" type="primary" secondary :disabled="busy !== ''" @click="openInstaller">
          <template #icon><Upload /></template>
          {{ t('settings.plugins.installPackage', 'Install plugin') }}
        </n-button>
      </div>
    </header>

    <n-alert v-if="loadError" type="error" :show-icon="false">{{ loadError }}</n-alert>
    <n-spin class="extension-catalog-spin" :show="loading || !!catalogLoading">
      <n-empty v-if="!loading && !catalogLoading && extensions.length === 0" :description="t('settings.plugins.empty', 'No plugins available')" />
      <ul v-else class="extension-list">
        <li v-for="status in extensions" :key="status.id" class="extension-item">
          <div class="extension-row">
            <span class="extension-icon">
              <img v-if="extensionIcon(status).url" :src="extensionIcon(status).url" alt="" />
              <component v-else :is="extensionIcon(status).component" :size="20" />
            </span>
            <div class="extension-identity">
              <div>
                <strong>{{ extensionName(status) }}</strong>
                <n-tag v-if="status.version" size="tiny" :bordered="false">{{ status.version }}</n-tag>
                <n-tag v-if="status.system" size="tiny" type="info" :bordered="false">
                  {{ t('settings.plugins.systemPlugin', 'System') }}
                </n-tag>
              </div>
              <p>{{ extensionDescription(status) }}</p>
            </div>
            <n-tag size="small" :type="statusType(status)" :bordered="false">
              {{ statusText(status) }}
            </n-tag>
            <div class="extension-actions">
              <n-button
                v-if="!status.installed"
                size="small"
                type="primary"
                :loading="busy === `${status.id}:install`"
                :disabled="busy !== ''"
                @click="execute(`${status.id}:install`, () => api.installExtension(status.id), t('settings.plugins.installed', 'Plugin installed'))"
              >
                <template #icon><Download /></template>
                {{ t('settings.plugins.install', 'Install') }}
              </n-button>
              <template v-else-if="!status.system">
                <n-button
                  size="small"
                  :type="status.enabled ? 'warning' : 'primary'"
                  secondary
                  :loading="busy === `${status.id}:toggle`"
                  :disabled="busy !== ''"
                  @click="setEnabled(status, !status.enabled)"
                >
                  <template #icon><PowerOff v-if="status.enabled" /><Power v-else /></template>
                  {{ status.enabled ? t('settings.plugins.disable', 'Disable') : t('settings.plugins.enable', 'Enable') }}
                </n-button>
              </template>
              <n-button
                size="small"
                secondary
                :loading="detailLoading === status.id"
                :disabled="busy !== ''"
                @click="toggleDetails(status)"
              >
                <template #icon><Info /></template>
                {{ expanded === status.id ? t('settings.plugins.close', 'Close') : t('settings.plugins.details', 'Details') }}
              </n-button>
            </div>
          </div>

          <div v-if="status.error || expanded === status.id" class="extension-detail">
            <n-alert v-if="status.error" type="error" :show-icon="false">{{ status.error }}</n-alert>

            <n-spin v-if="expanded === status.id" class="extension-detail-spin" :show="detailLoading === status.id">
              <dl class="extension-metadata">
                <div>
                  <dt>{{ t('settings.plugins.version', 'Version') }}</dt>
                  <dd>{{ status.version || '—' }}</dd>
                </div>
                <div>
                  <dt>{{ t('settings.plugins.type', 'Type') }}</dt>
                  <dd>{{ extensionKind(status) }}</dd>
                </div>
                <div v-if="status.memory_budget_bytes">
                  <dt>{{ t('settings.plugins.memoryBudget', 'Plugin memory budget') }}</dt>
                  <dd>{{ formatMemoryBudget(status.memory_budget_bytes) }}</dd>
                </div>
                <div v-if="status.author">
                  <dt>{{ t('settings.plugins.author', 'Author') }}</dt>
                  <dd>{{ status.author }}</dd>
                </div>
                <div v-if="status.homepage" class="extension-homepage">
                  <dt>{{ t('settings.plugins.homepage', 'Homepage') }}</dt>
                  <dd><a :href="status.homepage" target="_blank" rel="noopener noreferrer">{{ status.homepage }}</a></dd>
                </div>
                <div v-if="details[status.id] && fileRoutes(details[status.id]).length" class="extension-routes">
                  <dt>{{ t('settings.plugins.webRoutes', 'Web routes') }}</dt>
                  <dd class="extension-route-list">
                    <a
                      v-for="route in fileRoutes(details[status.id])"
                      :key="route.path"
                      :href="extensionRouteURL(status, route)"
                      target="_blank"
                      rel="noopener noreferrer"
                    >{{ extensionRouteURL(status, route) }}</a>
                  </dd>
                </div>
              </dl>

              <template v-if="details[status.id] && drafts[status.id] && status.has_settings && !status.has_page">
                <div class="extension-fields">
                <label v-for="[name, property] in fields(details[status.id])" :key="name" :class="{ 'boolean-field': property.type === 'boolean' }">
                  <span>{{ settingTitle(property) }}</span>
                  <n-switch
                    v-if="property.type === 'boolean'"
                    :value="booleanValue(status.id, name)"
                    :disabled="property.readOnly || !settingEnabled(status.id, property)"
                    size="small"
                    @update:value="(value: boolean) => setValue(status.id, name, value)"
                  />
                  <n-input-number
                    v-else-if="property.type === 'integer' || property.type === 'number'"
                    :value="numberValue(status.id, name)"
                    :min="property.minimum"
                    :max="property.maximum"
                    :precision="property.type === 'integer' ? 0 : undefined"
                    :disabled="property.readOnly || !settingEnabled(status.id, property)"
                    size="small"
                    @update:value="(value: number | null) => setValue(status.id, name, value)"
                  />
                  <div v-else-if="property.format === 'password'" class="secret-field">
                    <n-input
                      :value="textValue(status.id, name)"
                      type="password"
                      show-password-on="click"
                      autocomplete="new-password"
                      :maxlength="property.maxLength"
                      :disabled="property.readOnly || !settingEnabled(status.id, property)"
                      :placeholder="secretPlaceholder(details[status.id], name)"
                      size="small"
                      @update:value="(value: string) => setSecretValue(status.id, name, value)"
                    />
                    <n-tooltip v-if="secretConfigured(details[status.id], name) && !property.readOnly">
                      <template #trigger>
                        <n-button quaternary circle size="small" :aria-label="replace(t('settings.plugins.clearLabel', 'Clear {name}'), { name: settingTitle(property) })" @click="clearSecret(status.id, name)">
                          <template #icon><X /></template>
                        </n-button>
                      </template>
                      {{ t('settings.plugins.clear', 'Clear') }}
                    </n-tooltip>
                  </div>
                  <n-select
                    v-else-if="property.enum?.length"
                    :value="drafts[status.id].settings[name]"
                    :options="settingEnumOptions(property)"
                    :disabled="property.readOnly || !settingEnabled(status.id, property)"
                    size="small"
                    @update:value="(value: ExtensionSettingValue) => setValue(status.id, name, value)"
                  />
                  <n-input
                    v-else
                    :value="textValue(status.id, name)"
                    type="text"
                    autocomplete="off"
                    :maxlength="property.maxLength"
                    :disabled="property.readOnly || !settingEnabled(status.id, property)"
                    size="small"
                    @update:value="(value: string) => setValue(status.id, name, value)"
                  />
                </label>
                </div>
                <footer>
                  <n-button size="small" type="primary" :loading="busy === `${status.id}:save`" :disabled="busy !== ''" @click="save(details[status.id])">
                    <template #icon><Save /></template>
                    {{ t('settings.plugins.save', 'Save') }}
                  </n-button>
                </footer>
              </template>

              <footer v-if="status.installed && !status.system" class="extension-danger-actions">
                <n-popconfirm
                  :positive-text="t('settings.plugins.uninstall', 'Uninstall')"
                  :negative-text="t('settings.plugins.cancel', 'Cancel')"
                  @positive-click="execute(`${status.id}:remove`, () => api.removeExtension(status.id), t('settings.plugins.uninstalled', 'Plugin uninstalled'))"
                >
                  <template #trigger>
                    <n-button
                      size="small"
                      type="error"
                      secondary
                      :loading="busy === `${status.id}:remove`"
                      :disabled="busy !== ''"
                      :aria-label="uninstallLabel(status)"
                    >
                      <template #icon><Trash2 /></template>
                      {{ t('settings.plugins.uninstall', 'Uninstall') }}
                    </n-button>
                  </template>
                  {{ uninstallPrompt(status) }}
                </n-popconfirm>
              </footer>
            </n-spin>
          </div>
        </li>
      </ul>
    </n-spin>

    <n-modal
      :show="installModalOpen"
      :mask-closable="installPhase !== 'uploading' && installPhase !== 'installing'"
      :close-on-esc="installPhase !== 'uploading' && installPhase !== 'installing'"
      @update:show="(show: boolean) => { if (!show) void closeInstaller() }"
    >
      <n-card
        class="plugin-installer-card"
        :title="t('settings.plugins.installerTitle', 'Install plugin')"
        :closable="installPhase !== 'uploading' && installPhase !== 'installing'"
        role="dialog"
        aria-modal="true"
        @close="closeInstaller"
      >
        <div v-if="installPhase === 'select'" class="installer-stage">
          <div class="installer-intro">
            <span class="installer-hero-icon"><FileUp :size="31" /></span>
            <div>
              <strong>{{ t('settings.plugins.choosePackageTitle', 'Choose a plugin package') }}</strong>
              <p>{{ t('settings.plugins.choosePackageDescription', 'Upload a signed OneKVM IPK or IPKS package to inspect it before installation.') }}</p>
            </div>
          </div>
          <n-alert v-if="installError" type="error" :show-icon="false">{{ installError }}</n-alert>
          <button
            type="button"
            class="plugin-drop-zone"
            :class="{ dragging: packageDragging }"
            @click="chooseLocalPackage"
            @dragenter.prevent="packageDragging = true"
            @dragover.prevent="packageDragging = true"
            @dragleave.self="packageDragging = false"
            @drop.prevent="dropLocalPackage"
          >
            <Upload :size="25" />
            <strong>{{ t('settings.plugins.selectPackage', 'Select package') }}</strong>
            <span>{{ t('settings.plugins.dropPackage', 'or drag an IPK/IPKS file here') }}</span>
          </button>
        </div>

        <div v-else-if="installPhase === 'uploading'" class="installer-stage installer-centered">
          <span class="installer-hero-icon"><Upload :size="31" /></span>
          <strong>{{ t('settings.plugins.uploadingPackage', 'Uploading plugin') }}</strong>
          <span class="installer-file-name">{{ installFile?.name }}</span>
          <n-progress type="line" :percentage="uploadProgress" :show-indicator="false" processing />
          <span>{{ uploadProgress }}%</span>
        </div>

        <div v-else-if="installPhase === 'ready' && uploadedPackage()" class="installer-stage">
          <div class="package-preview">
            <span class="installer-package-icon">
              <img
                v-if="uploadedPackage()!.preview_icon_data_url"
                :src="uploadedPackage()!.preview_icon_data_url"
                alt=""
              />
              <component v-else :is="packageIconComponent(uploadedPackage()!)" :size="32" />
            </span>
            <div class="package-preview-identity">
              <strong>{{ extensionName(uploadedPackage()!) }}</strong>
              <span>{{ uploadedPackage()!.version }}</span>
            </div>
          </div>
          <p class="package-preview-description">{{ extensionDescription(uploadedPackage()!) }}</p>
          <dl class="package-metadata">
            <div><dt>{{ t('settings.plugins.packageFile', 'Package') }}</dt><dd>{{ installFile?.name }}</dd></div>
            <div><dt>{{ t('settings.plugins.packageType', 'Type') }}</dt><dd>{{ uploadedPackage()!.bundle ? 'IPKS' : 'IPK' }}</dd></div>
            <div><dt>{{ t('settings.plugins.architecture', 'Architecture') }}</dt><dd>{{ uploadedPackage()!.architecture }}</dd></div>
            <div><dt>{{ t('settings.plugins.packageSize', 'Size') }}</dt><dd>{{ packageSize(stagedUpload!.size) }}</dd></div>
          </dl>
          <section v-if="uploadedPackage()!.bundle && uploadedPackage()!.packages?.length" class="bundle-contents">
            <header>
              <strong>{{ t('settings.plugins.bundleContents', 'IPKS package contents') }}</strong>
              <span>{{ replace(t('settings.plugins.packageCount', '{count} packages'), { count: String(uploadedPackage()!.packages!.length) }) }}</span>
            </header>
            <ul>
              <li v-for="item in uploadedPackage()!.packages" :key="item.name">
                <div class="bundle-package-identity">
                  <strong>{{ item.name }}</strong>
                  <span>{{ item.version }} · {{ item.architecture }}</span>
                </div>
                <n-tag size="tiny" :bordered="false" :type="item.root ? 'info' : 'default'">
                  {{ item.root ? t('settings.plugins.mainPackage', 'Main package') : t('settings.plugins.dependencyPackage', 'Dependency') }}
                </n-tag>
                <span class="bundle-package-status" :class="{ installed: item.installed }">
                  <CheckCircle2 v-if="item.installed" :size="14" />
                  {{ item.installed
                    ? replace(t('settings.plugins.packageInstalledVersion', 'Installed: {version}'), { version: item.installed_version || item.version })
                    : t('settings.plugins.packageNotInstalled', 'Not installed') }}
                </span>
              </li>
            </ul>
          </section>
          <n-alert v-if="installError" type="error" :show-icon="false">{{ installError }}</n-alert>
          <p class="installer-confirm-copy">
            {{ uploadedPackage()!.installed
              ? t('settings.plugins.updateConfirmation', 'The installed plugin will be updated with this package.')
              : t('settings.plugins.installConfirmation', 'Do you want to install this plugin?') }}
          </p>
        </div>

        <div v-else-if="installPhase === 'installing' && uploadedPackage()" class="installer-stage installer-centered">
          <span class="installer-hero-icon"><PackageCheck :size="31" /></span>
          <strong>{{ replace(t('settings.plugins.installingNamed', 'Installing {name}'), { name: extensionName(uploadedPackage()!) }) }}</strong>
          <span>{{ t('settings.plugins.installingDescription', 'Validating and installing the package. Do not close this window.') }}</span>
          <div class="installer-indeterminate" role="progressbar" :aria-label="t('settings.plugins.installing', 'Installing')">
            <span />
          </div>
        </div>

        <div v-else-if="installPhase === 'success' && uploadedPackage()" class="installer-stage installer-centered">
          <span class="installer-hero-icon installer-success"><CheckCircle2 :size="34" /></span>
          <strong>{{ t('settings.plugins.installComplete', 'Plugin installed') }}</strong>
          <span>{{ replace(t('settings.plugins.installCompleteDescription', '{name} is ready to use.'), { name: extensionName(uploadedPackage()!) }) }}</span>
        </div>

        <template #footer>
          <div class="installer-actions">
            <n-button v-if="installPhase === 'select'" @click="closeInstaller">{{ t('settings.plugins.cancel', 'Cancel') }}</n-button>
            <template v-else-if="installPhase === 'ready' && uploadedPackage()">
              <n-button @click="chooseAnotherPackage">{{ t('settings.plugins.chooseAnother', 'Choose another') }}</n-button>
              <span class="installer-action-spacer" />
              <n-button @click="closeInstaller">{{ t('settings.plugins.cancel', 'Cancel') }}</n-button>
              <n-button type="primary" @click="installStagedPackage">{{ packageActionLabel(uploadedPackage()!) }}</n-button>
            </template>
            <n-button v-else-if="installPhase === 'success'" type="primary" @click="closeInstaller">{{ t('settings.plugins.done', 'Done') }}</n-button>
          </div>
        </template>
      </n-card>
    </n-modal>
  </section>
</template>

<style scoped>
.extension-manager { display: grid; gap: 10px; }
.extension-manager-heading { display: flex; min-height: 28px; align-items: center; justify-content: space-between; gap: 8px; color: #929ca5; font-size: 12px; }
.extension-memory-budget { display: grid; width: min(240px, 32vw); margin-left: auto; gap: 4px; padding: 0 10px; font-variant-numeric: tabular-nums; }
.extension-memory-budget .n-progress { width: 100%; }
.extension-catalog-spin { min-height: 84px; }
.catalog-actions { display: flex; align-items: center; gap: 2px; }
.package-input { display: none; }
.plugin-installer-card { width: min(500px, calc(100vw - 28px)); }
.installer-stage { display: grid; gap: 16px; min-height: 220px; }
.installer-intro { display: flex; align-items: center; gap: 14px; }
.installer-intro > div { display: grid; min-width: 0; gap: 4px; }
.installer-intro strong,
.installer-centered > strong { color: #eef2f5; font-size: 16px; }
.installer-intro p,
.package-preview-description,
.installer-confirm-copy { margin: 0; color: #929ca5; font-size: 12px; line-height: 1.55; }
.installer-hero-icon,
.installer-package-icon {
  display: grid;
  width: 58px;
  height: 58px;
  flex: 0 0 58px;
  place-items: center;
  border-radius: 16px;
  background: rgba(24, 160, 88, .12);
  color: #63d89a;
}
.installer-success { background: rgba(24, 160, 88, .16); color: #63e6a2; }
.plugin-drop-zone {
  display: grid;
  min-height: 134px;
  place-items: center;
  align-content: center;
  gap: 7px;
  border: 1px dashed #3c4955;
  border-radius: 10px;
  background: #11161b;
  color: #aeb8c1;
  cursor: pointer;
  transition: border-color .15s ease, background .15s ease;
}
.plugin-drop-zone:hover,
.plugin-drop-zone.dragging { border-color: #18a058; background: rgba(24, 160, 88, .07); }
.plugin-drop-zone strong { color: #e5e9ed; font-size: 13px; }
.plugin-drop-zone span,
.installer-centered > span,
.installer-file-name { color: #8f99a3; font-size: 12px; }
.installer-centered { min-height: 250px; place-items: center; align-content: center; text-align: center; }
.installer-centered .n-progress { width: min(360px, 100%); }
.installer-file-name { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.package-preview { display: flex; align-items: center; gap: 14px; }
.installer-package-icon img { width: 32px; height: 32px; object-fit: contain; }
.package-preview-identity { display: grid; min-width: 0; gap: 4px; }
.package-preview-identity strong { overflow: hidden; color: #eef2f5; font-size: 18px; text-overflow: ellipsis; white-space: nowrap; }
.package-preview-identity span { color: #8f99a3; font-size: 12px; }
.package-metadata { display: grid; margin: 0; border: 1px solid #30363d; border-radius: 8px; overflow: hidden; }
.package-metadata > div { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 12px; padding: 9px 12px; }
.package-metadata > div + div { border-top: 1px solid #2a3037; }
.package-metadata dt { color: #87919b; font-size: 11px; }
.package-metadata dd { min-width: 0; margin: 0; overflow-wrap: anywhere; color: #cbd2d8; font-size: 12px; }
.bundle-contents { display: grid; gap: 8px; }
.bundle-contents > header { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: #d6dce1; font-size: 12px; }
.bundle-contents > header span { color: #7f8a94; font-size: 11px; }
.bundle-contents ul { display: grid; max-height: 220px; margin: 0; padding: 0; overflow: auto; border: 1px solid #30363d; border-radius: 8px; list-style: none; }
.bundle-contents li { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(108px, auto); align-items: center; gap: 10px; padding: 9px 12px; }
.bundle-contents li + li { border-top: 1px solid #2a3037; }
.bundle-package-identity { display: grid; min-width: 0; gap: 2px; }
.bundle-package-identity strong { overflow: hidden; color: #cbd2d8; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.bundle-package-identity span { color: #7f8a94; font-size: 10px; }
.bundle-package-status { display: inline-flex; align-items: center; justify-content: flex-end; gap: 5px; color: #8d98a2; font-size: 11px; white-space: nowrap; }
.bundle-package-status.installed { color: #63d89a; }
.installer-actions { display: flex; width: 100%; align-items: center; justify-content: flex-end; gap: 8px; }
.installer-action-spacer { flex: 1; }
.installer-indeterminate {
  position: relative;
  width: min(360px, 100%);
  height: 4px;
  overflow: hidden;
  border-radius: 999px;
  background: #283039;
}
.installer-indeterminate > span {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 42%;
  border-radius: inherit;
  background: #18a058;
  animation: installer-progress 1.15s ease-in-out infinite;
}
@keyframes installer-progress {
  0% { left: -45%; }
  100% { left: 105%; }
}
.extension-list {
  margin: 0;
  padding: 0;
  overflow: hidden;
  border: 1px solid #30363d;
  border-radius: 6px;
  list-style: none;
}
.extension-item + .extension-item { border-top: 1px solid #30363d; }
.extension-row {
  display: flex;
  min-height: 54px;
  align-items: center;
  gap: 9px;
  padding: 7px 12px;
  background: #15191e;
}
.extension-row:hover,
.extension-row:focus-visible { background: #1b2026; outline: none; }
.extension-icon { display: grid; width: 32px; height: 32px; flex: 0 0 32px; place-items: center; color: #a9b4be; }
.extension-icon img { width: 24px; height: 24px; object-fit: contain; }
.extension-identity { display: grid; min-width: 0; flex: 1; gap: 2px; }
.extension-identity > div { display: flex; min-width: 0; align-items: center; gap: 7px; }
.extension-identity strong { overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.extension-identity p { margin: 0; color: #8f99a3; font-size: 11px; line-height: 1.35; }
.extension-actions { display: flex; flex: 0 0 auto; align-items: center; gap: 3px; }
.extension-detail { display: grid; gap: 14px; padding: 14px 16px 16px 53px; background: #11151a; }
.extension-detail-spin { min-height: 72px; }
.extension-detail-spin :deep(.n-spin-content) { display: grid; gap: 14px; }
.extension-metadata { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 0; overflow: hidden; border: 1px solid #2d343c; border-radius: 7px; }
.extension-metadata > div { display: grid; min-width: 0; gap: 4px; padding: 9px 12px; }
.extension-metadata > div:nth-child(even) { border-left: 1px solid #2d343c; }
.extension-metadata > div:nth-child(n + 3) { border-top: 1px solid #2d343c; }
.extension-metadata dt { color: #87919b; font-size: 11px; }
.extension-metadata dd { min-width: 0; margin: 0; color: #d3d9de; font-size: 12px; overflow-wrap: anywhere; }
.extension-metadata a { color: #63d89a; text-decoration: none; }
.extension-metadata a:hover { text-decoration: underline; }
.extension-metadata .extension-homepage { grid-column: 1 / -1; border-left: 0; }
.extension-metadata .extension-routes { grid-column: 1 / -1; border-left: 0; }
.extension-route-list { display: grid; gap: 3px; }
.extension-fields { display: grid; grid-template-columns: minmax(0, 1fr) minmax(120px, .45fr); gap: 9px; }
.extension-fields label { display: grid; min-width: 0; gap: 5px; }
.extension-fields label > span { color: #9da7b1; font-size: 11px; }
.secret-field { display: grid; grid-template-columns: minmax(0, 1fr) 28px; align-items: center; gap: 4px; }
.extension-fields .boolean-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  grid-column: 1 / -1;
}
.extension-detail footer { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
.extension-danger-actions { padding-top: 12px; border-top: 1px solid #2d343c; }
@media (max-width: 520px) {
  .extension-manager-heading { flex-wrap: wrap; }
  .extension-memory-budget { order: 3; width: 100%; margin-left: 0; padding: 0; }
  .plugin-installer-card { width: calc(100vw - 16px); }
  .package-metadata > div { grid-template-columns: 86px minmax(0, 1fr); }
  .bundle-contents li { grid-template-columns: minmax(0, 1fr) auto; }
  .bundle-package-status { grid-column: 1 / -1; justify-content: flex-start; }
  .installer-actions { flex-wrap: wrap; }
  .installer-action-spacer { display: none; }
  .extension-row { flex-wrap: wrap; padding: 9px; }
  .extension-identity { min-width: calc(100% - 50px); }
  .extension-row > .n-tag { margin-left: 41px; }
  .extension-actions { margin-left: auto; }
  .extension-detail { padding: 14px 10px 16px; }
  .extension-metadata { grid-template-columns: 1fr; }
  .extension-metadata > div:nth-child(n + 2) { border-top: 1px solid #2d343c; }
  .extension-metadata > div:nth-child(even) { border-left: 0; }
  .extension-metadata .extension-homepage { grid-column: 1; }
  .extension-metadata .extension-routes { grid-column: 1; }
  .extension-fields { grid-template-columns: 1fr; }
  .extension-fields label { grid-column: 1 !important; }
  .extension-detail > footer { flex-wrap: wrap; }
}
</style>
