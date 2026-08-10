<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Save, SlidersHorizontal } from '@lucide/vue'
import { useDialog, useMessage } from 'naive-ui'

import { api, type ConfigSchema, type OneKVMConfig } from '@/api/client'
import { type MouseMode } from '@/composables/useMouse'
import { t } from '@/i18n/runtime'
import { onekvm } from '@/lib/onekvm'
import { qualityTier } from '@/lib/video-quality'
import {
  clearQpOverride,
  hasQpOverride,
  matchingQpPreset,
  qpPresets,
  setQpPreset,
  type QpPresetKey,
} from '@/lib/video-qp'

const props = defineProps<{
  show: boolean
  mouseMode: MouseMode
  scrollInterval: number
  mouseReportRate: number
}>()

const emit = defineEmits<{
  'update:show': [show: boolean]
  'update:mouseMode': [mode: MouseMode]
  'update:scrollInterval': [interval: number]
  'update:mouseReportRate': [rate: number]
  advanced: []
}>()

const dialog = useDialog()
const message = useMessage()
const config = ref<OneKVMConfig | null>(null)
const schema = ref<ConfigSchema | null>(null)
const loading = ref(false)
const saving = ref(false)
const advancedPending = ref(false)

const resolutionOptions = computed(() => [
  { label: t('screen.auto', 'Automatic'), value: 0 },
  { label: '1920 x 1080', value: 1080 },
  { label: '1280 x 720', value: 720 },
  { label: '854 x 480', value: 480 },
])
const allCodecOptions = computed(() => [
  { label: t('screen.auto', 'Automatic'), value: 'auto' },
  { label: 'H.264', value: 'h264' },
  { label: 'H.265', value: 'h265' },
  { label: 'MJPEG', value: 'mjpeg' },
])
const codecOptions = computed(() => {
  const supported = schema.value?.video_codecs || []
  return supported.length
    ? allCodecOptions.value.filter((option) => supported.includes(option.value))
    : allCodecOptions.value
})
const fpsOptions = [10, 15, 24, 30, 45, 60].map((value) => ({
  label: `${value} FPS`,
  value,
}))
function qualityTierLabel(value: number) {
  const tier = qualityTier(value)
  return t(tier.key, tier.fallback)
}
const qualityOptions = computed(() => {
  const options: Array<{ label: string; value: number | 'custom' }> = Array.from({ length: 10 }, (_, index) => {
    const value = (index + 1) * 10
    return { label: `${value}% · ${qualityTierLabel(value)}`, value }
  })
  options.push({ label: t('screen.qualityCustom', 'Custom'), value: 'custom' })
  return options
})
const mouseModeOptions = computed(() => [
  { label: t('mouse.absolute', 'Absolute'), value: 'absolute' },
  { label: t('mouse.relative', 'Relative'), value: 'relative' },
])
type MouseReportRateSelection = 60 | 100 | 125 | 'custom'
const mouseModeDraft = ref<MouseMode>('absolute')
const scrollIntervalDraft = ref(0)
const mouseReportRateDraft = ref(60)
const mouseReportRateOptions = computed(() => [
  { label: '60 Hz', value: 60 },
  { label: '100 Hz', value: 100 },
  { label: '125 Hz', value: 125 },
  { label: t('settings.mouse.reportRateCustom', 'Custom'), value: 'custom' },
])
const mouseReportRateSelection = computed<MouseReportRateSelection>({
  get: () => [60, 100, 125].includes(mouseReportRateDraft.value)
    ? mouseReportRateDraft.value as 60 | 100 | 125
    : 'custom',
  set: (value) => {
    if (value !== 'custom') mouseReportRateDraft.value = value
  },
})
const highMouseReportRate = computed(() => mouseReportRateDraft.value > 200)
const qualityPercent = computed({
  get: () => Math.round((config.value?.video.quality_factor ?? 1) * 100),
  set: (value: number) => {
    if (config.value) {
      config.value.video.quality_factor = value / 100
    }
  },
})
type QualityBudgetSelection = number | 'custom'
const qualityBudgetCustomEnabled = ref(false)
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
const qualityBudgetDisabled = computed(() => {
  const video = config.value?.video
  return !!video && video.codec !== 'mjpeg' && (video.bitrate_kbps ?? 0) > 0
})
const qualityBudgetLabel = computed(() => config.value?.video.codec === 'mjpeg'
  ? t('settings.advancedSettings.displayPage.jpegQuality', 'JPEG quality')
  : t('settings.advancedSettings.displayPage.quality', 'Quality budget (Bitrate)'))
const qualityBudgetHint = computed(() => config.value?.video.codec === 'mjpeg'
  ? t('settings.advancedSettings.displayPage.jpegQualityHint', 'Controls JPEG compression quality; higher values retain more detail and use more bandwidth.')
  : t('settings.advancedSettings.displayPage.qualityPercentHint', 'VBR bitrate budget'))
type SimpleQpSelection = 'auto' | QpPresetKey | 'custom'
const simpleQpOptions = computed(() => [
  {
    label: t('settings.advancedSettings.displayPage.qpAutomatic', 'Automatic'),
    value: 'auto',
  },
  ...qpPresets.map((preset) => ({
    label: t(preset.labelKey, preset.labelFallback),
    value: preset.value,
  })),
  {
    label: t('settings.advancedSettings.displayPage.qpCustomAdvanced', 'Custom (Advanced settings)'),
    value: 'custom',
    disabled: true,
  },
])
const simpleQpSelection = computed<SimpleQpSelection>({
  get: () => {
    const video = config.value?.video
    if (!video || !hasQpOverride(video)) return 'auto'
    return matchingQpPreset(video)?.value ?? 'custom'
  },
  set: (selection) => {
    const video = config.value?.video
    if (!video || selection === 'custom') return
    if (selection === 'auto') {
      clearQpOverride(video)
      return
    }
    video.bitrate_kbps = 0
    setQpPreset(video, selection)
  },
})
const simpleQpDescription = computed(() => {
  const selection = simpleQpSelection.value
  if (selection === 'auto') {
    return t(
      'settings.advancedSettings.displayPage.qpAutomaticHint',
      'Does not override QP; the device backend controls it automatically.',
    )
  }
  if (selection === 'custom') {
    return t(
      'settings.advancedSettings.displayPage.qpCustomSimpleHint',
      'Custom QP values are active. Open Advanced settings to edit them.',
    )
  }
  const preset = qpPresets.find((candidate) => candidate.value === selection)
  return preset ? t(preset.descriptionKey, preset.descriptionFallback) : ''
})

async function loadDisplay() {
  loading.value = true
  try {
    const [loadedConfig, loadedSchema] = await Promise.all([api.getConfig(), api.getConfigSchema()])
    loadedConfig.video.frame_detect ??= false
    loadedConfig.video.bitrate_kbps ??= 0
    loadedConfig.video.initial_qp ??= 0
    loadedConfig.video.min_qp ??= 0
    loadedConfig.video.max_qp ??= 0
    qualityBudgetCustomEnabled.value = Math.round(loadedConfig.video.quality_factor * 100) % 10 !== 0
    config.value = loadedConfig
    schema.value = loadedSchema
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : String(reason))
  } finally {
    loading.value = false
  }
}

async function saveDisplay() {
  if (!config.value) return
  saving.value = true
  try {
    await api.saveConfig(config.value)
    await onekvm.reconnect()
    message.success(t('settings.success', 'Settings saved'))
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : String(reason))
  } finally {
    saving.value = false
  }
}

function confirmAdvancedSettings() {
  dialog.warning({
    title: t('settings.advancedSettings.confirmTitle', 'Open advanced settings?'),
    content: t(
      'settings.advancedSettings.sessionWarning',
      'Opening advanced settings will interrupt the current remote-control session. It will reconnect after you return.',
    ),
    positiveText: t('settings.advancedSettings.continue', 'Continue'),
    negativeText: t('common.cancel', 'Cancel'),
    onPositiveClick: () => {
      advancedPending.value = true
      emit('update:show', false)
    },
  })
}

function finishDrawerLeave() {
  if (!advancedPending.value) return
  advancedPending.value = false
  emit('advanced')
}

function resetMouseDraft() {
  mouseModeDraft.value = props.mouseMode
  scrollIntervalDraft.value = props.scrollInterval
  mouseReportRateDraft.value = props.mouseReportRate
}

function updateMouseReportRate(value: number | null) {
  if (value === null || !Number.isFinite(value)) return
  mouseReportRateDraft.value = Math.max(1, Math.min(1000, Math.round(value)))
}

function saveMouse() {
  emit('update:mouseMode', mouseModeDraft.value)
  emit('update:scrollInterval', scrollIntervalDraft.value)
  emit('update:mouseReportRate', mouseReportRateDraft.value)
  message.success(t('settings.mouse.saved', 'Mouse settings saved'))
}

watch(() => props.show, (show) => {
  if (show) {
    resetMouseDraft()
    void loadDisplay()
  }
})
</script>

<template>
  <n-drawer
    :show="show"
    placement="right"
    :width="420"
    @update:show="emit('update:show', $event)"
    @after-leave="finishDrawerLeave"
  >
    <n-drawer-content :title="t('settings.simpleSettings.title', 'Simple settings')" closable>
      <n-button block secondary class="advanced-settings-entry" @click="confirmAdvancedSettings">
        <template #icon><SlidersHorizontal /></template>
        {{ t('settings.advancedSettings.title', 'Advanced settings') }}
      </n-button>

      <section class="simple-settings-section">
        <h3>{{ t('screen.title', 'Screen') }}</h3>
        <n-spin :show="loading">
          <n-form v-if="config" label-placement="top" :show-feedback="false" class="settings-form">
            <div class="simple-settings-grid">
              <n-form-item :label="t('settings.advancedSettings.displayPage.outputResolution', 'Output resolution')">
                <div class="display-setting-stack">
                  <n-select v-model:value="config.video.resolution" :options="resolutionOptions" />
                  <span class="display-setting-field-hint">
                    {{ t('settings.advancedSettings.displayPage.outputResolutionHint', 'Sets the target pipeline output sent to the encoder and stream. It does not change the actual HDMI input resolution; Automatic uses the device backend default.') }}
                  </span>
                </div>
              </n-form-item>
              <n-form-item :label="t('screen.codec', 'Codec')">
                <n-select v-model:value="config.video.codec" :options="codecOptions" />
              </n-form-item>
            </div>

            <n-form-item :label="t('screen.targetFps', 'Target FPS')">
              <n-select v-model:value="config.video.fps" :options="fpsOptions" />
            </n-form-item>

            <n-form-item :label="qualityBudgetLabel">
              <div class="display-setting-stack">
                <n-select v-model:value="qualityBudgetSelection" :options="qualityOptions" :disabled="qualityBudgetDisabled" />
                <div v-if="qualityBudgetCustomEnabled" class="quality-custom-field">
                  <n-slider v-model:value="qualityPercent" :min="1" :max="100" :step="1" :disabled="qualityBudgetDisabled" />
                  <n-input-number v-model:value="qualityPercent" :min="1" :max="100" :step="1" :disabled="qualityBudgetDisabled">
                    <template #suffix>%</template>
                  </n-input-number>
                </div>
                <span v-if="qualityBudgetDisabled" class="display-setting-field-hint">
                  {{ t('settings.advancedSettings.displayPage.simpleQualityDisabledHint', 'Quality budget is replaced by the custom bitrate ceiling. Disable custom bitrate in Advanced settings to change it.') }}
                </span>
                <span v-else class="display-setting-field-hint">
                  {{ qualityBudgetHint }}
                </span>
              </div>
            </n-form-item>

            <n-form-item v-if="config.video.codec !== 'mjpeg'" :label="t('settings.advancedSettings.displayPage.qpPreset', 'Picture preset')">
              <div class="display-setting-stack">
                <n-select v-model:value="simpleQpSelection" :options="simpleQpOptions" />
                <span class="display-setting-field-hint">{{ simpleQpDescription }}</span>
              </div>
            </n-form-item>

            <n-form-item v-if="config.video.codec === 'mjpeg'" :label="t('screen.frameDetect', 'Frame Detect')">
              <div class="frame-detect-setting">
                <n-switch v-model:value="config.video.frame_detect" />
                <span>{{ t('screen.frameDetectTip', 'Pause transmission while the image is still and resume when it changes.') }}</span>
              </div>
            </n-form-item>
          </n-form>
        </n-spin>
        <footer class="simple-settings-actions">
          <n-button :disabled="!config || loading" @click="loadDisplay">
            {{ t('common.refresh', 'Reload') }}
          </n-button>
          <n-button type="primary" :loading="saving" :disabled="!config || loading" @click="saveDisplay">
            <template #icon><Save /></template>
            {{ t('common.save', 'Save') }}
          </n-button>
        </footer>
      </section>

      <n-divider />

      <section class="simple-settings-section">
        <h3>{{ t('mouse.title', 'Mouse') }}</h3>
        <n-form label-placement="top" :show-feedback="false" class="settings-form">
          <n-form-item :label="t('mouse.mode', 'Mouse mode')">
            <n-select
              v-model:value="mouseModeDraft"
              :options="mouseModeOptions"
            />
          </n-form-item>
          <n-form-item :label="t('settings.mouse.scroll', 'Scroll interval')">
            <div class="slider-field">
              <n-slider
                v-model:value="scrollIntervalDraft"
                :min="0"
                :max="150"
                :step="10"
              />
              <n-input-number
                v-model:value="scrollIntervalDraft"
                :min="0"
                :max="150"
                :step="10"
                size="small"
              >
                <template #suffix>ms</template>
              </n-input-number>
            </div>
          </n-form-item>
          <n-form-item :label="t('settings.mouse.reportRate', 'Report rate')">
            <div class="display-setting-stack">
              <n-select v-model:value="mouseReportRateSelection" :options="mouseReportRateOptions" />
              <n-input-number
                v-if="mouseReportRateSelection === 'custom'"
                :value="mouseReportRateDraft"
                :min="1"
                :max="1000"
                :step="1"
                @update:value="updateMouseReportRate"
              >
                <template #suffix>Hz</template>
              </n-input-number>
              <span class="display-setting-field-hint">
                {{ t('settings.mouse.reportRateHint', 'Limits how often pointer movement reports are sent. The default is 60 Hz.') }}
              </span>
              <n-alert v-if="highMouseReportRate" type="warning" :show-icon="true">
                {{ t('settings.mouse.reportRateWarning', 'Rates above 200 Hz may noticeably increase browser and device CPU usage.') }}
              </n-alert>
            </div>
          </n-form-item>
        </n-form>
        <footer class="simple-settings-actions">
          <n-button @click="resetMouseDraft">
            {{ t('common.refresh', 'Reload') }}
          </n-button>
          <n-button type="primary" @click="saveMouse">
            <template #icon><Save /></template>
            {{ t('common.save', 'Save') }}
          </n-button>
        </footer>
      </section>
    </n-drawer-content>
  </n-drawer>
</template>

<style scoped>
.simple-settings-section { display: grid; gap: 12px; }
.simple-settings-section > h3 { margin: 0; font-size: 14px; }
.settings-form { display: grid; gap: 14px; }
.simple-settings-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; }
.simple-settings-actions { display: flex; justify-content: flex-end; gap: 8px; }
.display-setting-stack { display: grid; width: 100%; gap: 7px; }
.quality-custom-field { display: grid; grid-template-columns: minmax(0, 1fr) 108px; align-items: center; gap: 12px; width: 100%; }
.display-setting-field-hint { display: block; color: #87919b; font-size: 12px; line-height: 1.6; }
.frame-detect-setting { display: grid; grid-template-columns: minmax(0, 1fr); justify-items: start; gap: 7px; width: 100%; color: #87919b; font-size: 12px; }
.frame-detect-setting span { display: block; width: 100%; line-height: 1.6; }
@media (max-width: 440px) {
  .slider-field { grid-template-columns: minmax(100px, 1fr) 108px; gap: 10px; }
}
</style>
