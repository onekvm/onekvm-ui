import {
  computed,
  createBlock,
  createCommentVNode,
  createElementBlock,
  createElementVNode,
  createTextVNode,
  createVNode,
  defineComponent,
  Fragment,
  h,
  inject,
  markRaw,
  mergeProps,
  nextTick,
  normalizeClass,
  normalizeStyle,
  onBeforeUnmount,
  onMounted,
  openBlock,
  provide,
  reactive,
  ref,
  renderList,
  resolveComponent,
  shallowRef,
  Teleport,
  toDisplayString,
  unref,
  watch,
  withCtx,
  withDirectives,
  withModifiers,
  vModelCheckbox,
  vModelSelect,
  vModelText,
  type Component,
  type ComputedRef,
  type Ref,
} from 'vue'
import * as naiveUI from 'naive-ui'
import {
  NCard,
  NCollapse,
  NCollapseItem,
  NDivider,
  NEmpty,
  NSpace,
  NText,
  NUpload,
  NUploadDragger,
} from 'naive-ui'
import { icons as lucideIcons } from '@lucide/vue'

import {
  api,
  extensionAssetURL,
  extensionLocalizedText,
  type ExtensionSettingValue,
  type ExtensionStatus,
  type ExtensionSummary,
  type OneKVMStatus,
  type RemoveExtensionOptions,
} from '@/api/client'
import { currentLanguage } from '@/i18n/runtime'
import { assertToolbarRegistrationId, isToolbarSlot, sortToolbarItems, type ToolbarSlot } from '@/lib/toolbar-extensions'
import { assertShellMethods, assertShellRegistrationId } from '@/lib/extension-shell'
import XpStorageDirectoryPicker from '@/components/XpStorageDirectoryPicker.vue'
import { registerTool } from './toolboxRuntime'

export interface ExtensionPageSettingsAdapterV1 {
  dirty: Readonly<Ref<boolean>>
  valid: Readonly<Ref<boolean>>
  collect: () => Record<string, ExtensionSettingValue>
  reset: (settings: Record<string, ExtensionSettingValue>) => void
  showHostActions?: boolean
}

export interface ExtensionPageHostV1 {
  readonly apiVersion: 1
  readonly extension: Readonly<ComputedRef<ExtensionStatus>>
  readonly getStatus: () => Promise<OneKVMStatus>
  readonly assetURL: (path: string) => string
  readonly invoke: <T = unknown>(method: string, payload?: unknown) => Promise<T>
  readonly removeExtension: (id: string, options?: RemoveExtensionOptions) => Promise<{ status: string }>
  readonly uninstallExtension: (target: { id: string; name: string }) => Promise<boolean>
  readonly saveSettings: () => Promise<boolean>
  readonly registerSettings: (adapter: ExtensionPageSettingsAdapterV1) => () => void
}

export interface VueExtensionPageDefinitionV1 {
  apiVersion: 1
  component: Component
  styles?: string[]
}

export type ToolbarSlotV1 = ToolbarSlot

export interface ToolbarItemDefinitionV1 {
  slot: ToolbarSlotV1
  order?: number
  component: Component
}

export interface ToolbarRegistrationV1 {
  apiVersion: 1
  items: ToolbarItemDefinitionV1[]
}

export interface ExtensionShellHostV1 {
  readonly apiVersion: 1
  readonly extension: Readonly<ExtensionSummary>
  readonly invoke: <T = unknown>(method: string, payload?: unknown) => Promise<T>
}

export type ExtensionShellMethodV1 = (
  host: ExtensionShellHostV1,
  payload?: unknown,
) => unknown | Promise<unknown>

export interface ExtensionShellRegistrationV1 {
  apiVersion: 1
  methods: Record<string, ExtensionShellMethodV1>
}

export interface LoadedToolbarItem {
  extensionId: string
  slot: ToolbarSlotV1
  order: number
  component: Component
}

export interface PluginUIXtermV1 {
  Terminal: (typeof import('@xterm/xterm'))['Terminal']
  FitAddon: (typeof import('@xterm/addon-fit'))['FitAddon']
}

interface PluginUIRuntimeV1 {
  vue: Record<string, unknown>
  naive: Record<string, unknown>
  i18n: PluginUII18nV1
  icons: Record<string, Component>
  language: () => string
  xterm: { load: () => Promise<PluginUIXtermV1> }
  dialogs: { StorageDirectoryPicker: Component }
  register: (id: string, definition: VueExtensionPageDefinitionV1) => void
  toolbar: { register: (id: string, definition: ToolbarRegistrationV1) => void }
  shell: { register: (id: string, definition: ExtensionShellRegistrationV1) => void }
  toolbox: { register: (extensionId: string, toolId: string, definition: VueExtensionPageDefinitionV1) => void }
}

type PluginMessageValuesV1 = Record<string, string | number>
type PluginMessagesV1 = Record<string, Record<string, string>>

interface PluginUII18nV1 {
  createTranslator: (messages: PluginMessagesV1) => (key: string, values?: PluginMessageValuesV1) => string
  createMessages: (messages: PluginMessagesV1) => Readonly<Record<string, string>>
}

declare global {
  interface Window {
    OneKVMPluginUI?: { v1: PluginUIRuntimeV1 }
  }
}

const registrations = new Map<string, VueExtensionPageDefinitionV1>()
const toolbarRegistrations = new Map<string, ToolbarRegistrationV1>()
const shellRegistrations = new Map<string, ExtensionShellRegistrationV1>()
const shellExtensions = new Map<string, ExtensionSummary>()
const toolbarItemsState = shallowRef<LoadedToolbarItem[]>([])
let loadingToolbarId: string | null = null
let loadingPageId: string | null = null
let loadingShellId: string | null = null

function publishToolbarItems() {
  const items: LoadedToolbarItem[] = []
  for (const [extensionId, definition] of toolbarRegistrations) {
    for (const item of definition.items || []) {
      if (!item?.component || !isToolbarSlot(item.slot)) continue
      items.push({
        extensionId,
        slot: item.slot,
        order: Number.isFinite(item.order) ? Number(item.order) : 0,
        component: markRaw(item.component),
      })
    }
  }
  toolbarItemsState.value = sortToolbarItems(items)
}

function registerToolbar(id: string, definition: ToolbarRegistrationV1) {
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(id)) throw new Error('Invalid extension toolbar ID')
  assertToolbarRegistrationId(id, loadingToolbarId)
  if (definition?.apiVersion !== 1 || !Array.isArray(definition.items)) {
    throw new Error(`Extension ${id} does not provide a compatible toolbar`)
  }
  toolbarRegistrations.set(id, definition)
  publishToolbarItems()
}

function registerShell(id: string, definition: ExtensionShellRegistrationV1) {
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(id)) throw new Error('Invalid extension shell ID')
  assertShellRegistrationId(id, loadingShellId)
  if (definition?.apiVersion !== 1 || !definition.methods || typeof definition.methods !== 'object') {
    throw new Error(`Extension ${id} does not provide a compatible shell contribution`)
  }
  assertShellMethods(definition.methods)
  shellRegistrations.set(id, markRaw(definition))
}

export function extensionShellAvailable(id: string, method?: string) {
  const definition = shellRegistrations.get(id)
  return Boolean(definition && (!method || typeof definition.methods[method] === 'function'))
}

export async function invokeExtensionShell<T = unknown>(id: string, method: string, payload: unknown = null): Promise<T> {
  const definition = shellRegistrations.get(id)
  const extension = shellExtensions.get(id)
  if (!definition || !extension) throw new Error(`Extension shell ${id} is unavailable`)
  const handler = definition.methods[method]
  if (typeof handler !== 'function') throw new Error(`Extension shell ${id} does not register method ${method}`)
  const host: ExtensionShellHostV1 = Object.freeze({
    apiVersion: 1,
    extension: Object.freeze({ ...extension }),
    invoke: <T = unknown>(backendMethod: string, backendPayload: unknown = null) => (
      api.invokeExtension<T>(id, backendMethod, backendPayload)
    ),
  })
  return await handler(host, payload) as T
}

export function toolbarItemsFor(slot: ToolbarSlotV1) {
  return computed(() => toolbarItemsState.value.filter((item) => item.slot === slot))
}

function createTranslator(messages: PluginMessagesV1) {
  const fallback = messages.default || messages.en || Object.values(messages)[0] || {}
  const localized = new Map<string, Record<string, string>>()
  for (const [locale, catalog] of Object.entries(messages)) {
    for (const [key, value] of Object.entries(catalog)) {
      const translations = localized.get(key) || {}
      translations[locale] = value
      localized.set(key, translations)
    }
  }
  return (key: string, values: PluginMessageValuesV1 = {}) => {
    const template = extensionLocalizedText(localized.get(key), currentLanguage.value, fallback[key] || key)
    return template.replace(/\{([^{}]+)\}/g, (placeholder, name: string) => (
      Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : placeholder
    ))
  }
}

function createMessages(messages: PluginMessagesV1) {
  const translate = createTranslator(messages)
  return Object.freeze(new Proxy<Record<string, string>>({}, {
    get: (_target, key) => typeof key === 'string' ? translate(key) : undefined,
  }))
}

function register(id: string, definition: VueExtensionPageDefinitionV1) {
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(id)) throw new Error('Invalid extension page ID')
  if (!loadingPageId) {
    throw new Error('Extension page registration is only allowed while the host is loading that extension')
  }
  if (id !== loadingPageId) {
    throw new Error(`Extension page ID ${id} does not match ${loadingPageId}`)
  }
  if (definition?.apiVersion !== 1 || !definition.component) {
    throw new Error(`Extension ${id} does not provide a compatible Vue page`)
  }
  registrations.set(id, markRaw(definition))
}

let xtermLoader: Promise<PluginUIXtermV1> | null = null

async function loadXterm(): Promise<PluginUIXtermV1> {
  const [{ Terminal }, { FitAddon }] = await Promise.all([
    import('@xterm/xterm'),
    import('@xterm/addon-fit'),
    import('@xterm/xterm/css/xterm.css'),
  ])
  return { Terminal, FitAddon }
}

function loadHostXterm() {
  if (!xtermLoader) xtermLoader = loadXterm()
  return xtermLoader
}

const vueRuntime = Object.freeze({
  computed,
  createBlock,
  createCommentVNode,
  createElementBlock,
  createElementVNode,
  createTextVNode,
  createVNode,
  defineComponent,
  Fragment,
  h,
  inject,
  markRaw,
  mergeProps,
  nextTick,
  normalizeClass,
  normalizeStyle,
  onBeforeUnmount,
  onMounted,
  openBlock,
  provide,
  reactive,
  ref,
  renderList,
  resolveComponent,
  shallowRef,
  Teleport,
  toDisplayString,
  unref,
  watch,
  withCtx,
  withDirectives,
  withModifiers,
  vModelCheckbox,
  vModelSelect,
  vModelText,
})

// Extension pages are loaded as independent Vue bundles. Expose the complete
// Naive UI surface so pages can use the same component library as the host
// without silently failing when a component is not in a hand-maintained list.
const naiveRuntime = Object.freeze({
  ...naiveUI,
  NCard,
  NCollapse,
  NCollapseItem,
  NDivider,
  NEmpty,
  NSpace,
  NText,
  NUpload,
  NUploadDragger,
})

window.OneKVMPluginUI = {
  v1: Object.freeze({
    vue: vueRuntime,
    naive: naiveRuntime,
    i18n: Object.freeze({ createTranslator, createMessages }),
    icons: Object.freeze(lucideIcons as Record<string, Component>),
    language: () => currentLanguage.value,
    xterm: Object.freeze({ load: loadHostXterm }),
    dialogs: Object.freeze({ StorageDirectoryPicker: markRaw(XpStorageDirectoryPicker) }),
    register,
    toolbar: Object.freeze({ register: registerToolbar }),
    shell: Object.freeze({ register: registerShell }),
    toolbox: Object.freeze({ register: registerTool }),
  }),
}

export interface LoadedVueExtensionPage {
  component: Component
  dispose: () => void
}

const loadedToolbarScripts = new Map<string, HTMLScriptElement>()
const loadedShellScripts = new Map<string, HTMLScriptElement>()
const pendingShellLoads = new Map<string, Promise<void>>()
let shellLoadQueue: Promise<void> = Promise.resolve()

async function loadExtensionShell(extension: ExtensionSummary) {
  if (!extension.version || !extension.shell?.entrypoint) {
    throw new Error(`Extension ${extension.id} does not register shell methods`)
  }
  const key = `${extension.id}@${extension.version}`
  if (loadedShellScripts.has(key) && shellRegistrations.has(extension.id)) {
    shellExtensions.set(extension.id, extension)
    return
  }
  shellRegistrations.delete(extension.id)
  const script = document.createElement('script')
  script.async = true
  script.dataset.onekvmShell = key
  script.src = extensionAssetURL(extension, extension.shell.entrypoint)
  const loaded = new Promise<void>((resolve, reject) => {
    script.addEventListener('load', () => resolve(), { once: true })
    script.addEventListener('error', () => reject(new Error(`Failed to load ${extension.name} shell methods`)), { once: true })
  })
  loadingShellId = extension.id
  document.head.append(script)
  try {
    await loaded
    if (!shellRegistrations.has(extension.id)) {
      throw new Error(`Extension ${extension.id} did not register its shell methods`)
    }
    loadedShellScripts.set(key, script)
    shellExtensions.set(extension.id, extension)
  } catch (reason) {
    script.remove()
    shellRegistrations.delete(extension.id)
    shellExtensions.delete(extension.id)
    throw reason
  } finally {
    loadingShellId = null
  }
}

export function ensureExtensionShell(extension: ExtensionSummary): Promise<void> {
  const key = `${extension.id}@${extension.version || ''}`
  const pending = pendingShellLoads.get(key)
  if (pending) return pending
  const load = shellLoadQueue.then(() => loadExtensionShell(extension))
  shellLoadQueue = load.catch(() => undefined)
  pendingShellLoads.set(key, load)
  void load.then(
    () => pendingShellLoads.delete(key),
    () => pendingShellLoads.delete(key),
  )
  return load
}

export async function loadExtensionShells(extensions: ExtensionSummary[]) {
  const wanted = extensions.filter((extension) => extension.installed && extension.version && extension.shell?.entrypoint)
  const wantedIds = new Set(wanted.map((extension) => extension.id))
  const wantedKeys = new Set(wanted.map((extension) => `${extension.id}@${extension.version}`))
  for (const extension of wanted) {
    try {
      await ensureExtensionShell(extension)
    } catch (error) {
      console.warn(error)
    }
  }
  for (const [key, script] of loadedShellScripts) {
    if (wantedKeys.has(key)) continue
    script.remove()
    loadedShellScripts.delete(key)
  }
  for (const id of [...shellRegistrations.keys()]) {
    if (wantedIds.has(id)) continue
    shellRegistrations.delete(id)
    shellExtensions.delete(id)
  }
}

export async function loadExtensionToolbars(extensions: ExtensionSummary[]) {
  const wantedIds = new Set<string>()
  const wantedKeys = new Set<string>()
  for (const extension of extensions) {
    if (!extension.enabled || !extension.version || !extension.toolbar?.entrypoint) continue
    wantedIds.add(extension.id)
    const key = `${extension.id}@${extension.version}`
    wantedKeys.add(key)
    if (loadedToolbarScripts.has(key)) continue
    const script = document.createElement('script')
    script.async = true
    script.dataset.onekvmToolbar = key
    script.src = extensionAssetURL(extension, extension.toolbar.entrypoint)
    const loaded = new Promise<void>((resolve, reject) => {
      script.addEventListener('load', () => resolve(), { once: true })
      script.addEventListener('error', () => reject(new Error(`Failed to load ${extension.name} toolbar`)), { once: true })
    })
    loadingToolbarId = extension.id
    document.head.append(script)
    try {
      await loaded
      loadedToolbarScripts.set(key, script)
    } catch (error) {
      script.remove()
      console.warn(error)
    } finally {
      loadingToolbarId = null
    }
  }
  for (const [key, script] of loadedToolbarScripts) {
    if (wantedKeys.has(key)) continue
    script.remove()
    loadedToolbarScripts.delete(key)
  }
  for (const id of [...toolbarRegistrations.keys()]) {
    if (!wantedIds.has(id)) toolbarRegistrations.delete(id)
  }
  publishToolbarItems()
}

export async function loadVueExtensionPage(extension: ExtensionStatus): Promise<LoadedVueExtensionPage> {
  if (!extension.version || !extension.page || extension.page.renderer !== 'vue') {
    throw new Error('Extension does not register a Vue page')
  }

  registrations.delete(extension.id)
  const script = document.createElement('script')
  script.async = true
  script.src = extensionAssetURL(extension, extension.page.entrypoint)
  const loaded = new Promise<void>((resolve, reject) => {
    script.addEventListener('load', () => resolve(), { once: true })
    script.addEventListener('error', () => reject(new Error(`Failed to load ${extension.name} page`)), { once: true })
  })
  loadingPageId = extension.id
  document.head.append(script)

  try {
    await loaded
    const definition = registrations.get(extension.id)
    if (!definition) throw new Error(`Extension ${extension.id} did not register its Vue page`)
    const styles = (definition.styles || []).map((content) => {
      const style = document.createElement('style')
      style.dataset.onekvmExtension = extension.id
      style.textContent = content
      document.head.append(style)
      return style
    })
    return {
      component: markRaw(definition.component),
      dispose: () => {
        script.remove()
        styles.forEach((style) => style.remove())
        registrations.delete(extension.id)
      },
    }
  } catch (reason) {
    script.remove()
    registrations.delete(extension.id)
    throw reason
  } finally {
    loadingPageId = null
  }
}

export function validateExtensionSettings(
  extension: ExtensionStatus,
  update: Record<string, ExtensionSettingValue>,
): string | null {
  const schema = extension.settings_schema
  const merged = { ...extension.settings, ...update }
  for (const name of schema.required || []) {
    const value = merged[name]
    if (value === undefined || value === null || value === '') return `${name} is required`
  }
  for (const [name, value] of Object.entries(update)) {
    const property = schema.properties[name]
    if (!property) {
      if (!schema.additionalProperties) return `Unknown setting ${name}`
      continue
    }
    if (property.readOnly) return `${name} is read-only`
    if (value === null) continue
    if (property.type === 'boolean' && typeof value !== 'boolean') return `${name} must be a boolean`
    if (property.type === 'string' && typeof value !== 'string') return `${name} must be a string`
    if ((property.type === 'integer' || property.type === 'number') && typeof value !== 'number') return `${name} must be a number`
    if (property.type === 'integer' && typeof value === 'number' && !Number.isInteger(value)) return `${name} must be an integer`
    if (typeof value === 'string' && property.maxLength !== undefined && value.length > property.maxLength) {
      return `${name} exceeds its maximum length`
    }
    if (typeof value === 'number' && property.minimum !== undefined && value < property.minimum) return `${name} is too small`
    if (typeof value === 'number' && property.maximum !== undefined && value > property.maximum) return `${name} is too large`
  }
  return null
}
