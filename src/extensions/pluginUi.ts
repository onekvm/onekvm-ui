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

import {
  extensionAssetURL,
  extensionLocalizedText,
  type ExtensionSettingValue,
  type ExtensionStatus,
  type OneKVMStatus,
} from '@/api/client'
import { currentLanguage } from '@/i18n/runtime'

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
  readonly saveSettings: () => Promise<boolean>
  readonly registerSettings: (adapter: ExtensionPageSettingsAdapterV1) => () => void
}

export interface VueExtensionPageDefinitionV1 {
  apiVersion: 1
  component: Component
  styles?: string[]
}

export interface PluginUIXtermV1 {
  Terminal: (typeof import('@xterm/xterm'))['Terminal']
  FitAddon: (typeof import('@xterm/addon-fit'))['FitAddon']
}

interface PluginUIRuntimeV1 {
  vue: Record<string, unknown>
  naive: Record<string, unknown>
  i18n: PluginUII18nV1
  xterm: { load: () => Promise<PluginUIXtermV1> }
  register: (id: string, definition: VueExtensionPageDefinitionV1) => void
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
    xterm: Object.freeze({ load: loadHostXterm }),
    register,
  }),
}

export interface LoadedVueExtensionPage {
  component: Component
  dispose: () => void
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
