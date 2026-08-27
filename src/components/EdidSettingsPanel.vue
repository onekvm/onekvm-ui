<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useDialog, useMessage } from 'naive-ui'

import { api, APIError, type ContentLibrary, type EDIDApplyRequired, type EDIDStatus } from '@/api/client'
import { t } from '@/i18n/runtime'

const props = defineProps<{ disabled?: boolean }>()

const message = useMessage()
const dialog = useDialog()
const status = ref<EDIDStatus | null>(null)
const libraries = ref<ContentLibrary[]>([])
const busy = ref(false)
const selection = ref('')

const options = computed(() => libraries.value.flatMap((library) =>
  library.files.map((file) => ({
    label: `${file.id} · ${library.extension}/${library.id}`,
    value: `${library.extension}\0${library.id}\0${file.id}`,
  })),
))

async function reload() {
  const [edid, catalog] = await Promise.all([
    api.getVideoEDID(),
    api.getContentLibraries('edid').catch(() => ({ kind: 'edid', libraries: [] as ContentLibrary[] })),
  ])
  status.value = edid
  libraries.value = catalog.libraries
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
      {{ status.summary?.preferred
        ? `${status.summary.preferred.width}×${status.summary.preferred.height}@${status.summary.preferred.fps}`
        : t('settings.advancedSettings.displayPage.edidUnknown', 'Current advertised mode is unavailable') }}
      · {{ status.apply_policy }}
    </p>
    <n-select
      v-model:value="selection"
      :options="options"
      :disabled="disabled || busy || !status.writable"
      :placeholder="t('settings.advancedSettings.displayPage.edidSelect', 'Choose a library entry from any installed EDID provider')"
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
