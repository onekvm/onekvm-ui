<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDialog, useMessage, type SelectOption } from 'naive-ui'

import { api, APIError, type ConfigSchema, type EDIDStatus, type OneKVMConfig } from '@/api/client'
import { t } from '@/i18n/runtime'
import {
  edidCurrentSummary,
  edidRequiresRestart,
  edidSelectOptions,
  parseEdidSelection,
} from '@/lib/edid'
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
const dialog = useDialog()
const popoverOpen = ref(false)
const menuOpen = ref(false)
const saving = ref(false)
const resolution = ref(props.videoResolution)
const fps = ref(props.targetFps)
const video = ref<OneKVMConfig['video'] | null>(null)
const schema = ref<ConfigSchema | null>(null)
const edid = ref<EDIDStatus | null>(null)
const edidSelection = ref('')
const edidBusy = ref(false)

watch(() => props.videoResolution, (value) => { resolution.value = value })
watch(() => props.targetFps, (value) => { fps.value = value })

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
const fpsOptions = [10, 15, 24, 30, 45, 60, 120].map((value) => ({
  label: `${value} FPS`,
  value,
}))
const videoDisabled = computed(() => !props.canChangeVideo || saving.value)
const edidOptions = computed(() => edidSelectOptions(edid.value, {
  factory: t('settings.advancedSettings.displayPage.edidFactory', 'Factory'),
  presets: t('settings.advancedSettings.displayPage.edidMachinePresets', 'Machine presets'),
  custom: t('settings.advancedSettings.displayPage.edidCustomFiles', 'Custom files'),
}))
const edidDisabled = computed(() => saving.value || edidBusy.value || !edid.value?.writable)
const edidPlaceholder = computed(() => edidCurrentSummary(
  edid.value,
  t('settings.advancedSettings.displayPage.edidSelect', 'Choose a machine preset or a custom file'),
))
const edidRestartHint = computed(() => {
  if (edid.value?.apply_policy === 'power_cycle') {
    return t('screen.edidPowerCycleHint', 'This board cannot hotplug HDMI. Applying EDID requires a power cycle.')
  }
  if (edidRequiresRestart(edid.value?.apply_policy) || edid.value?.hotplug === false) {
    return t('screen.edidRebootHint', 'This board cannot hotplug HDMI. Applying EDID requires a restart.')
  }
  return ''
})

function qualityTierLabel(value: number) {
  const tier = qualityTier(value)
  return t(tier.key, tier.fallback)
}
const qualityPercent = computed({
  get: () => Math.round((video.value?.quality_factor ?? 1) * 100),
  set: (value: number) => {
    if (video.value) video.value.quality_factor = value / 100
  },
})
const qualityOptions = computed(() => {
  const options: Array<{ label: string; value: number | 'custom' }> = Array.from({ length: 10 }, (_, index) => {
    const value = (index + 1) * 10
    return { label: `${value}% · ${qualityTierLabel(value)}`, value }
  })
  options.push({ label: t('screen.qualityCustom', 'Custom'), value: 'custom' })
  return options
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
  const current = video.value
  return !!current && current.codec !== 'mjpeg' && (current.bitrate_kbps ?? 0) > 0
})
const qualityBudgetLabel = computed(() => video.value?.codec === 'mjpeg'
  ? t('settings.advancedSettings.displayPage.jpegQuality', 'JPEG quality')
  : t('screen.bitrate', 'Bitrate'))
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
    const current = video.value
    if (!current || !hasQpOverride(current)) return 'auto'
    return matchingQpPreset(current)?.value ?? 'custom'
  },
  set: (selection) => {
    const current = video.value
    if (!current || selection === 'custom') return
    if (selection === 'auto') {
      clearQpOverride(current)
      return
    }
    current.bitrate_kbps = 0
    setQpPreset(current, selection)
  },
})

const selectProps = {
  class: 'display-status-select',
  size: 'tiny' as const,
  menuSize: 'tiny' as const,
  consistentMenuWidth: false,
  showCheckmark: false,
  to: '.console-workspace',
  menuProps: { class: 'display-fit-select-menu' },
}

function renderQualityLabel(option: SelectOption, selected: boolean) {
  if (option.value === 'custom') return t('screen.qualityCustom', 'Custom')
  if (typeof option.value !== 'number') return String(option.label ?? '')
  const name = qualityTierLabel(option.value)
  return selected ? name : `${option.value}% · ${name}`
}

function updateShow(show: boolean) {
  if (!show && menuOpen.value) return
  popoverOpen.value = show
  emit('update:show', show)
}

async function loadVideo() {
  try {
    const [loadedConfig, loadedSchema, loadedEdid] = await Promise.all([
      api.getConfig(),
      api.getConfigSchema(),
      api.getVideoEDID().catch((error) => {
        if (error instanceof APIError && error.status === 404) return null
        throw error
      }),
    ])
    loadedConfig.video.frame_detect ??= false
    loadedConfig.video.bitrate_kbps ??= 0
    loadedConfig.video.initial_qp ??= 0
    loadedConfig.video.min_qp ??= 0
    loadedConfig.video.max_qp ??= 0
    qualityBudgetCustomEnabled.value = Math.round(loadedConfig.video.quality_factor * 100) % 10 !== 0
    video.value = loadedConfig.video
    schema.value = loadedSchema
    resolution.value = loadedConfig.video.resolution
    fps.value = loadedConfig.video.fps
    edid.value = loadedEdid?.supported ? loadedEdid : null
    if (!edid.value) edidSelection.value = ''
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : String(reason))
  }
}

async function confirmEdidApply(required: string) {
  if (required === 'reboot' || required === 'power_cycle') {
    dialog.warning({
      title: t('settings.advancedSettings.displayPage.edidRebootTitle', 'Restart required'),
      content: required === 'power_cycle'
        ? t('settings.advancedSettings.displayPage.edidPowerCycle', 'Power-cycle the device to advertise the new EDID.')
        : t('settings.advancedSettings.displayPage.edidReboot', 'Restart the device to advertise the new EDID to the host.'),
      positiveText: t('settings.advancedSettings.displayPage.edidRebootNow', 'Restart now'),
      negativeText: t('common.later', 'Later'),
      onPositiveClick: () => api.rebootSystem().catch((error: unknown) => {
        message.error(error instanceof APIError ? error.message : String(error))
      }),
    })
    return
  }
  message.success(t('settings.advancedSettings.displayPage.edidHotplug', 'EDID updated. Re-detect the display on the controlled host.'))
}

async function updateEdid(value: string | number | null) {
  if (typeof value !== 'string' || value === edidSelection.value) return
  const ref = parseEdidSelection(value)
  if (!ref || !edid.value?.writable || edidDisabled.value) return
  const previous = edidSelection.value
  edidSelection.value = value
  edidBusy.value = true
  try {
    const result = await api.applyVideoEDID({ library: ref })
    await confirmEdidApply(result.apply_required)
    edid.value = await api.getVideoEDID()
  } catch (reason) {
    edidSelection.value = previous
    message.error(reason instanceof APIError ? reason.message : String(reason))
  } finally {
    edidBusy.value = false
  }
}

async function patchVideo(
  entries: Array<[string, string | number | boolean]> | string,
  value?: string | number | boolean,
  reconnect = false,
) {
  if (!props.canChangeVideo || saving.value) return
  const updates: Array<[string, string | number | boolean]> = typeof entries === 'string'
    ? [[entries, value ?? '']]
    : entries
  saving.value = true
  try {
    for (const [key, next] of updates) {
      await api.patchConfig(key, String(next), onekvm.sessionID())
    }
    if (reconnect) await onekvm.reconnect()
  } catch (reason) {
    resolution.value = props.videoResolution
    fps.value = props.targetFps
    await loadVideo()
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
  if (typeof value !== 'number' || !isVideoResolutionValue(value)) return
  if (value === resolution.value) return
  resolution.value = value
  if (video.value) video.value.resolution = value
  void patchVideo('video.resolution', value, true)
}

function updateFps(value: string | number | null) {
  if (typeof value !== 'number' || value < 1) return
  if (value === fps.value) return
  fps.value = value
  if (video.value) video.value.fps = value
  void patchVideo('video.fps', value)
}

function updateCodec(value: string | number | null) {
  if (!video.value || typeof value !== 'string' || value === video.value.codec) return
  video.value.codec = value
  void patchVideo('video.codec', value, true)
}

function updateQualityBudget(value: string | number | null) {
  if (value !== 'custom' && (typeof value !== 'number' || value < 1 || value > 100)) return
  const previous = qualityBudgetSelection.value
  qualityBudgetSelection.value = value
  if (value === 'custom' || value === previous) return
  void patchVideo('video.quality_factor', value / 100)
}

function updateCustomQuality(value: number | null) {
  if (value === null || !Number.isFinite(value)) return
  const percent = Math.max(1, Math.min(100, Math.round(value)))
  if (percent === qualityPercent.value) return
  qualityPercent.value = percent
  void patchVideo('video.quality_factor', percent / 100)
}

function updateQpPreset(value: string | number | null) {
  if (!video.value) return
  if (value !== 'auto' && value !== 'custom' && !qpPresets.some((preset) => preset.value === value)) return
  if (value === simpleQpSelection.value) return
  simpleQpSelection.value = value as SimpleQpSelection
  void patchVideo([
    ['video.bitrate_kbps', video.value.bitrate_kbps ?? 0],
    ['video.initial_qp', video.value.initial_qp ?? 0],
    ['video.min_qp', video.value.min_qp ?? 0],
    ['video.max_qp', video.value.max_qp ?? 0],
  ])
}

function updateFrameDetect(value: boolean) {
  if (!video.value || video.value.frame_detect === value) return
  video.value.frame_detect = value
  void patchVideo('video.frame_detect', value)
}

watch(popoverOpen, (open) => {
  if (open) void loadVideo()
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
      <n-alert v-if="!canChangeVideo" type="info" :bordered="false" :show-icon="false">
        {{ t('screen.sharedStream', 'Shared from the primary WebRTC client') }}
      </n-alert>
      <div class="display-status-values">
        <div>
          <span>{{ t('screen.fitMode', 'Display mode') }}</span>
          <n-select
            v-bind="selectProps"
            :value="videoFit"
            :options="fitOptions"
            @update:value="updateFit"
            @update:show="menuOpen = $event"
          />
        </div>
        <div>
          <span>{{ t('screen.targetResolution', 'Target resolution') }}</span>
          <n-select
            v-bind="selectProps"
            :value="resolution"
            :options="resolutionOptions"
            :disabled="videoDisabled"
            @update:value="updateResolution"
            @update:show="menuOpen = $event"
          />
        </div>
        <div>
          <span>{{ t('screen.targetFps', 'Target FPS') }}</span>
          <n-select
            v-bind="selectProps"
            :value="fps"
            :options="fpsOptions"
            :disabled="videoDisabled"
            @update:value="updateFps"
            @update:show="menuOpen = $event"
          />
        </div>
        <div>
          <span>{{ t('screen.codec', 'Codec') }}</span>
          <n-select
            v-bind="selectProps"
            :value="video?.codec"
            :options="codecOptions"
            :disabled="videoDisabled || !video"
            @update:value="updateCodec"
            @update:show="menuOpen = $event"
          />
        </div>
        <div v-if="edid">
          <span>{{ t('screen.edid', 'EDID') }}</span>
          <n-select
            v-bind="selectProps"
            :value="edidSelection || null"
            :options="edidOptions"
            :placeholder="edidPlaceholder"
            :disabled="edidDisabled"
            @update:value="updateEdid"
            @update:show="menuOpen = $event"
          />
        </div>
        <p v-if="edid && edidRestartHint" class="display-edid-hint">{{ edidRestartHint }}</p>
        <div>
          <span>{{ qualityBudgetLabel }}</span>
          <n-select
            v-bind="selectProps"
            :value="qualityBudgetSelection"
            :options="qualityOptions"
            :disabled="videoDisabled || !video || qualityBudgetDisabled"
            :render-label="renderQualityLabel"
            @update:value="updateQualityBudget"
            @update:show="menuOpen = $event"
          />
        </div>
        <div v-if="qualityBudgetCustomEnabled">
          <span>{{ t('screen.qualityCustom', 'Custom') }}</span>
          <n-input-number
            class="display-status-select"
            size="tiny"
            :value="qualityPercent"
            :min="1"
            :max="100"
            :step="1"
            :disabled="videoDisabled || !video || qualityBudgetDisabled"
            @update:value="updateCustomQuality"
          >
            <template #suffix>%</template>
          </n-input-number>
        </div>
        <div v-if="video && video.codec !== 'mjpeg'">
          <span>{{ t('settings.advancedSettings.displayPage.qpPreset', 'Picture preset') }}</span>
          <n-select
            v-bind="selectProps"
            :value="simpleQpSelection"
            :options="simpleQpOptions"
            :disabled="videoDisabled"
            @update:value="updateQpPreset"
            @update:show="menuOpen = $event"
          />
        </div>
        <div v-else-if="video">
          <span>{{ t('screen.frameDetect', 'Frame Detect') }}</span>
          <n-switch
            size="small"
            :value="video.frame_detect"
            :disabled="videoDisabled"
            @update:value="updateFrameDetect"
          />
        </div>
      </div>
    </div>
  </n-popover>
</template>
