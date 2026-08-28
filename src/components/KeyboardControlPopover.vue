<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { GripHorizontal, Keyboard, Pin, PinOff } from '@lucide/vue'
import { useMessage, type DropdownOption, type InputInst } from 'naive-ui'

import { api, type KeyboardLayout } from '@/api/client'
import { t } from '@/i18n/runtime'
import { filterKeyboardText } from '@/input/keyboard-text'
import HidHostAlert from './HidHostAlert.vue'

const props = defineProps<{
  options: DropdownOption[]
  layout: KeyboardLayout
  hid?: { available: boolean; connected: boolean } | null
  numLock?: boolean
  capsLock?: boolean
  scrollLock?: boolean
  placement?: 'top-end' | 'bottom-end' | 'right-start' | 'left-start'
}>()

const emit = defineEmits<{
  select: [key: string | number]
  'update:show': [show: boolean]
}>()

const popoverOpen = ref(false)
const pinned = ref(false)
const textModalOpen = ref(false)
const text = ref('')
const sendingText = ref(false)
const textInput = ref<InputInst | null>(null)
const compactViewport = ref(window.innerWidth <= 520)
const panel = ref<HTMLElement | null>(null)
const position = ref({ x: 24, y: 58 })
let dragOffset = { x: 0, y: 0 }
let dragging = false
let unsupportedWarningAt = 0
const message = useMessage()

const actionOptions = computed(() => props.options.slice(0, 1))
const remainingOptions = computed(() => props.options.slice(1))

const panelStyle = computed(() => ({
  left: `${position.value.x}px`,
  top: `${position.value.y}px`,
}))
const popoverPlacement = computed(() => {
  if (compactViewport.value) return 'bottom-start'
  return props.placement || 'bottom-end'
})
const popoverX = computed(() => compactViewport.value ? 8 : undefined)
const popoverY = computed(() => compactViewport.value ? 36 : undefined)

function lockLabel(value: boolean | undefined) {
  if (value === undefined) return t('keyboard.lockUnknown', 'Unknown')
  return value ? t('keyboard.lockOn', 'On') : t('keyboard.lockOff', 'Off')
}

function lockState(value: boolean | undefined) {
  if (value === undefined) return 'unknown'
  return value ? 'on' : 'off'
}

function layoutLabel(layout: KeyboardLayout) {
  return t(`keyboard.layouts.${layout}`, layout.toUpperCase())
}

function updateShow(show: boolean) {
  popoverOpen.value = show
  emit('update:show', show)
}

function clampPosition() {
  if (!panel.value) return
  const rect = panel.value.getBoundingClientRect()
  position.value = {
    x: Math.max(8, Math.min(window.innerWidth - rect.width - 8, position.value.x)),
    y: Math.max(50, Math.min(window.innerHeight - rect.height - 8, position.value.y)),
  }
}

async function placePanel(originX?: number, originY?: number) {
  await nextTick()
  if (!panel.value) return
  const rect = panel.value.getBoundingClientRect()
  position.value = originX == null || originY == null
    ? { x: Math.max(8, window.innerWidth - rect.width - 18), y: 58 }
    : { x: originX, y: originY }
  clampPosition()
}

function pinPanel(event?: MouseEvent) {
  pinned.value = true
  popoverOpen.value = false
  emit('update:show', false)
  void placePanel(event?.clientX, event?.clientY)
}

function unpinPanel() {
  pinned.value = false
  popoverOpen.value = true
  emit('update:show', true)
}

function selectOption(key: string | number) {
  if (key === 'send-text') {
    if (!pinned.value) updateShow(false)
    textModalOpen.value = true
    void nextTick(() => textInput.value?.focus())
    return
  }
  emit('select', key)
  if (!pinned.value) updateShow(false)
}

function updateText(value: string) {
  const filtered = filterKeyboardText(value, props.layout)
  text.value = filtered.value
  if (filtered.removed === 0 || Date.now() - unsupportedWarningAt < 1200) return
  unsupportedWarningAt = Date.now()
  message.warning(t('keyboard.unsupportedRemoved', 'Characters unavailable on this keyboard layout were removed.'))
}

async function sendText() {
  if (!text.value || sendingText.value) return
  sendingText.value = true
  try {
    const result = await api.sendKeyboardText(text.value, props.layout)
    text.value = ''
    textModalOpen.value = false
    message.success(t('keyboard.textSent', 'Sent {count} characters').replace('{count}', String(result.characters)))
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  } finally {
    sendingText.value = false
  }
}

function startDrag(event: PointerEvent) {
  if (event.button !== 0 || !panel.value || window.innerWidth < 768) return
  const rect = panel.value.getBoundingClientRect()
  dragOffset = { x: event.clientX - rect.left, y: event.clientY - rect.top }
  dragging = true
  window.addEventListener('pointermove', drag)
  window.addEventListener('pointerup', stopDrag, { once: true })
}

function drag(event: PointerEvent) {
  if (!dragging) return
  position.value = { x: event.clientX - dragOffset.x, y: event.clientY - dragOffset.y }
  clampPosition()
}

function stopDrag() {
  dragging = false
  window.removeEventListener('pointermove', drag)
}

function handleResize() {
  compactViewport.value = window.innerWidth <= 520
  clampPosition()
}

onMounted(() => {
  handleResize()
  window.addEventListener('resize', handleResize)
})

watch(() => props.layout, (layout) => {
  text.value = filterKeyboardText(text.value, layout).value
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('pointermove', drag)
})
</script>

<template>
  <n-popover
    :show="popoverOpen"
    trigger="click"
    :placement="popoverPlacement"
    :x="popoverX"
    :y="popoverY"
    :show-arrow="false"
    class="control-popover keyboard-control-popover"
    @update:show="updateShow"
  >
    <template #trigger><slot /></template>

    <div class="keyboard-control-panel">
      <header class="control-popover-header">
        <div class="keyboard-control-heading">
          <span class="keyboard-control-heading-icon"><Keyboard :size="16" /></span>
          <span>
            <strong>{{ t('keyboard.title', 'Keyboard') }}</strong>
            <small>{{ t('keyboard.layout', 'Keyboard layout') }} · {{ layoutLabel(layout) }}</small>
          </span>
        </div>
        <div class="control-popover-header-actions">
          <n-tooltip to="body" :z-index="4000">
            <template #trigger>
              <n-button quaternary circle size="tiny" :aria-label="t('keyboard.pinStatus', 'Pin keyboard status')" @click="pinPanel($event)">
                <template #icon><Pin /></template>
              </n-button>
            </template>
            {{ t('keyboard.pinStatus', 'Pin keyboard status') }}
          </n-tooltip>
        </div>
      </header>
      <HidHostAlert :hid="hid" />
      <div class="keyboard-lock-status" role="status">
        <span class="keyboard-lock-indicator" :data-state="lockState(capsLock)" :aria-label="`${t('keyboard.capsLock', 'Caps Lock')}: ${lockLabel(capsLock)}`">
          <i />
          <span>{{ t('keyboard.capsLock', 'Caps Lock') }}</span>
          <strong>{{ lockLabel(capsLock) }}</strong>
        </span>
        <span class="keyboard-lock-indicator" :data-state="lockState(numLock)" :aria-label="`${t('keyboard.numLock', 'Num Lock')}: ${lockLabel(numLock)}`">
          <i />
          <span>{{ t('keyboard.numLock', 'Num Lock') }}</span>
          <strong>{{ lockLabel(numLock) }}</strong>
        </span>
        <span class="keyboard-lock-indicator" :data-state="lockState(scrollLock)" :aria-label="`${t('keyboard.scrollLock', 'Scroll Lock')}: ${lockLabel(scrollLock)}`">
          <i />
          <span>{{ t('keyboard.scrollLock', 'Scroll Lock') }}</span>
          <strong>{{ lockLabel(scrollLock) }}</strong>
        </span>
      </div>
      <n-menu accordion :value="null" :options="actionOptions" :indent="16" class="keyboard-control-menu keyboard-action-menu" @update:value="selectOption" />
      <n-menu accordion :value="null" :options="remainingOptions" :indent="16" class="keyboard-control-menu keyboard-secondary-menu" @update:value="selectOption" />
    </div>
  </n-popover>

  <n-modal
    v-model:show="textModalOpen"
    preset="card"
    class="keyboard-text-modal"
    :title="t('keyboard.paste', 'Send text')"
    :mask-closable="!sendingText"
    :close-on-esc="!sendingText"
  >
    <div class="keyboard-text-modal-content">
      <p class="keyboard-text-modal-hint">
        {{ t('keyboard.tips', 'Only characters available on the selected remote keyboard layout can be sent.') }}
        <strong>{{ layoutLabel(layout) }}</strong>
      </p>
      <n-input
        ref="textInput"
        :value="text"
        type="textarea"
        :maxlength="1024"
        show-count
        :autosize="{ minRows: 5, maxRows: 10 }"
        :placeholder="t('keyboard.placeholder', 'Text to type on the remote host')"
        @update:value="updateText"
        @keydown.ctrl.enter.prevent="sendText"
      />
      <div class="keyboard-text-modal-actions">
        <n-button :disabled="sendingText" @click="textModalOpen = false">
          {{ t('common.cancel', 'Cancel') }}
        </n-button>
        <n-button type="primary" :loading="sendingText" :disabled="!text" @click="sendText">
          {{ t('keyboard.submit', 'Send') }}
        </n-button>
      </div>
    </div>
  </n-modal>

  <Teleport to="body">
    <Transition name="win11-window">
    <section
      v-if="pinned"
      ref="panel"
      class="keyboard-status-window"
      :style="panelStyle"
      role="dialog"
      :aria-label="t('keyboard.title', 'Keyboard')"
    >
      <header class="display-status-titlebar" @pointerdown="startDrag">
        <GripHorizontal :size="15" class="floating-window-grip" />
        <Keyboard :size="15" />
        <strong>{{ t('keyboard.title', 'Keyboard') }}</strong>
        <span class="display-status-pinned-label">{{ t('keyboard.pinned', 'Pinned') }}</span>
        <div class="control-popover-header-actions" @pointerdown.stop>
          <n-tooltip to="body" :z-index="4000">
            <template #trigger>
              <n-button quaternary circle size="tiny" :aria-label="t('keyboard.unpinStatus', 'Unpin keyboard status')" @click="unpinPanel">
                <template #icon><PinOff /></template>
              </n-button>
            </template>
            {{ t('keyboard.unpinStatus', 'Unpin keyboard status') }}
          </n-tooltip>
        </div>
      </header>
      <div class="keyboard-status-content">
        <HidHostAlert :hid="hid" />
        <div class="keyboard-pinned-layout">
          <span>{{ t('keyboard.layout', 'Keyboard layout') }}</span>
          <strong>{{ layoutLabel(layout) }}</strong>
        </div>
        <div class="keyboard-lock-status" role="status">
          <span class="keyboard-lock-indicator" :data-state="lockState(capsLock)" :aria-label="`${t('keyboard.capsLock', 'Caps Lock')}: ${lockLabel(capsLock)}`">
            <i />
            <span>{{ t('keyboard.capsLock', 'Caps Lock') }}</span>
            <strong>{{ lockLabel(capsLock) }}</strong>
          </span>
          <span class="keyboard-lock-indicator" :data-state="lockState(numLock)" :aria-label="`${t('keyboard.numLock', 'Num Lock')}: ${lockLabel(numLock)}`">
            <i />
            <span>{{ t('keyboard.numLock', 'Num Lock') }}</span>
            <strong>{{ lockLabel(numLock) }}</strong>
          </span>
          <span class="keyboard-lock-indicator" :data-state="lockState(scrollLock)" :aria-label="`${t('keyboard.scrollLock', 'Scroll Lock')}: ${lockLabel(scrollLock)}`">
            <i />
            <span>{{ t('keyboard.scrollLock', 'Scroll Lock') }}</span>
            <strong>{{ lockLabel(scrollLock) }}</strong>
          </span>
        </div>
        <n-menu accordion :value="null" :options="actionOptions" :indent="16" class="keyboard-control-menu keyboard-action-menu" @update:value="selectOption" />
        <n-menu accordion :value="null" :options="remainingOptions" :indent="16" class="keyboard-control-menu keyboard-secondary-menu" @update:value="selectOption" />
      </div>
    </section>
    </Transition>
  </Teleport>
</template>
