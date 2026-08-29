<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useDialog, useMessage } from 'naive-ui'

import { api, APIError, type EDIDApplyRequired, type EDIDStatus } from '@/api/client'
import { t } from '@/i18n/runtime'

defineProps<{ disabled?: boolean }>()

const message = useMessage()
const dialog = useDialog()
const status = ref<EDIDStatus | null>(null)
const busy = ref(false)
const selection = ref('')

function machinePresetLabel(id: string) {
  switch (id) {
    case 'factory':
      return t('settings.advancedSettings.displayPage.edidFactory', 'Factory')
    case '1080p60':
      return '1920×1080 @ 60 Hz'
    case '1440p30':
      return '2560×1440 @ 30 Hz'
    case '720p90':
      return '1280×720 @ 90 Hz'
    case '720p120':
      return '1280×720 @ 120 Hz'
    default:
      return id
  }
}

const options = computed(() => {
  const directories = status.value?.directories || []
  const presets = directories.filter((directory) => directory.role === 'preset').flatMap((directory) =>
    directory.files.map((file) => ({
      label: machinePresetLabel(file.id),
      value: `${directory.extension}\0${directory.id}\0${file.id}`,
    })),
  )
  const custom = directories.filter((directory) => directory.role === 'custom').flatMap((directory) =>
    directory.files.map((file) => ({
      label: `${file.id}.edid.bin`,
      value: `${directory.extension}\0${directory.id}\0${file.id}`,
    })),
  )
  const groups = []
  if (presets.length) {
    groups.push({
      type: 'group' as const,
      label: t('settings.advancedSettings.displayPage.edidMachinePresets', 'Machine presets'),
      key: 'machine',
      children: presets,
    })
  }
  if (custom.length) {
    groups.push({
      type: 'group' as const,
      label: t('settings.advancedSettings.displayPage.edidCustomFiles', 'Custom files'),
      key: 'custom',
      children: custom,
    })
  }
  return groups
})

const applyPolicy = computed(() => status.value?.apply_policy || 'none')
const applyPolicyText = computed(() => {
  switch (applyPolicy.value) {
    case 'hotplug':
      return t('settings.advancedSettings.displayPage.edidPolicyHotplug', 'Writes take effect with HDMI hotplug. No reboot.')
    case 'reboot':
      return t('settings.advancedSettings.displayPage.edidPolicyReboot', 'Writes take effect only after restarting this device.')
    case 'power_cycle':
      return t('settings.advancedSettings.displayPage.edidPolicyPowerCycle', 'Writes take effect only after power-cycling this device.')
    default:
      return t('settings.advancedSettings.displayPage.edidPolicyNone', 'Writes take effect immediately.')
  }
})
const applyPolicyType = computed(() => {
  switch (applyPolicy.value) {
    case 'reboot':
    case 'power_cycle':
      return 'warning'
    case 'hotplug':
      return 'info'
    default:
      return 'success'
  }
})

async function reload() {
  status.value = await api.getVideoEDID()
}

async function applySelection() {
  const [extension, directory, id] = selection.value.split('\0')
  if (!extension || !directory || !id) return
  busy.value = true
  try {
    const result = await api.applyVideoEDID({ library: { extension, directory, id } })
    await confirmApply(result.apply_required)
    await reload()
  } catch (error) {
    message.error(error instanceof APIError ? error.message : String(error))
  } finally {
    busy.value = false
  }
}

async function confirmApply(required: EDIDApplyRequired) {
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

onMounted(() => {
  reload().catch((error) => {
    if (!(error instanceof APIError && error.status === 404)) {
      message.error(error instanceof Error ? error.message : String(error))
    }
  })
})
</script>

<template>
  <section v-if="status?.supported" class="edid-settings-panel">
    <h3>{{ t('settings.advancedSettings.displayPage.edid', 'HDMI EDID') }}</h3>
    <p class="display-setting-field-hint">
      {{ t('settings.advancedSettings.displayPage.edidHint', 'Apply a saved EDID file to the HDMI capture chip. Edit files in the EDID Editor plugin.') }}
    </p>
    <p class="display-setting-field-hint">
      {{ status.summary?.preferred
        ? `${status.summary.preferred.width}×${status.summary.preferred.height}@${status.summary.preferred.fps}`
        : t('settings.advancedSettings.displayPage.edidUnknown', 'Current advertised mode is unavailable') }}
    </p>
    <n-alert :type="applyPolicyType" :show-icon="false">
      {{ applyPolicyText }}
    </n-alert>
    <n-select
      v-model:value="selection"
      :options="options"
      :disabled="disabled || busy || !status.writable"
      :placeholder="t('settings.advancedSettings.displayPage.edidSelect', 'Choose a machine preset or a custom file')"
    />
    <n-button type="primary" :disabled="disabled || !selection || !status.writable" :loading="busy" @click="applySelection">
      {{ t('settings.advancedSettings.displayPage.edidApply', 'Apply EDID') }}
    </n-button>
  </section>
</template>

<style scoped>
.edid-settings-panel {
  display: grid;
  gap: 10px;
  margin-top: 18px;
}
.edid-settings-panel h3 {
  margin: 0;
}
</style>
