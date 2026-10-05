import { markRaw, type Component, type ComputedRef } from 'vue'
import { extensionAssetURL, type ExtensionStatus, type ExtensionSummary, type ExtensionToolboxItem, type OneKVMStatus } from '@/api/client'
import type { ExtensionPageSettingsAdapterV1, VueExtensionPageDefinitionV1 } from './pluginUi'
import type { HIDReportListener } from '@/lib/onekvm'

export type ToolPresentation = 'drawer' | 'window' | 'fullscreen'
export interface ExtensionToolHostV1 {
  readonly apiVersion: 1
  readonly toolId: string
  readonly extension: Readonly<ComputedRef<ExtensionStatus>>
  readonly presentation: Readonly<ComputedRef<ToolPresentation>>
  readonly getStatus: () => Promise<OneKVMStatus>
  readonly assetURL: (path: string) => string
  readonly invoke: <T = unknown>(method: string, payload?: unknown) => Promise<T>
  readonly subscribeHIDReports: (listener: HIDReportListener) => () => void
  readonly showConsoleWhileRecording: () => () => void
  readonly resizeWindow: (size: { width: number; height: number }) => void
  readonly close: () => Promise<boolean>
  readonly saveSettings: () => Promise<boolean>
  readonly registerSettings: (adapter: ExtensionPageSettingsAdapterV1) => () => void
}

interface Entry {
  extensionId: string
  version: string
  toolId: string
  path: string
  script: HTMLScriptElement
  definition?: VueExtensionPageDefinitionV1
  styles: HTMLStyleElement[]
  refs: number
  accepting: boolean
  retired: boolean
  cancel?: () => void
}
const entries = new Map<string, Entry>()
const contexts = new WeakMap<HTMLScriptElement, Entry>()
const pending = new Map<string, Promise<Entry>>()
let allowedKeys: Set<string> | null = null
let queue: Promise<unknown> = Promise.resolve()
export const toolCacheKey = (extension: Pick<ExtensionSummary, 'id' | 'version'>, tool: ExtensionToolboxItem) =>
  JSON.stringify([extension.id, extension.version, tool.id, tool.view.entrypoint])

export function registerTool(extensionId: string, toolId: string, definition: VueExtensionPageDefinitionV1) {
  const script = document.currentScript
  const entry = script instanceof HTMLScriptElement ? contexts.get(script) : undefined
  if (!entry || !entry.accepting || entry.retired || entry.extensionId !== extensionId || entry.toolId !== toolId) {
    throw new Error('Tool registration must match the currently executing resource')
  }
  if (entry.definition) throw new Error('Duplicate tool registration')
  if (definition?.apiVersion !== 1 || !definition.component ||
    (definition.styles !== undefined && (!Array.isArray(definition.styles) || definition.styles.some(style => typeof style !== 'string')))) {
    throw new Error('Incompatible tool component')
  }
  entry.definition = markRaw({ ...definition, component: markRaw(definition.component), styles: [...(definition.styles || [])] })
}

function remove(entry: Entry) {
  entry.script.remove()
  entry.styles.forEach(style => style.remove())
  entry.styles = []
}

async function load(extension: ExtensionSummary, tool: ExtensionToolboxItem, key: string): Promise<Entry> {
  if (allowedKeys && !allowedKeys.has(key)) throw new Error('Tool resource was invalidated')
  const existing = entries.get(key)
  if (existing && !existing.retired && existing.definition) return existing
  const script = document.createElement('script')
  const entry: Entry = {
    extensionId: extension.id, version: extension.version!, toolId: tool.id, path: tool.view.entrypoint,
    script, styles: [], refs: 0, accepting: true, retired: false,
  }
  entries.set(key, entry)
  contexts.set(script, entry)
  script.src = extensionAssetURL(extension, tool.view.entrypoint)
  script.async = true
  try {
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        window.clearTimeout(timer)
        entry.accepting = false
        entry.cancel = undefined
        script.onload = script.onerror = null
        error ? reject(error) : resolve()
      }
      const timer = window.setTimeout(() => finish(new Error('Tool resource timed out')), 15000)
      entry.cancel = () => finish(new Error('Tool resource was invalidated'))
      script.onload = () => finish()
      script.onerror = () => finish(new Error('Failed to load tool resource'))
      document.head.append(script)
    })
    if (!entry.definition || entry.retired) throw new Error('Tool resource did not register its component')
    return entry
  } catch (error) {
    entry.accepting = false
    remove(entry)
    if (entries.get(key) === entry) entries.delete(key)
    throw error
  }
}

export async function loadExtensionTool(extension: ExtensionSummary, tool: ExtensionToolboxItem): Promise<{ component: Component; dispose: () => void }> {
  if (!extension.installed || !extension.enabled || !extension.version || tool.view.renderer !== 'vue') {
    throw new Error('Tool is unavailable')
  }
  const key = toolCacheKey(extension, tool)
  let promise = pending.get(key)
  if (!promise) {
    promise = queue.then(() => load(extension, tool, key))
    pending.set(key, promise)
    queue = promise.catch(() => undefined)
    void promise.then(() => pending.delete(key), () => pending.delete(key))
  }
  const entry = await promise
  if (entry.retired || !entry.definition) throw new Error('Tool was invalidated')
  if (entry.refs++ === 0) {
    entry.styles = (entry.definition.styles || []).map(content => {
      const style = document.createElement('style')
      style.dataset.onekvmTool = key
      style.textContent = content
      document.head.append(style)
      return style
    })
  }
  let disposed = false
  return { component: entry.definition.component, dispose: () => {
    if (disposed) return
    disposed = true
    if (--entry.refs === 0) {
      entry.styles.forEach(style => style.remove())
      entry.styles = []
      if (entry.retired) remove(entry)
    }
  } }
}

// Call only with an authoritative successful catalog (or at logout).
export function invalidateToolResources(extensions: ExtensionSummary[]) {
  const wanted = new Set(extensions.filter(e => e.installed && e.enabled && e.version)
    .flatMap(e => (e.toolbox?.items || []).map(t => toolCacheKey(e, t))))
  allowedKeys = wanted
  for (const [key, entry] of entries) {
    if (wanted.has(key)) continue
    entry.retired = true
    entry.accepting = false
    entry.cancel?.()
    if (!entry.refs) remove(entry)
    entries.delete(key)
  }
}
