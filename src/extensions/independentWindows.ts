import { markRaw, shallowReadonly, shallowRef, type Component, type ComputedRef, type Ref } from 'vue'
import type { ConsoleExtension, ExtensionStatus } from '@/api/client'

export interface IndependentWindowHost {
  readonly apiVersion: 1
  readonly extension: Readonly<ComputedRef<ExtensionStatus>>
}
export interface IndependentWindowDefinition {
  component: Component
  props?: Record<string, unknown>
  styles?: string[]
}
export interface IndependentWindow {
  key: string
  instanceId: number
  extension: Ref<ExtensionStatus>
  component: Component
  props: Record<string, unknown>
  open: Ref<boolean>
  instance: Ref<{ focus?: () => void } | null>
  styles: HTMLStyleElement[]
  disposeHost?: () => void
}
const hosts = new WeakSet<object>()
const windows = shallowRef<IndependentWindow[]>([])
let available = false
let sequence = 0
export const independentWindows = shallowReadonly(windows)

export function registerIndependentWindowHost(host: IndependentWindowHost) {
  hosts.add(host)
  return () => hosts.delete(host)
}
export function openIndependentWindow(host: IndependentWindowHost, id: string, definition: IndependentWindowDefinition) {
  const extension = host.extension.value
  if (!available || !hosts.has(host) || !extension.enabled || !extension.version) throw new Error('Window is unavailable')
  if (!/^[a-z0-9][a-z0-9_-]{0,127}$/.test(id) || !definition.component) throw new Error('Invalid window definition')
  const key = JSON.stringify([extension.id, extension.version, id])
  const existing = windows.value.find(window => window.key === key)
  if (existing?.open.value) { existing.instance.value?.focus?.(); return }
  if (existing) removeIndependentWindow(key)
  const styles = (definition.styles || []).map(text => {
    const style = document.createElement('style')
    style.dataset.onekvmWindow = key
    style.textContent = text
    document.head.append(style)
    return style
  })
  windows.value = [...windows.value, {
    key, instanceId: ++sequence, extension: shallowRef({ ...extension }), component: markRaw(definition.component),
    props: { ...definition.props }, open: shallowRef(true), instance: shallowRef(null), styles,
  }]
}
export function removeIndependentWindow(key: string, instanceId?: number) {
  const matches = (window: IndependentWindow) => window.key === key && (instanceId === undefined || instanceId === window.instanceId)
  const entry = windows.value.find(matches)
  entry?.disposeHost?.()
  entry?.styles.forEach(style => style.remove())
  windows.value = windows.value.filter(window => !matches(window))
}
export function setIndependentWindowsAvailable(value: boolean) {
  available = value
  if (!value) for (const window of windows.value) removeIndependentWindow(window.key)
}
export function reconcileIndependentWindows(catalog: Pick<ConsoleExtension, 'id' | 'installed' | 'enabled' | 'version' | 'error'>[]) {
  for (const window of windows.value) {
    const current = catalog.find(extension => extension.id === window.extension.value.id)
    if (!current?.installed || !current.enabled || current.error || current.version !== window.extension.value.version) {
      removeIndependentWindow(window.key)
    } else window.extension.value = { ...window.extension.value, ...current }
  }
}
