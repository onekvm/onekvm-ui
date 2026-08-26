<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Save } from '@lucide/vue'
import { useMessage } from 'naive-ui'

import { api, type ConfigSchema, type OneKVMConfig } from '@/api/client'
import { t } from '@/i18n/runtime'
import { onekvm } from '@/lib/onekvm'
import type { VideoFit } from '@/lib/video-fit'
import { qualityTier } from '@/lib/video-quality'
import { isVideoResolutionValue, videoResolutionOptions } from '@/lib/video-resolution'
import {
  clearQpOverride,
  hasQpOverride,
  matchingQpPreset,
  qpPresets,
  setQpPreset,
  type QpPresetKey,
} from '@/lib/video-qp'

const props = defineProps<{
  videoResolution: number
  targetFps: number
  videoFit: VideoFit
  canChangeVideo: boolean
  placement?: 'top-end' | 'bottom-end' | 'right-start' | 'left-start'
}>()

const emit = defineEmits<{
  'update:show': [show: boolean]
  'update:videoFit': [fit: VideoFit]
}>()

const message = useMessage()
const popoverOpen = ref(false)
const menuOpen = ref(false)
const loading = ref(false)
const saving = ref(false)
const config = ref<OneKVMConfig | null>(null)
const schema = ref<ConfigSchema | null>(null)

const fitOptions = computed(() => [
  { label: t('screen.fitOriginal', 'Original'), value: 'original' as const },
  { label: t('screen.fitStretch', 'Stretch'), value: 'stretch' as const },
])
const resolutionOptions = computed(() =>
  videoResolutionOptions(t('screen.auto', 'Automatic')),
)
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
const videoDisabled = computed(() => !props.canChangeVideo || saving.value || loading.value || !config.value)

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
const qualityPercent = computed({
  get: () => Math.round((config.value?.video.quality_factor ?? 1) * 100),
  set: (value: number) => {
    if (config.value) config.value.video.quality_factor = value / 100
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

function updateShow(show: boolean) {
  if (!show && menuOpen.value) return
  popoverOpen.value = show
  emit('update:show', show)
}

async function loadDisplay() {
  if (!props.canChangeVideo) return
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
  if (!config.value || !props.canChangeVideo || saving.value) return
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

function updateFit(value: string | number | null) {
  if (value !== 'original' && value !== 'stretch') return
  emit('update:videoFit', value)
}

function updateResolution(value: string | number | null) {
  if (!config.value || typeof value !== 'number' || !isVideoResolutionValue(value)) return
  config.value.video.resolution = value
}

function updateFps(value: string | number | null) {
  if (!config.value || typeof value !== 'number' || value < 1) return
  config.value.video.fps = value
}

function updateCodec(value: string | number | null) {
  if (!config.value || typeof value !== 'string') return
  config.value.video.codec = value
}

function updateQualityBudget(value: string | number | null) {
  if (value !== 'custom' && (typeof value !== 'number' || value < 1 || value > 100)) return
  qualityBudgetSelection.value = value
}

function updateQpPreset(value: string | number | null) {
  if (value !== 'auto' && value !== 'custom' && !qpPresets.some((preset) => preset.value === value)) return
  simpleQpSelection.value = value as SimpleQpSelection
}

watch(popoverOpen, (open) => {
  if (open) void loadDisplay()
})
</script>

<template>
  <n-popover
    :show="popoverOpen"
    trigger="click"
    :placement="placement || 'bottom-end'"
    :show-arrow="false"
    class="control-popover display-status-control-popover"
    to=".console-workspace"
    @update:show="updateShow"
  >
    <template #trigger><slot /></template>
    <div class="display-status-popover">
      <header class="control-popover-header">
        <strong>{{ t('settings.screen.title', 'Display') }}</strong>
      </header>
      <n-spin :show="loading">
        <n-form label-placement="top" :show-feedback="false" class="display-popover-form">
          <n-form-item :label="t('screen.fitMode', 'Display mode')">
            <n-select
              size="small"
              :value="videoFit"
              :options="fitOptions"
              :show-checkmark="false"
              to=".console-workspace"
              :menu-props="{ class: 'display-fit-select-menu' }"
              @update:value="updateFit"
              @update:show="menuOpen = $event"
            />
          </n-form-item>
          <n-form-item :label="t('settings.advancedSettings.displayPage.outputResolution', 'Output resolution')">
            <div class="display-setting-stack">
              <n-select
                size="small"
                :value="config?.video.resolution ?? videoResolution"
                :options="resolutionOptions"
                :disabled="videoDisabled"
                :show-checkmark="false"
                to=".console-workspace"
                :menu-props="{ class: 'display-fit-select-menu' }"
                @update:value="updateResolution"
                @update:show="menuOpen = $event"
              />
              <span class="display-setting-field-hint">
                {{ t('settings.advancedSettings.displayPage.outputResolutionHint', 'Sets the pipeline output sent to the encoder and stream. Options match Cube HDMI input modes; Automatic follows the current input.') }}
              </span>
            </div>
          </n-form-item>
          <n-form-item :label="t('screen.codec', 'Codec')">
            <n-select
              size="small"
              :value="config?.video.codec"
              :options="codecOptions"
              :disabled="videoDisabled"
              :show-checkmark="false"
              to=".console-workspace"
              :menu-props="{ class: 'display-fit-select-menu' }"
              @update:value="updateCodec"
              @update:show="menuOpen = $event"
            />
          </n-form-item>
          <n-form-item :label="t('screen.targetFps', 'Target FPS')">
            <n-select
              size="small"
              :value="config?.video.fps ?? targetFps"
              :options="fpsOptions"
              :disabled="videoDisabled"
              :show-checkmark="false"
              to=".console-workspace"
              :menu-props="{ class: 'display-fit-select-menu' }"
              @update:value="updateFps"
              @update:show="menuOpen = $event"
            />
          </n-form-item>
          <n-form-item :label="qualityBudgetLabel">
            <div class="display-setting-stack">
              <n-select
                size="small"
                :value="qualityBudgetSelection"
                :options="qualityOptions"
                :disabled="videoDisabled || qualityBudgetDisabled"
                :show-checkmark="false"
                to=".console-workspace"
                :menu-props="{ class: 'display-fit-select-menu' }"
                @update:value="updateQualityBudget"
                @update:show="menuOpen = $event"
              />
              <div v-if="qualityBudgetCustomEnabled" class="quality-custom-field">
                <n-slider v-model:value="qualityPercent" :min="1" :max="100" :step="1" :disabled="videoDisabled || qualityBudgetDisabled" />
                <n-input-number v-model:value="qualityPercent" :min="1" :max="100" :step="1" :disabled="videoDisabled || qualityBudgetDisabled">
                  <template #suffix>%</template>
                </n-input-number>
              </div>
              <span v-if="qualityBudgetDisabled" class="display-setting-field-hint">
                {{ t('settings.advancedSettings.displayPage.simpleQualityDisabledHint', 'Quality budget is replaced by the custom bitrate ceiling. Disable custom bitrate in Advanced settings to change it.') }}
              </span>
              <span v-else class="display-setting-field-hint">{{ qualityBudgetHint }}</span>
            </div>
          </n-form-item>
          <n-form-item v-if="config && config.video.codec !== 'mjpeg'" :label="t('settings.advancedSettings.displayPage.qpPreset', 'Picture preset')">
            <div class="display-setting-stack">
              <n-select
                size="small"
                :value="simpleQpSelection"
                :options="simpleQpOptions"
                :disabled="videoDisabled"
                :show-checkmark="false"
                to=".console-workspace"
                :menu-props="{ class: 'display-fit-select-menu' }"
                @update:value="updateQpPreset"
                @update:show="menuOpen = $event"
              />
              <span class="display-setting-field-hint">{{ simpleQpDescription }}</span>
            </div>
          </n-form-item>
          <n-form-item v-else-if="config" :label="t('screen.frameDetect', 'Frame Detect')">
            <div class="frame-detect-setting">
              <n-switch v-model:value="config.video.frame_detect" :disabled="videoDisabled" />
              <span>{{ t('screen.frameDetectTip', 'Pause transmission while the image is still and resume when it changes.') }}</span>
            </div>
          </n-form-item>
        </n-form>
        <footer v-if="canChangeVideo" class="display-popover-actions">
          <n-button size="small" :disabled="loading || saving" @click="loadDisplay">
            {{ t('common.refresh', 'Reload') }}
          </n-button>
          <n-button type="primary" size="small" :loading="saving" :disabled="!config || loading" @click="saveDisplay">
            <template #icon><Save /></template>
            {{ t('common.save', 'Save') }}
          </n-button>
        </footer>
      </n-spin>
    </div>
  </n-popover>
</template>

<style scoped>
.display-popover-form { display: grid; gap: 10px; padding-top: 10px; }
.display-popover-form :deep(.n-form-item) { margin: 0; }
.display-popover-form :deep(.n-select),
.display-popover-form :deep(.n-input-number) { width: 100%; }
.display-setting-stack { display: grid; width: 100%; gap: 7px; }
.quality-custom-field { display: grid; grid-template-columns: minmax(0, 1fr) 108px; align-items: center; gap: 12px; width: 100%; }
.display-setting-field-hint { display: block; color: #87919b; font-size: 12px; line-height: 1.6; }
.frame-detect-setting { display: grid; justify-items: start; gap: 7px; width: 100%; color: #87919b; font-size: 12px; }
.frame-detect-setting span { display: block; width: 100%; line-height: 1.6; }
.display-popover-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
</style>
