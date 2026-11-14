import { computed, defineComponent, h, onBeforeUnmount, onMounted, shallowRef, watch, type Component, type PropType } from 'vue'

import type { ExtensionStatus, ExtensionSettingValue } from '@/api/client'
import { currentLanguage } from '@/i18n/runtime'
import type { OneKVMThemeSummary } from '@/theme/types'
import type { ExtensionPageHostV1, ExtensionPageSettingsAdapterV1, VueExtensionPageDefinitionV1 } from './pluginUi'
import type { ExtensionToolHostV1 } from './toolboxRuntime'

export type ExtensionViewRenderer = 'vue' | 'web-component'
export interface WebComponentExtensionViewV1 {
  apiVersion: 1
  element: CustomElementConstructor
  styles?: string[]
}
export type ExtensionViewDefinitionV1 = VueExtensionPageDefinitionV1 | WebComponentExtensionViewV1
export interface WebComponentSettingsV1 {
  dirty?: boolean
  valid?: boolean
  collect: () => Record<string, ExtensionSettingValue>
  reset: (settings: Record<string, ExtensionSettingValue>) => void
  showHostActions?: boolean
}
export interface WebComponentSettingsRegistrationV1 {
  update: (state: { dirty?: boolean; valid?: boolean }) => void
  dispose: () => void
}
export interface WebComponentHostV1 {
  readonly apiVersion: 1
  readonly extension: Readonly<ExtensionStatus>
  readonly language: string
  readonly theme: OneKVMThemeSummary | undefined
  readonly presentation: 'page' | 'drawer' | 'window' | 'fullscreen'
  readonly toolId?: string
  readonly getStatus: ExtensionPageHostV1['getStatus']
  readonly assetURL: ExtensionPageHostV1['assetURL']
  readonly invoke: ExtensionPageHostV1['invoke']
  readonly saveSettings: ExtensionPageHostV1['saveSettings']
  readonly registerSettings: (adapter: WebComponentSettingsV1) => WebComponentSettingsRegistrationV1
  readonly close?: ExtensionToolHostV1['close']
  readonly resizeWindow?: ExtensionToolHostV1['resizeWindow']
  readonly setWindowState?: ExtensionToolHostV1['setWindowState']
  readonly captureFrame?: ExtensionToolHostV1['captureFrame']
}

type ViewHost = ExtensionPageHostV1 | ExtensionToolHostV1
const wrappers = new WeakMap<CustomElementConstructor, Component>()
let nextElement = 0

function wrapElement(constructor: CustomElementConstructor): Component {
  const existing = wrappers.get(constructor)
  if (existing) return existing
  let tag: string
  do { tag = `onekvm-extension-view-${++nextElement}` } while (customElements.get(tag))
  // A distinct subclass allows the same Lit/native constructor in multiple
  // views, including constructors already registered by their library.
  customElements.define(tag, class extends constructor {})
  const component = defineComponent({
    name: 'ExtensionWebComponentView',
    props: { host: { type: Object as PropType<ViewHost>, required: true } },
    setup(props) {
      const element = shallowRef<HTMLElement | null>(null)
      const cleanups = new Set<() => void>()
      let active = true
      const assertActive = () => { if (!active) throw new Error('Extension view is no longer active') }
      const tool = 'toolId' in props.host ? props.host : undefined
      const bridge: WebComponentHostV1 = Object.freeze({
        apiVersion: 1 as const,
        get extension() { return props.host.extension.value },
        get language() { return currentLanguage.value },
        get theme() { return window.OneKVMTheme?.v1.current() },
        get presentation() { return tool?.presentation.value ?? 'page' },
        ...(tool ? { toolId: tool.toolId } : {}),
        getStatus: () => { assertActive(); return props.host.getStatus() },
        assetURL: (path: string) => { assertActive(); return props.host.assetURL(path) },
        invoke: <T = unknown>(method: string, payload?: unknown) => { assertActive(); return props.host.invoke<T>(method, payload) },
        saveSettings: () => { assertActive(); return props.host.saveSettings() },
        registerSettings: (adapter: WebComponentSettingsV1) => {
          assertActive()
          if (!adapter || typeof adapter.collect !== 'function' || typeof adapter.reset !== 'function') {
            throw new Error('Extension settings require collect and reset functions')
          }
          const dirty = shallowRef(adapter.dirty === true)
          const valid = shallowRef(adapter.valid !== false)
          const settings: ExtensionPageSettingsAdapterV1 = {
            dirty, valid, collect: () => adapter.collect(), reset: settings => adapter.reset(settings), showHostActions: adapter.showHostActions,
          }
          const unregister = props.host.registerSettings(settings)
          let disposed = false
          const dispose = () => {
            if (disposed) return
            disposed = true
            cleanups.delete(dispose)
            unregister()
          }
          cleanups.add(dispose)
          return Object.freeze({
            update: (state: { dirty?: boolean; valid?: boolean }) => {
              assertActive()
              if (disposed) throw new Error('Extension settings registration was disposed')
              if (state.dirty !== undefined) dirty.value = state.dirty === true
              if (state.valid !== undefined) valid.value = state.valid === true
            },
            dispose,
          })
        },
        ...(tool ? {
          close: () => { assertActive(); return tool.close() },
          resizeWindow: (size: { width: number; height: number }) => { assertActive(); tool.resizeWindow(size) },
          setWindowState: (state: 'normal' | 'maximized' | 'minimized') => { assertActive(); tool.setWindowState(state) },
          captureFrame: () => { assertActive(); return tool.captureFrame() },
        } : {}),
      })
      const state = computed(() => ({
        extension: props.host.extension.value,
        language: currentLanguage.value,
        presentation: tool?.presentation.value ?? 'page',
      }))
      const notify = () => {
        if (active && element.value?.isConnected) {
          element.value.dispatchEvent(new CustomEvent('onekvm-host-change', { detail: bridge }))
        }
      }
      watch(state, notify, { flush: 'post' })
      let themeObserver: MutationObserver | undefined
      onMounted(() => {
        themeObserver = new MutationObserver(notify)
        themeObserver.observe(document.documentElement, {
          attributes: true, attributeFilter: ['data-theme', 'data-onekvm-theme', 'style'],
        })
      })
      onBeforeUnmount(() => {
        active = false
        themeObserver?.disconnect()
        for (const dispose of [...cleanups]) dispose()
      })
      // Force a DOM property before connection, so connectedCallback can use
      // the host without Vue imports, attributes, or a later mount callback.
      return () => h(tag, { ref: element, '.host': bridge, style: { display: 'block', minWidth: '0', minHeight: '0' } })
    },
  })
  wrappers.set(constructor, component)
  return component
}

export function normalizeExtensionView(definition: ExtensionViewDefinitionV1, renderer: ExtensionViewRenderer): VueExtensionPageDefinitionV1 {
  if (definition?.apiVersion !== 1 ||
    (definition.styles !== undefined && (!Array.isArray(definition.styles) || definition.styles.some(style => typeof style !== 'string')))) {
    throw new Error('Incompatible extension view')
  }
  const styles = [...(definition.styles || [])]
  if (renderer === 'web-component') {
    if (!('element' in definition) || typeof definition.element !== 'function' || !(definition.element.prototype instanceof HTMLElement)) {
      throw new Error('Extension view must provide an HTMLElement constructor')
    }
    return { apiVersion: 1, component: wrapElement(definition.element), styles }
  }
  if (!('component' in definition) || !definition.component) throw new Error('Extension view must provide a Vue component')
  return { apiVersion: 1, component: definition.component, styles }
}
