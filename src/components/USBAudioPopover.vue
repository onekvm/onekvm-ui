<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDialog, useMessage } from 'naive-ui'

import { api, type ConfigSchema, type OneKVMStatus } from '@/api/client'
import { t } from '@/i18n/runtime'
import { onekvm } from '@/lib/onekvm'

const props = defineProps<{
  status: OneKVMStatus | null
  placement?: 'top-end' | 'bottom-end' | 'right-start' | 'left-start'
}>()

const emit = defineEmits<{
  'update:show': [show: boolean]
}>()

const dialog = useDialog()
const message = useMessage()
const popoverOpen = ref(false)
const saving = ref(false)
const schema = ref<ConfigSchema | null>(null)

const audioAvailable = computed(() => schema.value?.capabilities?.audio === true)
const enabled = computed(() => Boolean(props.status?.audio.enabled))

watch(popoverOpen, (open) => {
  if (open && !schema.value) void loadSchema()
})

void loadSchema()

async function loadSchema() {
  try {
    schema.value = await api.getConfigSchema()
  } catch {
    schema.value = null
  }
}

function updateShow(open: boolean) {
  popoverOpen.value = open
  emit('update:show', open)
}

function requestToggle(value: boolean) {
  if (value === enabled.value || saving.value) return
  if (!value) {
    void applyAudio(false)
    return
  }
  dialog.warning({
    title: t('usbAudio.title', 'USB audio'),
    content: t('usbAudio.enableConfirm', 'The target PC will get a USB speaker and microphone. Keyboard and mouse will disconnect briefly.'),
    positiveText: t('usbAudio.confirm', 'Continue'),
    negativeText: t('common.cancel', 'Cancel'),
    onPositiveClick: () => applyAudio(true),
  })
}

async function applyAudio(value: boolean) {
  saving.value = true
  try {
    if (value) {
      await api.patchConfig('audio.device', 'hw:UAC1Gadget,0')
      await api.patchConfig('audio.encoder', 'pcmu')
    }
    await api.patchConfig('audio.enabled', String(value))
    await onekvm.reconnect()
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <n-popover
    v-if="audioAvailable"
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
        <strong>{{ t('usbAudio.title', 'USB audio') }}</strong>
      </header>
      <div class="display-status-values">
        <div>
          <span>{{ t('usbAudio.enable', 'Present to target') }}</span>
          <n-switch size="small" :value="enabled" :disabled="saving" @update:value="requestToggle" />
        </div>
      </div>
      <p class="usb-audio-hint">
        {{ t('usbAudio.hint', 'Adds a speaker (hear the target) and a microphone (talk to the target). Only attach the USB sound card when you need it.') }}
      </p>
    </div>
  </n-popover>
</template>
