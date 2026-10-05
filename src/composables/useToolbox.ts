import { computed, inject, onBeforeUnmount, onMounted, provide, reactive, ref, shallowRef, watch, type InjectionKey } from 'vue'
import { useMessage } from 'naive-ui'
import { api, extensionLocalizedText, type ExtensionStatus, type ExtensionSummary, type ExtensionToolboxItem } from '@/api/client'
import { toolbarLauncherActive } from '@/lib/toolbar-dock'
import { useAuth } from './useAuth'
import { hasPermission } from '@/build'
import { currentLanguage, t } from '@/i18n/runtime'
import { invalidateToolResources, toolCacheKey } from '@/extensions/toolboxRuntime'
import { parseToolboxPins, reorderToolboxPins, toolboxPinStorageKey, type ToolboxPin } from '@/lib/toolbox-pins'

export interface ToolboxTool {
  id: string
  title: string
  extensionName: string
  extension: ExtensionSummary
  item: ExtensionToolboxItem
}
export interface ToolInstance {
  id: string
  tool: ToolboxTool
  extension: ExtensionStatus
  cacheKey: string
  sequence: number
  trigger: HTMLElement | null
  windowSize?: { width: number; height: number }
}
export interface ToolActions { closeCheck: () => Promise<boolean> }
const key: InjectionKey<ReturnType<typeof useToolbox>> = Symbol('toolbox')

export function useToolbox() {
  const { auth, refresh: refreshAuth } = useAuth()
  const message = useMessage()
  const catalog = shallowRef<ExtensionSummary[]>([])
  const instances = shallowRef<ToolInstance[]>([])
  const pins = ref<ToolboxPin[]>([])
  const menuOpen = ref(false)
  const localFocus = ref(false)
  const loading = ref(false)
  const openingIds = shallowRef<string[]>([])
  const error = ref('')
  const activeId = ref('')
  const minimizedId = ref('')
  const mobile = ref(toolbarLauncherActive(window.innerWidth, window.innerHeight))
  const allowed = computed(() => auth.authenticated && hasPermission(auth, 'settings.view'))
  const namespace = computed(() => toolboxPinStorageKey(window.location.origin, auth.username))
  const tools = computed<ToolboxTool[]>(() => !allowed.value ? [] : catalog.value
    .filter(e => e.installed && e.enabled && e.version)
    .flatMap(extension => (extension.toolbox?.items || []).map(item => ({
      id: `${extension.id}/${item.id}`, item, extension,
      title: extensionLocalizedText(Object.fromEntries(Object.entries(item.i18n || {}).map(([locale, value]) => [locale, value.title])), currentLanguage.value, item.title),
      extensionName: extensionLocalizedText(Object.fromEntries(Object.entries(extension.i18n || {}).map(([locale, value]) => [locale, value.name])), currentLanguage.value, extension.name),
    })))
    .sort((a, b) => (a.item.order || 0) - (b.item.order || 0) || a.id.localeCompare(b.id)))
  const pinned = computed(() => pins.value.flatMap(pin => {
    const tool = tools.value.find(tool => tool.id === pin.toolId)
    return tool ? [{ pin, tool }] : []
  }).sort((a, b) => a.pin.order - b.pin.order || a.tool.id.localeCompare(b.tool.id)))
  const inputBlocked = computed(() => menuOpen.value || localFocus.value ||
    (mobile.value ? Boolean(activeId.value) : instances.value.some(i => i.tool.item.presentation === 'drawer')))
  const actions = new Map<string, ToolActions>()
  const opening = new Map<string, Promise<void>>()
  let generation = 0
  let sequence = 0
  let refreshTimer = 0
  let refreshPromise: Promise<void> | null = null
  let openingQueue: Promise<unknown> = Promise.resolve()

  function savePins() {
    try { localStorage.setItem(namespace.value, JSON.stringify({ schemaVersion: 2, items: pins.value })) } catch { /* In-memory preferences remain usable. */ }
  }
  function togglePin(id: string) {
    const exists = pins.value.some(p => p.toolId === id)
    pins.value = exists ? pins.value.filter(p => p.toolId !== id) : [...pins.value, { toolId: id, order: Math.max(0, ...pins.value.map(p => p.order)) + 1 }]
    savePins()
  }
  function reorderPin(sourceId: string, targetId: string) {
    const reordered = reorderToolboxPins(pins.value, sourceId, targetId)
    if (reordered === pins.value) return
    pins.value = reordered
    savePins()
  }
  function focus(id: string) {
    activeId.value = id
    if (minimizedId.value === id) minimizedId.value = ''
    instances.value = instances.value.map(i => i.id === id ? { ...i, sequence: ++sequence } : i)
    localFocus.value = true
    if (document.pointerLockElement) void document.exitPointerLock()
  }
  function minimizeForRecording(id: string) {
    if (!mobile.value || activeId.value !== id || !instances.value.some(instance => instance.id === id)) return
    minimizedId.value = id
    activeId.value = ''
    localFocus.value = false
    document.querySelector<HTMLElement>('.console-hid-layer')?.focus({ preventScroll: true })
  }
  function resizeWindow(id: string, size: { width: number; height: number }) {
    if (!instances.value.some(instance => instance.id === id)) return
    instances.value = instances.value.map(instance => instance.id === id ? { ...instance, windowSize: size } : instance)
  }
  function finishOpening(id: string) {
    openingIds.value = openingIds.value.filter(openingId => openingId !== id)
  }
  async function close(id: string, force = false) {
    const instance = instances.value.find(i => i.id === id)
    if (!instance) return true
    if (!force && actions.has(id) && !await actions.get(id)!.closeCheck()) return false
    instances.value = instances.value.filter(i => i.id !== id)
    finishOpening(id)
    if (minimizedId.value === id) minimizedId.value = ''
    actions.delete(id)
    if (activeId.value === id) activeId.value = [...instances.value].sort((a, b) => b.sequence - a.sequence)[0]?.id || ''
    localFocus.value = false
    if (!force) {
      if (instance.trigger?.isConnected) instance.trigger.focus()
      else document.querySelector<HTMLElement>('.console-hid-layer')?.focus()
    }
    return true
  }
  function acceptCatalog(next: ExtensionSummary[]) {
    catalog.value = next
    invalidateToolResources(allowed.value ? next : [])
    error.value = ''
    const wanted = new Map(tools.value.map(tool => [tool.id, tool]))
    for (const instance of instances.value) {
      const tool = wanted.get(instance.id)
      if (tool && toolCacheKey(tool.extension, tool.item) === instance.cacheKey) continue
      void close(instance.id, true)
      message.info(t('toolbox.invalidated'))
    }
    // Disabled extensions retain their pins; successful catalogs prove removals.
    const existingIds = new Set(next.filter(e => e.installed).flatMap(e => (e.toolbox?.items || []).map(i => `${e.id}/${i.id}`)))
    const failedIds = new Set(next.filter(e => e.error).map(e => e.id))
    pins.value = pins.value.filter(p => existingIds.has(p.toolId) || failedIds.has(p.toolId.split('/')[0]!))
    savePins()
  }
  async function refresh() {
    if (!allowed.value) return
    if (refreshPromise) return refreshPromise
    const current = generation
    loading.value = true
    refreshPromise = (async () => {
      try {
        const next = await api.getExtensions()
        if (generation === current) acceptCatalog(next)
      } catch (reason) {
        if (generation === current) error.value = reason instanceof Error ? reason.message : String(reason)
      } finally {
        if (generation === current) loading.value = false
        refreshPromise = null
        if (generation !== current && allowed.value) void refresh()
      }
    })()
    return refreshPromise
  }
  async function openNow(id: string, trigger: HTMLElement | null, current: number) {
    if (!allowed.value || current !== generation) return
    menuOpen.value = false
    const existing = instances.value.find(i => i.id === id)
    if (existing) { focus(id); return }
    const tool = tools.value.find(t => t.id === id)
    if (!tool) return
    if (tool.item.presentation === 'drawer') {
      const drawer = instances.value.find(i => i.tool.item.presentation === 'drawer')
      if (drawer && !await close(drawer.id)) return
    }
    try {
      const extension = await api.getExtension(tool.extension.id)
      if (current !== generation || !allowed.value) return
      const item = extension.toolbox?.items.find(i => `${extension.id}/${i.id}` === id)
      if (!extension.enabled || !item || toolCacheKey(extension, item) !== toolCacheKey(tool.extension, tool.item)) {
        await refresh()
        throw new Error(t('toolbox.invalidated'))
      }
      const updatedTool = { ...tool, extension, item }
      instances.value = [...instances.value, { id, tool: updatedTool, extension, trigger, sequence: ++sequence, cacheKey: toolCacheKey(extension, item) }]
      focus(id)
    } catch (reason) { message.error(reason instanceof Error ? reason.message : String(reason)) }
  }
  function open(id: string, trigger: HTMLElement | null = document.activeElement instanceof HTMLElement ? document.activeElement : null) {
    const existing = opening.get(id)
    if (existing) return existing
    if (instances.value.some(instance => instance.id === id)) {
      focus(id)
      return Promise.resolve()
    }
    const current = generation
    openingIds.value = [...openingIds.value, id]
    const request = openingQueue.then(() => openNow(id, trigger, current))
    openingQueue = request.catch(() => undefined)
    opening.set(id, request)
    const finish = () => {
      opening.delete(id)
      if (!instances.value.some(instance => instance.id === id)) finishOpening(id)
    }
    void request.then(finish, finish)
    return request
  }
  function registerActions(id: string, value: ToolActions) {
    actions.set(id, value)
    return () => { if (actions.get(id) === value) actions.delete(id) }
  }
  function resize() { mobile.value = toolbarLauncherActive(window.innerWidth, window.innerHeight) }
  function resume() { if (document.visibilityState === 'visible') { void refreshAuth(); void refresh() } }
  function onLocalFocus(event: Event) {
    const target = event.target
    if (!(target instanceof Element)) return
    if (target.closest('[data-toolbox-local]')) {
      localFocus.value = true
      if (document.pointerLockElement) void document.exitPointerLock()
    } else if (target.closest('.console-hid-layer, .console-stage')) localFocus.value = false
  }
  watch([() => auth.username, allowed, () => auth.permissions.join(',')], () => {
    generation++
    instances.value = []
    openingIds.value = []
    minimizedId.value = ''
    actions.clear()
    catalog.value = []
    menuOpen.value = localFocus.value = false
    invalidateToolResources([])
    try { pins.value = allowed.value ? parseToolboxPins(localStorage.getItem(namespace.value)) : [] } catch { pins.value = [] }
    void refresh()
  }, { immediate: true })
  onMounted(() => {
    refreshTimer = window.setInterval(resume, 15000)
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('online', resume)
    window.addEventListener('resize', resize)
    window.addEventListener('onekvm:extensions-changed', resume)
    document.addEventListener('pointerdown', onLocalFocus, true)
    document.addEventListener('focusin', onLocalFocus, true)
  })
  onBeforeUnmount(() => {
    window.clearInterval(refreshTimer)
    generation++
    invalidateToolResources([])
    document.removeEventListener('visibilitychange', resume)
    window.removeEventListener('online', resume)
    window.removeEventListener('resize', resize)
    window.removeEventListener('onekvm:extensions-changed', resume)
    document.removeEventListener('pointerdown', onLocalFocus, true)
    document.removeEventListener('focusin', onLocalFocus, true)
  })
  const toolbox = reactive({ allowed, tools, instances, pins, pinned, menuOpen, localFocus, inputBlocked, loading, openingIds, error, activeId, minimizedId,
    refresh, acceptCatalog, togglePin, reorderPin, open, focus, close, minimizeForRecording, resizeWindow, finishOpening, registerActions })
  provide(key, toolbox)
  return toolbox
}

export function useToolboxContext() {
  const toolbox = inject(key)
  if (!toolbox) throw new Error('Toolbox workspace is missing')
  return toolbox
}
