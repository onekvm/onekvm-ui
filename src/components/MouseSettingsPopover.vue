<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { type MouseMode } from '@/composables/useMouse'
import { useOverlayMount } from '@/composables/useOverlayMount'
import { t } from '@/i18n/runtime'
import { DISMISS_CONTROL_OVERLAY_EVENT } from '@/lib/overlay-target'
import ControlOverlay from './ControlOverlay.vue'
import HidHostAlert from './HidHostAlert.vue'

const props = defineProps<{
  mouseMode: MouseMode
  scrollInterval: number
  mouseReportRate: number
  hideLocalCursor?: boolean
  hid?: { available: boolean; connected: boolean } | null
  placement?: 'top-end' | 'bottom-end' | 'right-start' | 'left-start'
  sheet?: boolean
  trackpad?: boolean
}>()

const emit = defineEmits<{
  'update:show': [show: boolean]
  'update:mouseMode': [mode: MouseMode]
  'update:scrollInterval': [interval: number]
  'update:mouseReportRate': [rate: number]
  'update:hideLocalCursor': [hidden: boolean]
  'update:trackpad': [open: boolean]
}>()

const overlayTo = useOverlayMount()
const popoverOpen = ref(false)
const menuOpen = ref(false)

const mouseModeOptions = computed(() => [
  { label: t('mouse.absolute', 'Absolute'), value: 'absolute' as const },
  { label: t('mouse.relative', 'Relative'), value: 'relative' as const },
])
const scrollOptions = Array.from({ length: 16 }, (_, index) => {
  const value = index * 10
  return { label: `${value} ms`, value }
})
type MouseReportRateSelection = 60 | 100 | 125 | 'custom'
const mouseReportRateOptions = computed(() => [
  { label: '60 Hz', value: 60 },
  { label: '100 Hz', value: 100 },
  { label: '125 Hz', value: 125 },
  { label: t('settings.mouse.reportRateCustom', 'Custom'), value: 'custom' },
])
const reportRateCustom = ref(![60, 100, 125].includes(props.mouseReportRate))
const mouseReportRateSelection = computed<MouseReportRateSelection>(() =>
  reportRateCustom.value || ![60, 100, 125].includes(props.mouseReportRate)
    ? 'custom'
    : props.mouseReportRate as 60 | 100 | 125,
)
const selectProps = computed(() => ({
  class: 'display-status-select',
  size: (props.sheet ? 'medium' : 'tiny') as 'medium' | 'tiny',
  menuSize: (props.sheet ? 'medium' : 'tiny') as 'medium' | 'tiny',
  consistentMenuWidth: false,
  showCheckmark: false,
  to: overlayTo.value,
  menuProps: { class: 'display-fit-select-menu' },
}))
function updateShow(show: boolean) {
  if (!show && menuOpen.value) return
  popoverOpen.value = show
  emit('update:show', show)
}

function forceClose() {
  menuOpen.value = false
  if (!popoverOpen.value) return
  popoverOpen.value = false
  emit('update:show', false)
}

function updateMode(value: string | number | null) {
  if (value !== 'absolute' && value !== 'relative') return
  if (value === props.mouseMode) return
  emit('update:mouseMode', value)
}

function updateScroll(value: string | number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return
  const next = Math.max(0, Math.min(150, Math.round(value)))
  if (next === props.scrollInterval) return
  emit('update:scrollInterval', next)
}

function updateReportRateSelection(value: string | number | null) {
  if (value === 'custom') {
    reportRateCustom.value = true
    return
  }
  if (value !== 60 && value !== 100 && value !== 125) return
  reportRateCustom.value = false
  if (value === props.mouseReportRate) return
  emit('update:mouseReportRate', value)
}

function updateCustomReportRate(value: number | null) {
  if (value === null || !Number.isFinite(value)) return
  const next = Math.max(1, Math.min(1000, Math.round(value)))
  if (next === props.mouseReportRate) return
  emit('update:mouseReportRate', next)
}

function updateTrackpad(value: boolean) {
  if (value === Boolean(props.trackpad)) return
  emit('update:trackpad', value)
  if (value) updateShow(false)
}

onMounted(() => window.addEventListener(DISMISS_CONTROL_OVERLAY_EVENT, forceClose))
onBeforeUnmount(() => window.removeEventListener(DISMISS_CONTROL_OVERLAY_EVENT, forceClose))
</script>

<template>
  <ControlOverlay
    :show="popoverOpen"
    :sheet="sheet"
    :placement="placement"
    popover-class="control-popover mouse-control-popover"
    to=".console-workspace"
    @update:show="updateShow"
  >
    <slot />
    <template #title>{{ t('settings.mouse.title', 'Mouse') }}</template>
    <template #panel>
    <div class="display-status-popover">
      <header class="control-popover-header">
        <strong>{{ t('settings.mouse.title', 'Mouse') }}</strong>
      </header>
      <HidHostAlert :hid="hid" />
      <div class="display-status-values">
        <div v-if="sheet">
          <span>{{ t('mouse.trackpad', 'Trackpad') }}</span>
          <n-switch
            :size="sheet ? 'medium' : 'small'"
            :value="Boolean(trackpad)"
            @update:value="updateTrackpad"
          />
        </div>
        <div>
          <span>{{ t('mouse.hideLocalCursor', 'Hide local cursor') }}</span>
          <n-switch
            :size="sheet ? 'medium' : 'small'"
            :value="Boolean(hideLocalCursor)"
            @update:value="emit('update:hideLocalCursor', $event)"
          />
        </div>
        <div>
          <span>{{ t('mouse.mode', 'Mouse mode') }}</span>
          <n-select
            v-bind="selectProps"
            :value="mouseMode"
            :options="mouseModeOptions"
            @update:value="updateMode"
            @update:show="menuOpen = $event"
          />
        </div>
        <div>
          <span>{{ t('settings.mouse.scroll', 'Scroll interval') }}</span>
          <n-select
            v-bind="selectProps"
            :value="scrollInterval"
            :options="scrollOptions"
            @update:value="updateScroll"
            @update:show="menuOpen = $event"
          />
        </div>
        <div>
          <span>{{ t('settings.mouse.reportRate', 'Report rate') }}</span>
          <n-select
            v-bind="selectProps"
            :value="mouseReportRateSelection"
            :options="mouseReportRateOptions"
            @update:value="updateReportRateSelection"
            @update:show="menuOpen = $event"
          />
        </div>
        <div v-if="mouseReportRateSelection === 'custom'">
          <span>{{ t('settings.mouse.reportRateCustom', 'Custom') }}</span>
          <n-input-number
            class="display-status-select"
            size="tiny"
            :value="mouseReportRate"
            :min="1"
            :max="1000"
            :step="1"
            @update:value="updateCustomReportRate"
          >
            <template #suffix>Hz</template>
          </n-input-number>
        </div>
      </div>
    </div>
    </template>
  </ControlOverlay>
</template>
