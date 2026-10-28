<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'

import { api, APIError, type EDIDApplyRequired, type EDIDStatus, type EDIDWriteMode } from '@/api/client'
import { useOverlayMount } from '@/composables/useOverlayMount'
import { t } from '@/i18n/runtime'
import { edidRequiresRestart, edidSelectOptions, edidWriteMode, filterEdidOption, parseEdidSelection } from '@/lib/edid'
import EdidIdentitySummary from './EdidIdentitySummary.vue'
import EdidWriteModeSelect from './EdidWriteModeSelect.vue'

const show = defineModel<boolean>('show', { required: true })
const props = defineProps<{ status: EDIDStatus | null; disabled?: boolean }>()
const emit = defineEmits<{
  applied: [required: EDIDApplyRequired]
  'update:busy': [busy: boolean]
  'after-leave': []
}>()

const overlayTo = useOverlayMount()
const currentStatus = shallowRef<EDIDStatus | null>(null)
const loading = shallowRef(false)
const applying = shallowRef(false)
const loadError = shallowRef('')
const applyError = shallowRef('')
const selection = shallowRef('')
const writeMode = shallowRef<EDIDWriteMode>('permanent')
let loadRevision = 0

const options = computed(() => edidSelectOptions(currentStatus.value, {
  factory: t('settings.advancedSettings.displayPage.edidFactory', 'Factory preset'),
  presets: t('settings.advancedSettings.displayPage.edidMachinePresets', 'Machine presets'),
  common: t('settings.advancedSettings.displayPage.edidCommonPresets', 'Common'),
  custom: t('settings.advancedSettings.displayPage.edidCustomFiles', 'Custom files'),
}))
const selectedEdid = computed(() => parseEdidSelection(selection.value))
const formDisabled = computed(() => props.disabled || loading.value || applying.value || !!loadError.value || !currentStatus.value?.supported || !currentStatus.value.writable)
const restartHint = computed(() => {
  if (writeMode.value === 'temporary') return ''
  if (currentStatus.value?.apply_policy === 'power_cycle') {
    return t('screen.edidPowerCycleHint', 'Permanent EDID takes effect after disconnecting and reconnecting device power; restarting the system is insufficient.')
  }
  if (edidRequiresRestart(currentStatus.value?.apply_policy) || currentStatus.value?.hotplug === false) {
    return t('screen.edidRebootHint', 'This board cannot hotplug HDMI. Applying EDID requires a restart.')
  }
  return ''
})

async function reload() {
  const revision = ++loadRevision
  loading.value = true
  loadError.value = ''
  try {
    const status = await api.getVideoEDID()
    if (revision === loadRevision) currentStatus.value = status
  } catch (error) {
    if (revision === loadRevision) loadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    if (revision === loadRevision) loading.value = false
  }
}

function updateShow(value: boolean) {
  if (!applying.value) show.value = value
}

async function apply() {
  if (!show.value || formDisabled.value || !selectedEdid.value) return
  applying.value = true
  applyError.value = ''
  emit('update:busy', true)
  try {
    const result = await api.applyVideoEDID({
      library: selectedEdid.value,
      mode: edidWriteMode(currentStatus.value, writeMode.value),
    })
    show.value = false
    emit('applied', result.apply_required)
  } catch (error) {
    applyError.value = error instanceof APIError ? error.message : String(error)
  } finally {
    applying.value = false
    emit('update:busy', false)
  }
}

watch(show, (visible) => {
  if (!visible) {
    loadRevision++
    return
  }
  currentStatus.value = props.status
  selection.value = ''
  writeMode.value = 'permanent'
  applyError.value = ''
  void reload()
}, { immediate: true })
</script>

<template>
  <n-modal
    :show="show"
    :to="overlayTo"
    preset="card"
    class="edid-apply-modal"
    :title="t('screen.changeEdid', 'Change EDID')"
    :style="{ width: 'min(560px, calc(100vw - 24px))' }"
    :content-style="{ maxHeight: '65dvh', overflowY: 'auto' }"
    :mask-closable="!applying"
    :closable="!applying"
    :close-on-esc="!applying"
    @update:show="updateShow"
    @after-leave="emit('after-leave')"
  >
    <div class="edid-modal-content">
      <p class="edid-modal-hint">{{ t('screen.edidDialogHint', 'Choose an EDID and a write mode, then select Apply EDID.') }}</p>
      <n-alert v-if="loadError" type="error" :bordered="false">
        <div class="edid-modal-load-error">
          <span>{{ loadError }}</span>
          <n-button size="small" :loading="loading" @click="reload">{{ t('common.refresh', 'Refresh') }}</n-button>
        </div>
      </n-alert>
      <n-spin :show="loading">
        <div class="edid-modal-fields">
          <template v-if="currentStatus?.supported">
            <EdidIdentitySummary :status="currentStatus" />
            <p v-if="!currentStatus.summary" class="edid-modal-hint">{{ t('settings.advancedSettings.displayPage.edidReadUnavailable', 'Current EDID could not be read. Presets and custom files are still available.') }}</p>
            <n-alert v-if="!currentStatus.writable" type="warning" :bordered="false">{{ t('screen.edidReadOnly', 'EDID is read-only on this device.') }}</n-alert>
            <n-form label-placement="top" :disabled="formDisabled" @submit.prevent>
              <n-form-item :label="t('screen.edid', 'EDID')" :show-feedback="false">
                <n-select
                  :value="selection || null"
                  :aria-label="t('screen.edid', 'EDID')"
                  :to="overlayTo"
                  :options="options"
                  filterable
                  :filter="filterEdidOption"
                  :menu-props="{ class: 'edid-preset-menu' }"
                  :virtual-scroll="false"
                  :placeholder="t('settings.advancedSettings.displayPage.edidSelect', 'Choose a machine preset or a custom file')"
                  :disabled="formDisabled"
                  @update:value="selection = typeof $event === 'string' ? $event : ''"
                />
              </n-form-item>
              <EdidWriteModeSelect
                v-model:value="writeMode"
                class="edid-modal-write-mode"
                :status="currentStatus"
                :disabled="formDisabled"
                :select-props="{ to: overlayTo }"
                dropdown
              />
            </n-form>
            <n-alert v-if="restartHint" type="warning" :bordered="false">{{ restartHint }}</n-alert>
          </template>
          <n-alert v-else-if="!loading && !loadError" type="warning" :bordered="false">{{ t('screen.edidUnavailable', 'EDID settings are unavailable on this device.') }}</n-alert>
        </div>
      </n-spin>
      <n-alert v-if="applyError" type="error" :bordered="false">{{ applyError }}</n-alert>
    </div>
    <template #footer>
      <div class="edid-modal-actions">
        <n-button :disabled="applying" @click="updateShow(false)">{{ t('common.cancel', 'Cancel') }}</n-button>
        <n-button class="edid-modal-apply" type="primary" :disabled="formDisabled || !selectedEdid" :loading="applying" @click="apply">
          {{ t('settings.advancedSettings.displayPage.edidApply', 'Apply EDID') }}
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<style scoped>
.edid-modal-content, .edid-modal-fields { display: grid; gap: 16px; }
.edid-modal-hint { margin: 0; color: var(--muted-foreground); font-size: 13px; line-height: 1.6; }
.edid-modal-write-mode { margin-top: 16px; }
.edid-modal-load-error { display: flex; align-items: center; justify-content: space-between; gap: 12px; overflow-wrap: anywhere; }
.edid-modal-actions { display: flex; justify-content: flex-end; gap: 12px; }
</style>
