<script setup lang="ts">
import { computed, markRaw, onBeforeUnmount, onMounted, watch } from 'vue'
import { api, extensionAssetURL } from '@/api/client'
import { useAuth } from '@/composables/useAuth'
import { hasPermission } from '@/build'
import { useOverlayMount } from '@/composables/useOverlayMount'
import {
  independentWindows, reconcileIndependentWindows, registerIndependentWindowHost,
  removeIndependentWindow, setIndependentWindowsAvailable, type IndependentWindow,
} from '@/extensions/independentWindows'

const { auth } = useAuth()
const overlayTarget = useOverlayMount()
const allowed = computed(() => auth.authenticated && hasPermission(auth, 'settings.view'))
const hosts = new WeakMap<IndependentWindow, object>()
let generation = 0
function setInstance(window: IndependentWindow, instance: unknown) {
  window.instance.value = instance as { focus?: () => void } | null
}
function host(window: IndependentWindow) {
  const previous = hosts.get(window)
  if (previous) return previous
  const check = () => {
    if (!allowed.value || !independentWindows.value.includes(window)) throw new Error('Window is unavailable')
  }
  const value = markRaw(Object.freeze({
    apiVersion: 1 as const,
    extension: computed(() => window.extension.value),
    overlayTarget,
    getStatus: () => { check(); return api.getStatus() },
    assetURL: (path: string) => { check(); return extensionAssetURL(window.extension.value, path) },
    invoke: (method: string, payload: unknown = null) => { check(); return api.invokeExtension(window.extension.value.id, method, payload) },
  }))
  window.disposeHost = registerIndependentWindowHost(value)
  hosts.set(window, value)
  return value
}
async function refresh() {
  const current = ++generation
  if (!allowed.value || !independentWindows.value.length) return
  try {
    const catalog = await api.getExtensions()
    if (generation === current && allowed.value) reconcileIndependentWindows(catalog)
  } catch { /* Keep existing windows when the catalog is temporarily unavailable. */ }
}
watch(allowed, value => {
  setIndependentWindowsAvailable(value)
  if (value) void refresh()
}, { immediate: true, flush: 'sync' })
watch(() => independentWindows.value.length, (count, previous) => {
  if (count && !previous) void refresh()
})
onMounted(() => window.addEventListener('onekvm:extensions-changed', refresh))
onBeforeUnmount(() => {
  generation++
  setIndependentWindowsAvailable(false)
  window.removeEventListener('onekvm:extensions-changed', refresh)
})
</script>

<template>
  <component v-for="window in independentWindows" :key="window.instanceId" :is="window.component"
    v-bind="window.props" :host="host(window)" :open="window.open.value"
    :ref="(instance: unknown) => setInstance(window, instance)"
    @close="window.open.value = false" @closed="removeIndependentWindow(window.key, window.instanceId)" />
</template>
