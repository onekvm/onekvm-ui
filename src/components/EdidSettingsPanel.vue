<script setup lang="ts">
import { useAsyncDialog } from '@/composables/useAsyncDialog'
import { computed, onMounted, ref } from 'vue'
import { useMessage } from 'naive-ui'

import { api, APIError, type EDIDApplyRequired, type EDIDStatus } from '@/api/client'
import { t } from '@/i18n/runtime'
import { edidSelectOptions, filterEdidOption, parseEdidSelection } from '@/lib/edid'
import SettingsPanel from './SettingsPanel.vue'
import EdidIdentitySummary from './EdidIdentitySummary.vue'

defineProps<{ disabled?: boolean }>()

const message = useMessage()
const dialog = useAsyncDialog()
const status = ref<EDIDStatus | null>(null)
const busy = ref(false)
const selection = ref('')

const options = computed(() => edidSelectOptions(status.value, {
  factory: t('settings.advancedSettings.displayPage.edidFactory', 'Factory preset'),
  presets: t('settings.advancedSettings.displayPage.edidMachinePresets', 'Machine presets'),
  common: t('settings.advancedSettings.displayPage.edidCommonPresets', 'Common'),
  custom: t('settings.advancedSettings.displayPage.edidCustomFiles', 'Custom files'),
}))

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
  const ref = parseEdidSelection(selection.value)
  if (!ref) return
  const { extension, directory, id } = ref
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
        return false
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
  <SettingsPanel
    v-if="status?.supported"
    :title="t('settings.advancedSettings.displayPage.edid', 'HDMI EDID')"
    :description="t('settings.advancedSettings.displayPage.edidHint', 'Apply a saved EDID file to the HDMI capture chip. Edit files in the EDID Editor plugin.')"
  >
    <EdidIdentitySummary :status="status" />
    <p v-if="!status.summary" class="display-setting-field-hint">{{ t('settings.advancedSettings.displayPage.edidReadUnavailable', 'Current EDID could not be read. Presets and custom files are still available.') }}</p>
    <n-select
      v-model:value="selection"
      class="edid-preset-select"
      :options="options"
      filterable
      :filter="filterEdidOption"
      :menu-props="{ class: 'edid-preset-menu' }"
      :virtual-scroll="false"
      :disabled="disabled || busy || !status.writable"
      :placeholder="t('settings.advancedSettings.displayPage.edidSelect', 'Choose a machine preset or a custom file')"
    />
    <div class="edid-apply-row">
      <span class="display-setting-field-hint">{{ applyPolicyText }}</span>
      <n-button secondary :type="applyPolicyType" :disabled="disabled || !selection || !status.writable" :loading="busy" @click="applySelection">
      {{ t('settings.advancedSettings.displayPage.edidApply', 'Apply EDID') }}
      </n-button>
    </div>
  </SettingsPanel>
</template>

<style scoped>
.edid-apply-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.edid-apply-row .n-button { flex-shrink: 0; }
.edid-preset-select { width: 100%; min-width: 0; }
.display-setting-field-hint { margin: 0; color: var(--muted-foreground); font-size: 12px; line-height: 1.6; }
@media (max-width: 480px) { .edid-apply-row { align-items: stretch; flex-direction: column; } }
</style>
