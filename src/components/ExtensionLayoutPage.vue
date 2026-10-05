<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { RefreshCw, Save, X } from '@lucide/vue'
import { useMessage } from 'naive-ui'

import {
  api,
  extensionLocalizedText,
  type ExtensionLayout,
  type ExtensionSettingProperty,
  type ExtensionSettingValue,
  type ExtensionStatus,
  type NetworkInterfaceStatus,
} from '@/api/client'
import { currentLanguage, t } from '@/i18n/runtime'
import { qualityTier } from '@/lib/video-quality'
import {
  clearQpOverride,
  hasQpOverride,
  matchingQpPreset,
  qpPresets,
  setQpPreset,
  type QpPresetKey,
} from '@/lib/video-qp'

const props = defineProps<{ extension: ExtensionStatus }>()
const emit = defineEmits<{ updated: [value: ExtensionStatus] }>()

const message = useMessage()
const layout = ref<ExtensionLayout | null>(null)
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const networkInterfaces = ref<NetworkInterfaceStatus[]>([])
const draft = reactive<Record<string, ExtensionSettingValue>>({})
const secretTouched = reactive<Record<string, boolean>>({})
const initialDraft = ref<Record<string, ExtensionSettingValue>>({})
type VideoQpMode = 'auto' | QpPresetKey | 'custom'
type QualityBudgetSelection = number | 'custom'
const qualityBudgetCustomEnabled = ref(false)
const videoQpMode = ref<VideoQpMode>('balanced')

function defaultValue(property: ExtensionSettingProperty): ExtensionSettingValue {
  if (property.default !== undefined) return property.default
  if (property.type === 'boolean') return false
  if (property.type === 'integer' || property.type === 'number') return property.minimum ?? 0
  return ''
}

function syncDraft(status: ExtensionStatus = props.extension) {
  for (const key of Object.keys(draft)) delete draft[key]
  for (const key of Object.keys(secretTouched)) delete secretTouched[key]
  for (const [name, property] of Object.entries(status.settings_schema.properties || {})) {
    draft[name] = Object.prototype.hasOwnProperty.call(status.settings || {}, name)
      ? status.settings[name]
      : defaultValue(property)
  }
  qualityBudgetCustomEnabled.value = Math.round((numericDraft('quality_factor', 1)) * 100) % 10 !== 0
  videoQpMode.value = hasQpOverride(draft)
    ? (matchingQpPreset(draft)?.value ?? 'custom')
    : 'balanced'
  initialDraft.value = { ...draft }
}

async function reload() {
  loading.value = true
  error.value = ''
  try {
    const updated = await api.getExtension(props.extension.id)
    emit('updated', updated)
    syncDraft(updated)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    loading.value = false
  }
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const needsNetworkAddresses = Object.values(props.extension.settings_schema.properties || {})
      .some(({ format }) => format === 'network-address')
    const [loadedLayout, loadedInterfaces] = await Promise.all([
      api.getExtensionLayout(props.extension),
      needsNetworkAddresses ? api.getNetworkInterfaces().catch(() => []) : Promise.resolve([]),
    ])
    layout.value = loadedLayout
    networkInterfaces.value = loadedInterfaces
    syncDraft()
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    loading.value = false
  }
}

function property(name: string) {
  return props.extension.settings_schema.properties[name]
}

function settingTitle(name: string) {
  if (hasIndependentVideoSettings.value && name === 'quality_factor') {
    return t('settings.advancedSettings.displayPage.quality', 'Quality budget (Bitrate)')
  }
  if (hasIndependentVideoSettings.value && name === 'initial_qp') {
    return t('settings.advancedSettings.displayPage.qpPreset', 'Picture preset')
  }
  const field = property(name)
  return extensionLocalizedText(field?.i18n, currentLanguage.value, field?.title || name)
}

function conditionMatches(condition: ExtensionSettingProperty['enabled_when']) {
  return Boolean(condition && draft[condition.field] === condition.equals)
}

function settingEnabled(name: string) {
  const condition = property(name)?.enabled_when
  return !condition || conditionMatches(condition)
}

function settingRequired(name: string) {
  return conditionMatches(property(name)?.required_when)
}

function textValue(name: string) {
  return typeof draft[name] === 'string' ? draft[name] as string : ''
}

function numberValue(name: string) {
  return typeof draft[name] === 'number' ? draft[name] as number : null
}

function numericDraft(name: string, fallback = 0) {
  return typeof draft[name] === 'number' ? draft[name] as number : fallback
}

const hasIndependentVideoSettings = computed(() => props.extension.video?.settings === 'all')
const qualityPercentMinimum = computed(() => Math.round((property('quality_factor')?.minimum ?? 0.01) * 100))
const qualityPercentMaximum = computed(() => Math.round((property('quality_factor')?.maximum ?? 1) * 100))
const qualityPercent = computed({
  get: () => Math.round(numericDraft('quality_factor', 1) * 100),
  set: (value: number) => { draft.quality_factor = value / 100 },
})
const qualityBudgetOptions = computed(() => {
  const options: Array<{ label: string; value: QualityBudgetSelection }> = []
  for (let value = 10; value <= 100; value += 10) {
    if (value < qualityPercentMinimum.value || value > qualityPercentMaximum.value) continue
    const tier = qualityTier(value)
    options.push({ label: `${value}% · ${t(tier.key, tier.fallback)}`, value })
  }
  options.push({ label: t('screen.qualityCustom', 'Custom'), value: 'custom' })
  return options
})
const qualityBudgetSelection = computed<QualityBudgetSelection>({
  get: () => qualityBudgetCustomEnabled.value ? 'custom' : qualityPercent.value,
  set: (selection) => {
    if (selection === 'custom') {
      qualityBudgetCustomEnabled.value = true
      return
    }
    qualityBudgetCustomEnabled.value = false
    qualityPercent.value = selection
  },
})
const qualityDescription = computed(() => {
  const tier = qualityTier(qualityPercent.value)
  return t(tier.key, tier.fallback)
})
const videoQpOptions = computed(() => [
  ...qpPresets.map((preset) => ({
    label: t(preset.labelKey, preset.labelFallback),
    value: preset.value,
  })),
  { label: t('settings.advancedSettings.displayPage.qpCustom', 'Custom parameters'), value: 'custom' },
])
const videoQpDescription = computed(() => {
  if (videoQpMode.value === 'auto') {
    return t('settings.advancedSettings.displayPage.qpAutomaticHint', 'Uses the device default picture parameters.')
  }
  const preset = qpPresets.find((candidate) => candidate.value === videoQpMode.value)
  if (preset) return t(preset.descriptionKey, preset.descriptionFallback)
  return t('settings.advancedSettings.displayPage.qpCustomHint', 'Set advanced picture parameters manually.')
})

function visibleSettingNames(settings: string[]) {
  if (!hasIndependentVideoSettings.value || !settings.includes('initial_qp')) return settings
  return settings.filter((name) => name !== 'min_qp' && name !== 'max_qp')
}

function applyVideoQpMode(value: VideoQpMode) {
  videoQpMode.value = value
  if (value === 'auto') {
    clearQpOverride(draft)
    return
  }
  if (numericDraft('bitrate_kbps') > 0) draft.bitrate_kbps = 0
  if (value === 'custom') {
    if (!hasQpOverride(draft)) setQpPreset(draft, 'balanced')
    return
  }
  setQpPreset(draft, value)
}

function setNumberValue(name: string, value: number | null) {
  draft[name] = value
  if (hasIndependentVideoSettings.value && name === 'bitrate_kbps' && (value ?? 0) > 0) {
    clearQpOverride(draft)
    // A bitrate ceiling clears explicit QP values internally. Keep the
    // user-facing preset selector on the balanced preset instead of exposing
    // the removed automatic option.
    videoQpMode.value = 'balanced'
  }
}

function enumOptions(name: string) {
  return (property(name)?.enum || []).map(value => ({
    value,
    label: typeof value === 'string' ? value.toUpperCase() : String(value),
  }))
}

function secretConfigured(name: string) {
  return props.extension.secrets_configured?.includes(`/${name}`) || false
}

function secretPlaceholder(name: string) {
  if (secretTouched[name] && draft[name] === '') return t('settings.plugins.willBeCleared', 'Will be cleared')
  return secretConfigured(name) ? t('settings.plugins.configured', 'Configured') : ''
}

function setSecret(name: string, value: string) {
  draft[name] = value
  secretTouched[name] = true
}

function networkAddressOptions(name: string) {
  const options = new Map<string, string>([
    ['0.0.0.0', t('settings.plugins.allInterfacesIPv4', 'All interfaces (IPv4)')],
    ['::', t('settings.plugins.allInterfacesIPv6', 'All interfaces (IPv6)')],
    ['127.0.0.1', t('settings.plugins.loopbackIPv4', 'Loopback (IPv4)')],
    ['::1', t('settings.plugins.loopbackIPv6', 'Loopback (IPv6)')],
  ])
  for (const networkInterface of networkInterfaces.value) {
    for (const addressWithPrefix of networkInterface.addresses || []) {
      const address = addressWithPrefix.replace(/\/\d+$/, '')
      if (address) options.set(address, `${networkInterface.name} · ${address}`)
    }
  }
  const current = textValue(name)
  if (current && !options.has(current)) {
    options.set(current, t('settings.plugins.customAddress', 'Custom · {address}').replace('{address}', current))
  }
  return Array.from(options, ([value, label]) => ({ value, label }))
}

function kindLabel(kind: string) {
  if (kind === 'protocol') return t('settings.plugins.kindProtocol', 'Protocol')
  if (kind === 'service') return t('settings.plugins.kindService', 'Service')
  return kind
}

async function save() {
  if (!layout.value) return
  const settings: Record<string, ExtensionSettingValue> = {}
  for (const section of layout.value.sections) {
    for (const name of section.settings) {
      const field = property(name)
      if (!field || field.readOnly) continue
      if (field.format === 'password' && secretConfigured(name) && !secretTouched[name]) continue
      settings[name] = draft[name]
    }
  }
  saving.value = true
  try {
    await api.updateExtension(props.extension.id, { settings })
    const updated = await api.getExtension(props.extension.id)
    emit('updated', updated)
    syncDraft(updated)
    message.success(t('settings.success', 'Settings saved'))
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : String(reason))
  } finally {
    saving.value = false
  }
}

const documentColumns = computed(() => layout.value?.columns || 1)
const conditionalSettingsValid = computed(() => Object.entries(props.extension.settings_schema.properties || {})
  .every(([name, field]) => {
    if (!settingRequired(name)) return true
    if (field.format === 'password' && secretConfigured(name) && !secretTouched[name]) return true
    return draft[name] !== '' && draft[name] !== null && draft[name] !== undefined
  }))
const dirty = computed(() => Object.entries(props.extension.settings_schema.properties || {}).some(([name, field]) => {
  if (field.readOnly) return false
  if (field.format === 'password' && secretTouched[name]) return true
  return draft[name] !== initialDraft.value[name]
}))

watch(() => [props.extension.id, props.extension.version, props.extension.page?.entrypoint], load, { immediate: true })
watch(() => props.extension.settings, () => syncDraft())
</script>

<template>
  <n-spin :show="loading">
    <n-alert v-if="error" type="error" :show-icon="false">{{ error }}</n-alert>
    <div v-else-if="layout" class="extension-layout-page">
      <n-alert v-if="extension.error" type="error" :show-icon="false">{{ extension.error }}</n-alert>
      <section class="extension-runtime-summary">
        <div class="extension-runtime-state">
          <span class="extension-runtime-dot" :class="{ running: extension.running }" />
          <span>{{ extension.running ? t('settings.plugins.running', 'Running') : t('settings.plugins.stopped', 'Stopped') }}</span>
        </div>
        <dl>
          <div>
            <dt>{{ t('settings.plugins.version', 'Version') }}</dt>
            <dd>{{ extension.version || '-' }}</dd>
          </div>
          <div>
            <dt>{{ t('settings.plugins.type', 'Type') }}</dt>
            <dd>{{ kindLabel(extension.kind) }}</dd>
          </div>
        </dl>
      </section>

      <div class="extension-layout" :class="{ 'multi-column': documentColumns > 1 }" :style="{ '--layout-columns': documentColumns }">
        <section
          v-for="section in layout.sections"
          :key="section.title"
          class="extension-layout-section"
        >
          <div class="extension-layout-heading">
            <h2>{{ extensionLocalizedText(section.i18n, currentLanguage, section.title) }}</h2>
            <p v-if="section.description || section.description_i18n" class="extension-layout-copy">
              {{ extensionLocalizedText(section.description_i18n, currentLanguage, section.description || '') }}
            </p>
          </div>
          <div class="extension-layout-fields" :style="{ '--section-columns': section.columns }">
            <label
              v-for="name in visibleSettingNames(section.settings)"
              :key="name"
              :class="{ 'boolean-field': property(name)?.type === 'boolean' }"
            >
              <span>{{ settingTitle(name) }}<b v-if="settingRequired(name)" class="required-mark"> *</b></span>
              <n-switch
                v-if="property(name)?.type === 'boolean'"
                :value="draft[name] === true"
                :disabled="property(name)?.readOnly || saving || !settingEnabled(name)"
                size="small"
                @update:value="(value: boolean) => draft[name] = value"
              />
              <div
                v-else-if="hasIndependentVideoSettings && name === 'quality_factor'"
                class="video-setting-stack"
              >
                <n-select
                  v-model:value="qualityBudgetSelection"
                  :options="qualityBudgetOptions"
                  :disabled="property(name)?.readOnly || saving || !settingEnabled(name)"
                />
                <div v-if="qualityBudgetCustomEnabled" class="quality-custom-field">
                  <n-slider
                    v-model:value="qualityPercent"
                    :min="qualityPercentMinimum"
                    :max="qualityPercentMaximum"
                    :step="1"
                    :disabled="property(name)?.readOnly || saving || !settingEnabled(name)"
                  />
                  <n-input-number
                    v-model:value="qualityPercent"
                    :min="qualityPercentMinimum"
                    :max="qualityPercentMaximum"
                    :step="1"
                    :disabled="property(name)?.readOnly || saving || !settingEnabled(name)"
                  >
                    <template #suffix>%</template>
                  </n-input-number>
                </div>
                <span class="video-setting-hint">{{ qualityDescription }}</span>
                <span class="video-setting-hint">{{ t('settings.advancedSettings.displayPage.qualityPercentHint', 'VBR bitrate budget') }}</span>
              </div>
              <div
                v-else-if="hasIndependentVideoSettings && name === 'initial_qp'"
                class="video-setting-stack"
              >
                <n-select
                  :value="videoQpMode"
                  :options="videoQpOptions"
                  :disabled="property(name)?.readOnly || saving || !settingEnabled(name)"
                  @update:value="applyVideoQpMode"
                />
                <span class="video-setting-hint">{{ videoQpDescription }}</span>
                <div v-if="videoQpMode === 'custom'" class="video-custom-qp-grid">
                  <div v-for="qpName in ['initial_qp', 'min_qp', 'max_qp']" :key="qpName">
                    <span>{{ extensionLocalizedText(property(qpName)?.i18n, currentLanguage, property(qpName)?.title || qpName) }}</span>
                    <n-input-number
                      :value="numberValue(qpName)"
                      :min="property(qpName)?.minimum"
                      :max="property(qpName)?.maximum"
                      :precision="0"
                      :disabled="property(qpName)?.readOnly || saving || !settingEnabled(qpName)"
                      @update:value="(value: number | null) => draft[qpName] = value"
                    />
                  </div>
                </div>
              </div>
              <n-input-number
                v-else-if="property(name)?.type === 'integer' || property(name)?.type === 'number'"
                :value="numberValue(name)"
                :min="property(name)?.minimum"
                :max="property(name)?.maximum"
                :precision="property(name)?.type === 'integer' ? 0 : undefined"
                :disabled="property(name)?.readOnly || saving || !settingEnabled(name)"
                @update:value="(value: number | null) => setNumberValue(name, value)"
              />
              <div v-else-if="property(name)?.format === 'password'" class="secret-field">
                <n-input
                  :value="textValue(name)"
                  type="password"
                  show-password-on="click"
                  autocomplete="new-password"
                  :maxlength="property(name)?.maxLength"
                  :disabled="property(name)?.readOnly || saving || !settingEnabled(name)"
                  :placeholder="secretPlaceholder(name)"
                  @update:value="(value: string) => setSecret(name, value)"
                />
                <n-tooltip v-if="secretConfigured(name) && !property(name)?.readOnly">
                  <template #trigger>
                    <n-button quaternary circle :disabled="!settingEnabled(name)" :aria-label="t('settings.plugins.clearLabel', 'Clear {name}').replace('{name}', settingTitle(name))" @click="setSecret(name, '')">
                      <template #icon><X /></template>
                    </n-button>
                  </template>
                  {{ t('settings.plugins.clear', 'Clear') }}
                </n-tooltip>
              </div>
              <n-select
                v-else-if="property(name)?.enum?.length"
                :value="draft[name]"
                :options="enumOptions(name)"
                :disabled="property(name)?.readOnly || saving || !settingEnabled(name)"
                @update:value="(value: ExtensionSettingValue) => draft[name] = value"
              />
              <n-select
                v-else-if="property(name)?.format === 'network-address'"
                :value="textValue(name)"
                :options="networkAddressOptions(name)"
                :disabled="property(name)?.readOnly || saving || !settingEnabled(name)"
                filterable
                @update:value="(value: string) => draft[name] = value"
              />
              <n-input
                v-else
                :value="textValue(name)"
                autocomplete="off"
                :maxlength="property(name)?.maxLength"
                :disabled="property(name)?.readOnly || saving || !settingEnabled(name)"
                @update:value="(value: string) => draft[name] = value"
              />
            </label>
          </div>
        </section>
        <footer>
          <n-tooltip>
            <template #trigger>
              <n-button quaternary circle :disabled="saving" :aria-label="t('common.reload', 'Reload')" @click="reload">
                <template #icon><RefreshCw /></template>
              </n-button>
            </template>
            {{ t('common.reload', 'Reload') }}
          </n-tooltip>
          <n-button type="primary" :loading="saving" :disabled="!dirty || !conditionalSettingsValid" @click="save">
            <template #icon><Save /></template>
            {{ t('common.save', 'Save') }}
          </n-button>
        </footer>
      </div>
    </div>
  </n-spin>
</template>

<style scoped>
.extension-layout-page { display: grid; gap: 0; }
.extension-runtime-summary {
  display: flex;
  min-height: 54px;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 0 2px;
  border-bottom: 1px solid var(--border);
}
.extension-runtime-state { display: flex; align-items: center; gap: 9px; font-size: 13px; font-weight: 600; }
.extension-runtime-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted-foreground); }
.extension-runtime-dot.running { background: var(--success); box-shadow: 0 0 0 3px rgb(47 191 159 / 12%); }
.extension-runtime-summary dl { display: flex; gap: 28px; margin: 0; }
.extension-runtime-summary dl > div { display: flex; align-items: baseline; gap: 8px; }
.extension-runtime-summary dt { color: var(--muted-foreground); font-size: 11px; }
.extension-runtime-summary dd { margin: 0; color: var(--foreground); font-size: 12px; text-transform: capitalize; }
.extension-layout {
  display: grid;
  grid-template-columns: repeat(var(--layout-columns), minmax(0, 1fr));
  column-gap: 32px;
}
.extension-layout-section {
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(120px, 160px) minmax(0, 1fr);
  gap: 28px;
  padding: 24px 2px;
  border-bottom: 1px solid var(--border);
}
.extension-layout.multi-column .extension-layout-section { grid-template-columns: 1fr; gap: 14px; }
.extension-layout-heading { display: grid; align-content: start; gap: 6px; }
.extension-layout-section h2 { margin: 0; font-size: 13px; font-weight: 600; }
.extension-layout-copy { margin: 0; color: var(--muted-foreground); font-size: 12px; line-height: 1.5; }
.extension-layout-fields {
  display: grid;
  grid-template-columns: repeat(var(--section-columns), minmax(0, 1fr));
  gap: 14px 18px;
}
.extension-layout-fields label { display: grid; min-width: 0; align-content: start; gap: 6px; }
.extension-layout-fields label > span { color: var(--muted-foreground); font-size: 11px; }
.required-mark { color: var(--destructive); font-weight: 600; }
.extension-layout-fields .boolean-field { display: flex; align-items: center; justify-content: space-between; }
.video-setting-stack { display: grid; width: 100%; gap: 7px; }
.video-setting-hint { display: block; color: var(--muted-foreground) !important; font-size: 12px !important; line-height: 1.6; }
.quality-custom-field { display: grid; grid-template-columns: minmax(0, 1fr) 108px; align-items: center; gap: 12px; width: 100%; }
.video-custom-qp-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; padding-top: 4px; }
.video-custom-qp-grid > div { display: grid; gap: 6px; min-width: 0; }
.video-custom-qp-grid span { color: var(--muted-foreground); font-size: 11px; }
.secret-field { display: grid; grid-template-columns: minmax(0, 1fr) 34px; align-items: center; gap: 4px; }
.extension-layout > footer { display: flex; grid-column: 1 / -1; justify-content: flex-end; gap: 8px; padding-top: 18px; }
@media (max-width: 720px) {
  .extension-layout { grid-template-columns: 1fr; }
  .extension-layout-section { grid-template-columns: 1fr; gap: 14px; padding: 20px 2px; }
}
@media (max-width: 520px) {
  .extension-runtime-summary { align-items: flex-start; padding: 14px 2px; }
  .extension-runtime-summary dl { display: grid; gap: 4px; }
  .extension-layout-fields { grid-template-columns: 1fr; }
}
</style>
