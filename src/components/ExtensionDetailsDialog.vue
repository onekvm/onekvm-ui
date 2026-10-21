<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'

import { api, type ExtensionStatus, type ExtensionSummary } from '@/api/client'
import ExtensionDetailsModal from './ExtensionDetailsModal.vue'

const props = defineProps<{
  show: boolean
  id: string
  name?: string
  icon?: ExtensionSummary['icon']
  iconDataUrl?: string
}>()
const emit = defineEmits<{ 'update:show': [show: boolean] }>()

const detail = shallowRef<ExtensionStatus>()
const loading = ref(false)
const error = ref('')
let generation = 0

const summary = computed<ExtensionSummary>(() => {
  const fallback: ExtensionSummary = {
    id: props.id,
    name: props.name || props.id,
    kind: '',
    installed: false,
    enabled: false,
    running: false,
    icon: props.icon,
    icon_data_url: props.iconDataUrl,
  }
  const current = detail.value
  if (!current) return fallback
  return {
    ...fallback,
    ...current,
    icon: current.icon || fallback.icon,
    icon_data_url: current.icon_data_url || fallback.icon_data_url,
  }
})

async function load() {
  const request = ++generation
  if (!props.show || !props.id) return
  loading.value = true
  error.value = ''
  try {
    const result = await api.getExtension(props.id)
    if (request === generation) detail.value = result
  } catch (reason) {
    if (request === generation) error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    if (request === generation) loading.value = false
  }
}

watch([() => props.show, () => props.id], ([show], _previous, onCleanup) => {
  onCleanup(() => { generation += 1 })
  if (show) {
    detail.value = undefined
    void load()
  }
}, { immediate: true })
</script>

<template>
  <ExtensionDetailsModal
    :show="show && !!id"
    :status="summary"
    :detail="detail"
    :loading="loading"
    :error="error"
    :busy="false"
    @close="emit('update:show', false)"
    @retry="load"
  />
</template>
