<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue'
import { X } from '@lucide/vue'

import { t } from '@/i18n/runtime'
import { useOverlayMount } from '@/composables/useOverlayMount'
import { DISMISS_CONTROL_OVERLAY_EVENT } from '@/lib/overlay-target'

const props = defineProps<{
  show: boolean
  sheet?: boolean
  placement?: 'top-end' | 'bottom-end' | 'bottom-start' | 'right-start' | 'left-start'
  popoverClass?: string
  to?: string | HTMLElement
}>()

const emit = defineEmits<{
  'update:show': [show: boolean]
}>()

const overlayTo = useOverlayMount()
const sheetId = `${Date.now()}-${Math.random()}`
const compactPopoverTheme = {
  padding: '4px 12px 10px',
}

function updateShow(show: boolean) {
  if (show && props.sheet) {
    window.dispatchEvent(new CustomEvent('onekvm:close-control-sheets', { detail: sheetId }))
  }
  emit('update:show', show)
}

function onSheetKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !props.show) return
  event.stopPropagation()
  updateShow(false)
}

function onPeerSheetClose(event: Event) {
  if (!props.show || (event as CustomEvent).detail === sheetId) return
  emit('update:show', false)
}

function onDismissOverlay() {
  if (!props.show) return
  emit('update:show', false)
}

watch(
  () => Boolean(props.sheet && props.show),
  (open) => {
    if (open) window.addEventListener('keydown', onSheetKeydown, true)
    else window.removeEventListener('keydown', onSheetKeydown, true)
  },
)

onMounted(() => {
  window.addEventListener('onekvm:close-control-sheets', onPeerSheetClose)
  window.addEventListener(DISMISS_CONTROL_OVERLAY_EVENT, onDismissOverlay)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onSheetKeydown, true)
  window.removeEventListener('onekvm:close-control-sheets', onPeerSheetClose)
  window.removeEventListener(DISMISS_CONTROL_OVERLAY_EVENT, onDismissOverlay)
})
</script>

<template>
  <n-popover
    v-if="!sheet"
    :show="show"
    trigger="click"
    :placement="placement || 'bottom-end'"
    :show-arrow="false"
    :class="popoverClass"
    :theme-overrides="compactPopoverTheme"
    :to="to ?? overlayTo"
    @update:show="updateShow"
  >
    <template #trigger><slot /></template>
    <slot name="panel" />
  </n-popover>
  <template v-else>
    <span class="control-sheet-trigger" @click="updateShow(true)">
      <slot />
    </span>
    <Teleport :to="overlayTo">
      <Transition name="control-sheet" :duration="320">
        <div
          v-if="show"
          class="control-sheet-mask"
          role="presentation"
          @click.self="updateShow(false)"
        >
          <section class="control-sheet-card" role="dialog" aria-modal="true">
            <header class="control-sheet-header">
              <strong class="control-sheet-title"><slot name="title" /></strong>
              <button
                type="button"
                class="control-sheet-close"
                :aria-label="t('common.close', 'Close')"
                @click="updateShow(false)"
              >
                <X :size="18" />
              </button>
            </header>
            <div class="control-sheet-body">
              <slot name="panel" />
            </div>
          </section>
        </div>
      </Transition>
    </Teleport>
  </template>
</template>
