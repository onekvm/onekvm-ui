<script setup lang="ts">
import { computed, h, markRaw, onErrorCaptured, onBeforeUnmount, onUnmounted, shallowRef, watch, type Component } from 'vue'
import { NButton, NSpace, useDialog, useMessage } from 'naive-ui'
import { api, extensionAssetURL, type ExtensionStatus } from '@/api/client'
import { validateExtensionSettings, type ExtensionPageSettingsAdapterV1 } from '@/extensions/pluginUi'
import { loadExtensionTool, type ExtensionToolHostV1, type ToolPresentation } from '@/extensions/toolboxRuntime'
import { useToolboxContext, type ToolInstance } from '@/composables/useToolbox'
import { t } from '@/i18n/runtime'
import { onekvm, type HIDReportListener } from '@/lib/onekvm'

const props = defineProps<{ instance: ToolInstance; presentation: ToolPresentation }>()
const toolbox = useToolboxContext()
const message = useMessage()
const dialog = useDialog()
const component = shallowRef<Component | null>(null)
const extension = shallowRef<ExtensionStatus>(props.instance.extension)
const adapter = shallowRef<ExtensionPageSettingsAdapterV1 | null>(null)
const loading = shallowRef(false)
const saving = shallowRef(false)
const error = shallowRef('')
const root = shallowRef<HTMLElement | null>(null)
let leavingRoot: HTMLElement | null = null
let loaded: Awaited<ReturnType<typeof loadExtensionTool>> | null = null
let generation = 0
let pendingClose: Promise<boolean> | null = null
let cancelClose: (() => void) | null = null
onErrorCaptured((reason) => {
  error.value = reason instanceof Error ? reason.message : String(reason)
  component.value = null
  return false
})

async function save(): Promise<boolean> {
  const settings = adapter.value
  if (!settings || !settings.valid.value || saving.value) return false
  saving.value = true
  try {
    const update = settings.collect()
    const invalid = validateExtensionSettings(extension.value, update)
    if (invalid) throw new Error(invalid)
    await api.updateExtension(extension.value.id, { settings: update })
    extension.value = await api.getExtension(extension.value.id)
    settings.reset(extension.value.settings)
    message.success(t('settings.success', 'Settings saved'))
    return true
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : String(reason))
    return false
  } finally { saving.value = false }
}

function closeCheck(): Promise<boolean> {
  if (!adapter.value?.dirty.value) return Promise.resolve(true)
  if (pendingClose) return pendingClose
  pendingClose = new Promise<boolean>(resolve => {
    const prompt = dialog.warning({
      title: t('toolbox.unsavedTitle'), content: t('toolbox.unsaved'),
      maskClosable: true,
      action: () => h(NSpace, { justify: 'end' }, { default: () => [
        h(NButton, { onClick: () => { resolve(false); prompt.destroy() } }, { default: () => t('common.cancel', 'Cancel') }),
        h(NButton, { onClick: () => { resolve(true); prompt.destroy() } }, { default: () => t('toolbox.discard') }),
        h(NButton, { type: 'primary', loading: saving.value, disabled: !adapter.value?.valid.value, onClick: async () => {
          if (await save()) { resolve(true); prompt.destroy() }
        } }, { default: () => t('toolbox.save') }),
      ] }),
      onClose: () => { resolve(false) },
      onMaskClick: () => { resolve(false) },
      onEsc: () => { resolve(false) },
    })
    cancelClose = () => { resolve(false); prompt.destroy() }
  }).finally(() => { pendingClose = null; cancelClose = null })
  return pendingClose
}
const unregister = toolbox.registerActions(props.instance.id, { closeCheck })
const host = markRaw<ExtensionToolHostV1>(Object.freeze({
  apiVersion: 1,
  toolId: props.instance.id,
  extension: computed(() => extension.value),
  presentation: computed(() => props.presentation),
  getStatus: api.getStatus,
  assetURL: (path: string) => extensionAssetURL(extension.value, path),
  invoke: <T = unknown>(method: string, payload: unknown = null) => {
    if (!toolbox.allowed || !toolbox.instances.some(instance => instance.cacheKey === props.instance.cacheKey)) {
      return Promise.reject(new Error(t('toolbox.invalidated')))
    }
    return api.invokeExtension<T>(extension.value.id, method, payload)
  },
  subscribeHIDReports: (listener: HIDReportListener) => {
    if (extension.value.id !== 'hid-macro' || !toolbox.allowed ||
        !toolbox.instances.some(instance => instance.cacheKey === props.instance.cacheKey)) {
      throw new Error(t('toolbox.invalidated'))
    }
    return onekvm.subscribeHIDReports(listener)
  },
  showConsoleWhileRecording: () => {
    if (extension.value.id !== 'hid-macro') throw new Error(t('toolbox.invalidated'))
    toolbox.minimizeForRecording(props.instance.id)
    return () => { if (toolbox.minimizedId === props.instance.id) toolbox.focus(props.instance.id) }
  },
  resizeWindow: (size: { width: number; height: number }) => toolbox.resizeWindow(props.instance.id, size),
  close: () => toolbox.close(props.instance.id),
  saveSettings: save,
  registerSettings: (value: ExtensionPageSettingsAdapterV1) => {
    adapter.value = markRaw(value)
    return () => { if (adapter.value === value) adapter.value = null }
  },
}))

async function load() {
  const current = ++generation
  component.value = null
  loaded?.dispose()
  loaded = null
  adapter.value = null
  loading.value = true
  error.value = ''
  try {
    const result = await loadExtensionTool(props.instance.extension, props.instance.tool.item)
    if (current !== generation) { result.dispose(); return }
    loaded = result
    component.value = result.component
  } catch (reason) {
    if (current === generation) error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    if (current === generation) {
      loading.value = false
      toolbox.finishOpening(props.instance.id)
    }
  }
}
watch(() => props.instance.cacheKey, load, { immediate: true })
onBeforeUnmount(() => { cancelClose?.(); generation++; unregister(); leavingRoot = root.value })
onUnmounted(() => {
  const resource = loaded
  const release = () => {
    if (leavingRoot?.isConnected) { window.requestAnimationFrame(release); return }
    resource?.dispose()
  }
  release()
})
</script>

<template>
  <div ref="root" class="extension-tool-view">
    <n-spin v-if="loading" class="tool-loading" />
    <n-alert v-else-if="error" type="error" :show-icon="false">
      {{ error }}
      <n-button class="tool-retry" @click="load">{{ t('toolbox.retry') }}</n-button>
    </n-alert>
    <component v-else-if="component" :is="component" :host="host" />
    <footer v-if="adapter && adapter.showHostActions !== false" class="tool-settings-actions">
      <n-button :disabled="saving" @click="adapter.reset(extension.settings)">{{ t('toolbox.discard') }}</n-button>
      <n-button type="primary" :loading="saving" :disabled="!adapter.dirty.value || !adapter.valid.value" @click="save">
        {{ t('toolbox.save') }}
      </n-button>
    </footer>
  </div>
</template>

<style scoped>
.extension-tool-view { min-height: 0; }
.tool-loading { display: flex; justify-content: center; padding: 32px; }
.tool-retry { margin-inline-start: 12px; }
.tool-settings-actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 16px; }
</style>
