<script setup lang="ts">
import { computed, markRaw, onBeforeUnmount, onUnmounted, shallowRef, watch, type Component } from 'vue'
import { useMessage } from 'naive-ui'

import {
  api,
  extensionAssetURL,
  type ExtensionStatus,
} from '@/api/client'
import { t } from '@/i18n/runtime'
import {
  loadVueExtensionPage,
  validateExtensionSettings,
  type ExtensionPageHostV1,
  type ExtensionPageSettingsAdapterV1,
  type LoadedVueExtensionPage,
} from '@/extensions/pluginUi'

const props = defineProps<{ extension: ExtensionStatus }>()
const emit = defineEmits<{ updated: [extension: ExtensionStatus] }>()

const message = useMessage()
const loading = shallowRef(false)
const saving = shallowRef(false)
const error = shallowRef('')
const pageComponent = shallowRef<Component | null>(null)
const settingsAdapter = shallowRef<ExtensionPageSettingsAdapterV1 | null>(null)
const pageRoot = shallowRef<HTMLElement | null>(null)
const extensionRef = computed(() => props.extension)
let loadedPage: LoadedVueExtensionPage | null = null
let leavingPageRoot: HTMLElement | null = null
let loadGeneration = 0

const pageHost = markRaw<ExtensionPageHostV1>({
  apiVersion: 1,
  extension: extensionRef,
  getStatus: api.getStatus,
  assetURL: (path: string) => extensionAssetURL(props.extension, path),
  invoke: (method, payload = null) => api.invokeExtension(props.extension.id, method, payload),
  saveSettings: () => save(),
  registerSettings: (adapter) => {
    settingsAdapter.value = markRaw(adapter)
    return () => {
      if (settingsAdapter.value === adapter) settingsAdapter.value = null
    }
  },
})

const dirty = computed(() => settingsAdapter.value?.dirty.value === true)
const valid = computed(() => settingsAdapter.value?.valid.value !== false)

async function loadPage() {
  const generation = ++loadGeneration
  loadedPage?.dispose()
  loadedPage = null
  pageComponent.value = null
  settingsAdapter.value = null
  error.value = ''
  loading.value = true
  try {
    const loaded = await loadVueExtensionPage(props.extension)
    if (generation !== loadGeneration) {
      loaded.dispose()
      return
    }
    loadedPage = loaded
    pageComponent.value = loaded.component
  } catch (reason) {
    if (generation === loadGeneration) error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    if (generation === loadGeneration) loading.value = false
  }
}

async function refreshSettings(reset: boolean) {
  const updated = await api.getExtension(props.extension.id)
  emit('updated', updated)
  if (reset) settingsAdapter.value?.reset(updated.settings)
  return updated
}

async function save(): Promise<boolean> {
  const adapter = settingsAdapter.value
  if (!adapter || saving.value || !adapter.valid.value) return false
  saving.value = true
  try {
    const settings = adapter.collect()
    const validationError = validateExtensionSettings(props.extension, settings)
    if (validationError) throw new Error(validationError)
    await api.updateExtension(props.extension.id, { settings })
    await refreshSettings(true)
    message.success(t('settings.success', 'Settings saved'))
    return true
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : String(reason))
    return false
  } finally {
    saving.value = false
  }
}

async function reload() {
  if (saving.value) return
  saving.value = true
  try {
    await refreshSettings(true)
    message.success(t('settings.plugins.reloaded', 'Settings reloaded'))
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : String(reason))
  } finally {
    saving.value = false
  }
}

watch(
  () => [props.extension.id, props.extension.version, props.extension.page?.entrypoint],
  loadPage,
  { immediate: true },
)

onBeforeUnmount(() => {
  loadGeneration += 1
  leavingPageRoot = pageRoot.value
})

onUnmounted(() => {
  const page = loadedPage
  loadedPage = null
  const disposeWhenDetached = () => {
    if (leavingPageRoot?.isConnected) {
      window.requestAnimationFrame(disposeWhenDetached)
      return
    }
    page?.dispose()
  }
  disposeWhenDetached()
})
</script>

<template>
  <div ref="pageRoot" class="extension-vue-page-host">
    <n-spin :show="loading || saving">
      <n-alert v-if="error" type="error" :show-icon="false">{{ error }}</n-alert>
      <component v-else-if="pageComponent" :is="pageComponent" :host="pageHost" />
      <footer v-if="settingsAdapter && settingsAdapter.showHostActions !== false" class="extension-page-actions">
        <n-button :disabled="saving" @click="reload">
          {{ t('settings.plugins.reload', 'Reload') }}
        </n-button>
        <n-button type="primary" :loading="saving" :disabled="!dirty || !valid" @click="save">
          {{ t('settings.plugins.save', 'Save') }}
        </n-button>
      </footer>
    </n-spin>
  </div>
</template>

<style scoped>
.extension-page-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 16px;
}
</style>
