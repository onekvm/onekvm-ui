import { h, readonly, shallowRef, type Component, type FunctionalComponent } from 'vue'

import { canonicalIconName, defaultIconNames, outlineIconSet } from './defaults.ts'
import { win98IconSet } from './win98.ts'
import {
  DEFAULT_ICON_SET_ID,
  type OneKVMIconProps,
  type OneKVMIconRuntimeV1,
  type OneKVMIconSetDefinition,
  type OneKVMIconSetSummary,
  type ResolvedOneKVMIconSet,
} from './types.ts'

declare global {
  interface Window {
    OneKVMIcons?: { v1: OneKVMIconRuntimeV1 }
  }
}

const sets = new Map([[outlineIconSet.id, outlineIconSet]])
const activeSet = shallowRef(outlineIconSet)
const components = new Map<string, FunctionalComponent<OneKVMIconProps>>()
const themedWrappers = new WeakSet<Component>()
let requestedSetId = DEFAULT_ICON_SET_ID

export const activeIconSet = readonly(activeSet)

function summary(set: ResolvedOneKVMIconSet): OneKVMIconSetSummary {
  return { id: set.id, name: set.name }
}

/** Called by the color theme; remember unknown IDs for late registration. */
export function activateIconSet(id: string) {
  requestedSetId = id
  const next = sets.get(id) ?? outlineIconSet
  const changed = activeSet.value !== next
  activeSet.value = next
  if (typeof document !== 'undefined') document.documentElement.dataset.onekvmIconSet = next.id
  if (changed && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('onekvm-icon-set-change', { detail: summary(next) }))
  }
}

export function registerIconSet(definition: OneKVMIconSetDefinition): OneKVMIconSetSummary {
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(definition.id)) {
    throw new Error(`Invalid OneKVM icon set ID: ${definition.id}`)
  }
  if (definition.id === DEFAULT_ICON_SET_ID) throw new Error('Cannot replace the default OneKVM icon set')
  if (!definition.name.trim()) throw new Error(`OneKVM icon set ${definition.id} requires a name`)
  const baseId = definition.extends ?? DEFAULT_ICON_SET_ID
  if (baseId === definition.id) throw new Error(`OneKVM icon set ${definition.id} cannot extend itself`)
  const base = sets.get(baseId)
  if (!base) throw new Error(`Unknown OneKVM base icon set: ${baseId}`)

  const glyphs: Record<string, Component> = Object.assign(Object.create(null), base.icons)
  for (const [name, component] of Object.entries(definition.icons)) {
    const id = canonicalIconName(name)
    if (!component || (typeof component !== 'function' && typeof component !== 'object')) {
      throw new Error(`Invalid ${name} icon for OneKVM icon set ${definition.id}`)
    }
    if (themedWrappers.has(component)) {
      throw new Error(`OneKVM icon ${name} must be a glyph, not a themed icon wrapper`)
    }
    glyphs[id] = component
  }
  const resolved = Object.freeze({ id: definition.id, name: definition.name.trim(), icons: Object.freeze(glyphs) })
  sets.set(resolved.id, resolved)
  if (requestedSetId === resolved.id) activateIconSet(requestedSetId)
  return summary(resolved)
}

/** A stable component handle that resolves the current glyph during render. */
export function iconComponent(name: string): FunctionalComponent<OneKVMIconProps> | undefined {
  let id: string
  try {
    id = canonicalIconName(name)
  } catch {
    return undefined
  }
  const cached = components.get(id)
  if (cached) return cached
  if (!activeSet.value.icons[id] && !outlineIconSet.icons[id]) return undefined
  const Icon: FunctionalComponent<OneKVMIconProps> = (props, { attrs, slots }) => h(
    activeSet.value.icons[id] ?? outlineIconSet.icons[id] ?? outlineIconSet.icons['circle-question-mark']!,
    { ...attrs, ...props, 'data-onekvm-icon': id },
    slots,
  )
  Icon.displayName = `OneKVMIcon(${id})`
  Icon.inheritAttrs = false
  Icon.props = ['size', 'color', 'strokeWidth', 'absoluteStrokeWidth']
  components.set(id, Icon)
  themedWrappers.add(Icon)
  return Icon
}

// Getters preserve the existing plugin icons object without constructing every
// component eagerly. Handles already held by a plugin also follow theme changes.
export const icons: Readonly<Record<string, Component>> = Object.freeze(Object.defineProperties(
  Object.create(null) as Record<string, Component>,
  Object.fromEntries(defaultIconNames.map(name => [name, { enumerable: true, get: () => iconComponent(name) }])),
))

export function initializeIconRuntime(definitions: readonly OneKVMIconSetDefinition[] = []) {
  for (const definition of definitions) registerIconSet(definition)
  window.OneKVMIcons = { v1: Object.freeze({
    register: registerIconSet,
    get: iconComponent,
    current: () => summary(activeSet.value),
    list: () => [...sets.values()].map(summary),
  }) }
}

registerIconSet(win98IconSet)
