<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import type { OneKVMConfig } from '@/api/client'
import { useVideoCodecSupport } from '@/composables/useVideoCodecSupport'
import { useTransport } from '@/composables/useTransport'
import { t } from '@/i18n/runtime'
import { qualityTier } from '@/lib/video-quality'
import { videoResolutionOptions } from '@/lib/video-resolution'
import { parseVideoTransport, VIDEO_TRANSPORT_KEY } from '@/lib/video-transport'
import {
  clearQpOverride,
  hasQpOverride,
  matchingQpPreset,
  qpPresets,
  setQpPreset,
  type QpPresetKey,
} from '@/lib/video-qp'
import DisplaySettingHelp from './DisplaySettingHelp.vue'
import EdidSettingsPanel from './EdidSettingsPanel.vue'
import SettingsPanel from './SettingsPanel.vue'
import VideoBitrateControl from './VideoBitrateControl.vue'

const props = defineProps<{
  disabled?: boolean
  readOnly?: string[]
  videoCodecs?: string[]
  videoBitrateRange?: { minimum: number; maximum: number; step: number; default: number }
}>()

const video = defineModel<OneKVMConfig['video']>({ required: true })
const { state } = useTransport()
const { allCodecOptions } = useVideoCodecSupport(() => state.value.videoMode === 'mjpeg'
  ? parseVideoTransport(localStorage.getItem(VIDEO_TRANSPORT_KEY))
  : state.value.videoMode)

type QpPresetMode = 'auto' | QpPresetKey | 'custom'

const resolutionOptions = computed(() =>
  videoResolutionOptions(t('screen.auto', 'Automatic')),
)
const codecOptions = computed(() => {
  const supported = props.videoCodecs || []
  return supported.length
    ? allCodecOptions.value.filter((option) => supported.includes(option.value))
    : allCodecOptions.value
})

function updateCodec(value: string | number | null) {
  const option = codecOptions.value.find((option) => option.value === value)
  if (props.disabled || !option || option.disabled) return
  video.value.codec = option.value
}
const fpsOptions = computed(() => [
  { label: t('screen.auto', 'Automatic'), value: 0 },
  ...[10, 15, 24, 30, 45, 60, 120].map((value) => ({
    label: `${value} FPS`,
    value,
  })),
])
const qualityPercent = computed({
  get: () => Math.round(video.value.quality_factor * 100),
  set: (value: number) => { video.value.quality_factor = value / 100 },
})
const qualityDescription = computed(() => {
  const tier = qualityTier(qualityPercent.value)
  return t(tier.key, tier.fallback)
})
type QualityBudgetSelection = number | 'custom'
const qualityBudgetCustomEnabled = ref(qualityPercent.value % 10 !== 0)
const qualityBudgetOptions = computed(() => [
  ...Array.from({ length: 10 }, (_, index) => {
    const value = (index + 1) * 10
    const tier = qualityTier(value)
    return { label: `${value}% · ${t(tier.key, tier.fallback)}`, value }
  }),
  { label: t('screen.qualityCustom', 'Custom'), value: 'custom' },
])
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

function hasCustomQp(value: OneKVMConfig['video']) {
  return hasQpOverride(value.h26x)
}

// Bitrate-constrained VBR must be free to raise QP when the frame is too
// complex. Prefer the bitrate mode when loading an older configuration that
// enabled both overrides; the next save persists the unambiguous form.
if ((video.value.h26x.bitrate_kbps ?? 0) > 0 && hasCustomQp(video.value)) {
  video.value.h26x.initial_qp = 0
  video.value.h26x.min_qp = 0
  video.value.h26x.max_qp = 0
}

const qpPresetMode = ref<QpPresetMode>(
  hasCustomQp(video.value) ? (matchingQpPreset(video.value.h26x)?.value ?? 'custom') : 'balanced',
)
const qualityBudgetLabel = computed(() => video.value.codec === 'mjpeg'
  ? t('settings.advancedSettings.displayPage.jpegQuality', 'JPEG quality')
  : t('screen.bitrateBudget', 'Bitrate budget ceiling'))
const qualityBudgetHint = computed(() => video.value.codec === 'mjpeg'
  ? t('settings.advancedSettings.displayPage.jpegQualityHint', 'Controls JPEG compression quality; higher values retain more detail and use more bandwidth.')
  : t('screen.bitrateHelp'))
const qpPresetOptions = computed(() => [
  ...qpPresets.map((preset) => ({
    label: t(preset.labelKey, preset.labelFallback),
    value: preset.value,
  })),
  {
    label: t('settings.advancedSettings.displayPage.qpCustom', 'Custom parameters'),
    value: 'custom',
  },
])
const qpPresetDescription = computed(() => {
  if (qpPresetMode.value === 'auto') {
    return t(
      'settings.advancedSettings.displayPage.qpAutomaticHint',
      'Uses the device default picture parameters.',
    )
  }
  const preset = qpPresets.find((candidate) => candidate.value === qpPresetMode.value)
  if (!preset) {
    return t(
      'settings.advancedSettings.displayPage.qpCustomHint',
      'Set advanced picture parameters manually.',
    )
  }
  return t(preset.descriptionKey, preset.descriptionFallback)
})

function applyQpPreset(value: QpPresetMode) {
  qpPresetMode.value = value
  if (value === 'auto') {
    clearQpOverride(video.value.h26x)
    // Automatic is an internal state used while enabling a bitrate ceiling;
    // keep the user-facing selector on the balanced preset.
    qpPresetMode.value = 'balanced'
    return
  }
  // Return to the automatic bitrate budget when selecting picture parameters.
  video.value.h26x.bitrate_kbps = 0
  if (value === 'custom') {
    if (!hasCustomQp(video.value)) setQpPreset(video.value.h26x, 'balanced')
    return
  }
  setQpPreset(video.value.h26x, value)
}

watch(video, (value) => {
  if ((value.h26x.bitrate_kbps ?? 0) > 0 && hasCustomQp(value)) {
    value.h26x.initial_qp = 0
    value.h26x.min_qp = 0
    value.h26x.max_qp = 0
  }
  qualityBudgetCustomEnabled.value = Math.round(value.quality_factor * 100) % 10 !== 0
  qpPresetMode.value = hasCustomQp(value)
    ? (matchingQpPreset(value.h26x)?.value ?? 'custom')
    : 'balanced'
})

function fieldReadOnly(path: string) {
  return props.readOnly?.includes(path) ?? false
}

function setBitrateBudget(value: number) {
  video.value.h26x.bitrate_kbps = value
  if (value > 0) applyQpPreset('auto')
}
</script>

<template>
  <n-form label-placement="top" :show-feedback="false" class="display-settings-form">
    <SettingsPanel
      :title="t('settings.advancedSettings.displayPage.outputGroup', 'Video output')"
      :description="t('settings.advancedSettings.displayPage.outputGroupHint', 'Format, resolution, and frame rate sent to viewers.')"
    >
      <div class="display-settings-fields display-output-fields">
        <n-form-item :label="t('screen.codec', 'Codec')">
          <n-select :value="video.codec" :options="codecOptions" :disabled="disabled" @update:value="updateCodec" />
        </n-form-item>
        <n-form-item :label="t('settings.advancedSettings.displayPage.outputResolution', 'Output resolution')">
          <div class="display-setting-stack">
            <n-select v-model:value="video.resolution" :options="resolutionOptions" :disabled="disabled" />
            <span class="display-setting-field-hint">{{ t('settings.advancedSettings.displayPage.outputResolutionHint', 'Automatic follows the HDMI input; select a size to scale the stream.') }}</span>
          </div>
        </n-form-item>
        <n-form-item :label="t('screen.targetFps', 'Target FPS')">
          <div class="display-setting-stack">
            <n-select v-model:value="video.fps" :options="fpsOptions" :disabled="disabled" />
            <span class="display-setting-field-hint">{{ t('settings.advancedSettings.displayPage.fpsHint', 'Automatic follows the input; a fixed value limits the frame rate.') }}</span>
          </div>
        </n-form-item>
      </div>
    </SettingsPanel>

    <SettingsPanel
      :title="t('settings.advancedSettings.displayPage.encodingGroup', 'Quality and bandwidth')"
      :description="t('settings.advancedSettings.displayPage.encodingGroupHint', 'Balance picture detail and bandwidth use.')"
    >
      <div class="display-settings-fields">
        <n-form-item>
          <template #label>
            <span class="display-setting-label">{{ qualityBudgetLabel }}
              <DisplaySettingHelp :label="qualityBudgetLabel" :text="qualityBudgetHint" :active="true" />
            </span>
          </template>
          <div class="display-setting-stack">
            <VideoBitrateControl
              v-if="video.codec !== 'mjpeg'"
              :value="video.h26x.bitrate_kbps"
              :range="videoBitrateRange"
              :disabled="disabled"
              @update:value="setBitrateBudget"
            />
            <n-select v-else v-model:value="qualityBudgetSelection" :options="qualityBudgetOptions" :disabled="disabled" />
            <div v-if="video.codec === 'mjpeg' && qualityBudgetCustomEnabled" class="quality-custom-field">
              <n-slider v-model:value="qualityPercent" :min="1" :max="100" :step="1" :disabled="disabled" />
              <n-input-number v-model:value="qualityPercent" :min="1" :max="100" :step="1" :disabled="disabled">
                <template #suffix>%</template>
              </n-input-number>
            </div>
            <span v-if="video.codec === 'mjpeg'" class="display-setting-field-hint">{{ qualityDescription }}</span>
            <span v-else class="display-setting-field-hint">
              {{ t('settings.advancedSettings.displayPage.bitrateShortHint', 'A soft ceiling; complex scenes may briefly exceed it.') }}
              <template v-if="videoBitrateRange">{{ videoBitrateRange.minimum / 1000 }}–{{ videoBitrateRange.maximum / 1000 }} Mbps</template>
              <template v-else>{{ t('settings.advancedSettings.displayPage.customBitrateUnavailable', 'This device does not report a configurable bitrate range.') }}</template>
            </span>
          </div>
        </n-form-item>
        <n-form-item v-if="video.codec !== 'mjpeg'" :label="t('settings.advancedSettings.displayPage.qpPreset', 'Picture preset')">
          <div class="display-setting-stack">
            <n-select :value="qpPresetMode" :options="qpPresetOptions" :disabled="disabled" @update:value="applyQpPreset" />
            <span class="display-setting-field-hint">{{ qpPresetDescription }}</span>
          </div>
        </n-form-item>
        <n-form-item v-else :label="t('screen.frameDetect', 'Frame Detect')">
          <div class="frame-detect-field">
            <n-switch v-model:value="video.mjpeg.frame_detect" :disabled="disabled" />
            <span>{{ t('screen.frameDetectTip', 'Pause transmission while the image is still and resume when it changes.') }}</span>
          </div>
        </n-form-item>
      </div>
      <div v-if="video.codec !== 'mjpeg' && qpPresetMode === 'custom'" class="display-settings-fields display-qp-fields">
        <n-form-item :label="t('settings.advancedSettings.displayPage.initialQp', 'Initial QP')">
          <n-input-number v-model:value="video.h26x.initial_qp" :min="0" :max="51" :disabled="disabled" />
        </n-form-item>
        <n-form-item :label="t('settings.advancedSettings.displayPage.minQp', 'Minimum QP')">
          <n-input-number v-model:value="video.h26x.min_qp" :min="0" :max="51" :disabled="disabled" />
        </n-form-item>
        <n-form-item :label="t('settings.advancedSettings.displayPage.maxQp', 'Maximum QP')">
          <n-input-number v-model:value="video.h26x.max_qp" :min="0" :max="51" :disabled="disabled" />
        </n-form-item>
        <span class="display-setting-field-hint display-settings-wide">{{ t('settings.advancedSettings.displayPage.qpAutoHint', 'Use 0 to let the device backend choose automatically. Lower QP improves quality and increases bitrate.') }}</span>
      </div>
      <n-collapse class="display-advanced-fields">
        <n-collapse-item name="advanced" :title="t('settings.advancedSettings.displayPage.advancedParameters', 'Advanced parameters')">
          <div class="display-settings-fields">
            <n-form-item v-if="video.codec !== 'mjpeg'" :label="t('settings.advancedSettings.displayPage.gop', 'Keyframe interval')">
              <div class="display-setting-stack">
                <n-input-number v-model:value="video.h26x.gop" :min="0" :max="300" :disabled="disabled">
                  <template #suffix>{{ video.h26x.gop === 0 ? t('screen.auto', 'Automatic') : t('settings.advancedSettings.displayPage.frames', 'frames') }}</template>
                </n-input-number>
                <span class="display-setting-field-hint">{{ t('settings.advancedSettings.displayPage.gopHint', 'Use 0 for a 5 second interval at the target frame rate.') }}</span>
              </div>
            </n-form-item>
            <n-form-item :label="t('settings.advancedSettings.displayPage.sourceDevice', 'Capture device')">
              <n-input v-model:value="video.source_device" :disabled="disabled || fieldReadOnly('video.source_device')" placeholder="/dev/video0" />
            </n-form-item>
          </div>
        </n-collapse-item>
      </n-collapse>
    </SettingsPanel>

    <EdidSettingsPanel :disabled="disabled" />
  </n-form>
</template>

<style scoped>
.display-settings-form { display: grid; gap: 16px; }
.display-settings-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px 20px;
  align-items: start;
}
.display-output-fields, .display-qp-fields { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.display-settings-fields :deep(.n-form-item) { align-self: start; margin-bottom: 0; }
.display-settings-fields :deep(.n-form-item-blank) { flex: none; }
.display-settings-fields :deep(.n-select),
.display-settings-fields :deep(.n-input),
.display-settings-fields :deep(.n-input-number) { width: 100%; }
.display-settings-wide { grid-column: 1 / -1; }
.display-setting-stack { display: grid; width: 100%; gap: 6px; }
.quality-custom-field { display: grid; grid-template-columns: minmax(0, 1fr) 120px; align-items: center; gap: 14px; width: 100%; }
.display-setting-field-hint { display: block; color: var(--muted-foreground); font-size: 12px; line-height: 1.6; }
.display-setting-label { display: inline-flex; align-items: center; gap: 4px; }
.display-advanced-fields { padding-top: 12px; border-top: 1px solid var(--border); }
.display-advanced-fields :deep(.n-collapse-item__header-main) { color: var(--muted-foreground); font-size: 13px; font-weight: 500; }
.custom-encoding-field { display: grid; justify-items: start; gap: 7px; width: 100%; color: var(--muted-foreground); font-size: 12px; }
.custom-encoding-field span { display: block; width: 100%; line-height: 1.6; }
.custom-encoding-field :deep(.n-form-item) { width: 100%; margin: 8px 0 0; }
.custom-encoding-limit { padding-left: 24px; box-sizing: border-box; }
.frame-detect-field { display: grid; grid-template-columns: minmax(0, 1fr); justify-items: start; gap: 7px; width: 100%; min-height: 34px; color: var(--muted-foreground); font-size: 12px; }
.frame-detect-field span { display: block; width: 100%; line-height: 1.6; }

@media (max-width: 760px) {
  .display-settings-fields { grid-template-columns: 1fr; gap: 18px; }
  .display-settings-wide { grid-column: auto; }
  .quality-custom-field { grid-template-columns: 1fr; gap: 10px; }
}
</style>
