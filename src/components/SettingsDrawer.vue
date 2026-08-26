<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Save, SlidersHorizontal } from '@lucide/vue'
import { useDialog, useMessage } from 'naive-ui'

import { type MouseMode } from '@/composables/useMouse'
import { t } from '@/i18n/runtime'

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
const advancedPending = ref(false)

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
      // The parent conditionally mounts this drawer with v-if. Once show is
      // set to false the drawer is unmounted before Naive UI can emit
      // after-leave, so queue the route transition here instead of relying on
      // the animation callback.
      advancedPending.value = false
      emit('update:show', false)
      emit('advanced')
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
  if (show) resetMouseDraft()
}, { immediate: true })
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
.simple-settings-section { display: grid; gap: 12px; margin-top: 18px; }
.simple-settings-section > h3 { margin: 0; font-size: 14px; }
.settings-form { display: grid; gap: 14px; }
.simple-settings-actions { display: flex; justify-content: flex-end; gap: 8px; }
.display-setting-stack { display: grid; width: 100%; gap: 7px; }
.display-setting-field-hint { display: block; color: #87919b; font-size: 12px; line-height: 1.6; }
@media (max-width: 440px) {
  .slider-field { grid-template-columns: minmax(100px, 1fr) 108px; gap: 10px; }
}
</style>
