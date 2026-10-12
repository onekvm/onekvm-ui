<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'

import { useOverlayMount } from '@/composables/useOverlayMount'
import { t } from '@/i18n/runtime'

const show = defineModel<boolean>('show', { required: true })
const props = defineProps<{ name: string; busy: boolean }>()
const emit = defineEmits<{ submit: [name: string] }>()
const overlayTo = useOverlayMount()
const name = shallowRef('')
watch([show, () => props.name], ([open, value]) => { if (open) name.value = value })
const valid = computed(() => name.value.trim().toLowerCase().endsWith('.iso')
  && new TextEncoder().encode(name.value.trim()).length <= 255
  && !/[\u0000-\u001f\u007f/\\]/.test(name.value.trim()))
function submit() {
  if (!valid.value || props.busy) return
  emit('submit', name.value.trim())
}
</script>

<template>
  <n-modal v-model:show="show" preset="card" :to="overlayTo" :z-index="4600"
    :style="{ width: 'min(440px, calc(100vw - 32px))' }"
    :title="t('virtualMedia.rename', 'Rename')" :mask-closable="!busy" :closable="!busy" :close-on-esc="!busy">
    <form class="iso-rename-form" @submit.prevent="submit">
      <n-form-item :label="t('virtualMedia.downloadFileName', 'File name')" label-placement="top" :show-feedback="false">
        <n-input v-model:value="name" autofocus :disabled="busy" :input-props="{ 'aria-label': t('virtualMedia.downloadFileName', 'File name') }" />
      </n-form-item>
      <div class="iso-rename-actions">
        <n-button :disabled="busy" @click="show = false">{{ t('common.cancel', 'Cancel') }}</n-button>
        <n-button attr-type="submit" type="primary" :disabled="!valid" :loading="busy">{{ t('common.save', 'Save') }}</n-button>
      </div>
    </form>
  </n-modal>
</template>

<style scoped>
.iso-rename-form { display: grid; gap: 16px; }
.iso-rename-actions { display: flex; justify-content: flex-end; gap: 8px; }
</style>
