import { markRaw, type Component } from 'vue'
import { extensionAssetURL, type ExtensionStatus } from '@/api/client'
import type { VueExtensionPageDefinitionV1 } from './pluginUi'
import { normalizeExtensionView, type ExtensionViewDefinitionV1, type ExtensionViewRenderer } from './webComponentView'

export interface LoadedVueExtensionPage {
  component: Component
  dispose: () => void
}
const registrations = new Map<string, VueExtensionPageDefinitionV1>()
const webComponentPages = new Map<string, VueExtensionPageDefinitionV1>()
let loadingPageId: string | null = null
let loadingPageRenderer: ExtensionViewRenderer = 'vue'
let loadingPageScript: HTMLScriptElement | null = null
let pageLoadQueue: Promise<unknown> = Promise.resolve()

export function registerPage(id: string, definition: ExtensionViewDefinitionV1) {
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(id)) throw new Error('Invalid extension page ID')
  if (!loadingPageId || document.currentScript !== loadingPageScript) {
    throw new Error('Extension page registration is only allowed while the host is loading that extension')
  }
  if (id !== loadingPageId) {
    throw new Error(`Extension page ID ${id} does not match ${loadingPageId}`)
  }
  if (registrations.has(id)) throw new Error('Duplicate extension page registration')
  registrations.set(id, markRaw(normalizeExtensionView(definition, loadingPageRenderer)))
}

async function loadVueExtensionPageNow(extension: ExtensionStatus): Promise<LoadedVueExtensionPage> {
  if (!extension.version || !extension.page || !['vue', 'web-component'].includes(extension.page.renderer)) {
    throw new Error('Extension does not register an embedded page')
  }
  const renderer = extension.page.renderer as ExtensionViewRenderer
  const key = JSON.stringify([extension.id, extension.version, renderer, extension.page.entrypoint])
  const attach = (definition: VueExtensionPageDefinitionV1, script?: HTMLScriptElement) => {
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
        script?.remove()
        styles.forEach((style) => style.remove())
        if (registrations.get(extension.id) === definition) registrations.delete(extension.id)
      },
    }
  }
  const cached = renderer === 'web-component' ? webComponentPages.get(key) : undefined
  if (cached) return attach(cached)
  registrations.delete(extension.id)
  const script = document.createElement('script')
  script.async = true
  script.src = extensionAssetURL(extension, extension.page.entrypoint)
  loadingPageId = extension.id
  loadingPageRenderer = renderer
  loadingPageScript = script
  let timer = 0
  const loaded = new Promise<void>((resolve, reject) => {
    timer = window.setTimeout(() => reject(new Error(`Extension ${extension.id} page timed out`)), 15000)
    script.addEventListener('load', () => resolve(), { once: true })
    script.addEventListener('error', () => reject(new Error(`Failed to load ${extension.name} page`)), { once: true })
  })
  document.head.append(script)

  try {
    await loaded
    const definition = registrations.get(extension.id)
    if (!definition) throw new Error(`Extension ${extension.id} did not register its page`)
    if (renderer === 'web-component') {
      webComponentPages.set(key, definition)
      script.remove()
    }
    return attach(definition, renderer === 'vue' ? script : undefined)
  } catch (reason) {
    script.remove()
    registrations.delete(extension.id)
    throw reason
  } finally {
    window.clearTimeout(timer)
    loadingPageId = null
    loadingPageScript = null
  }
}

export function loadVueExtensionPage(extension: ExtensionStatus): Promise<LoadedVueExtensionPage> {
  // Extension bundles register through one shared runtime hook, so their script
  // evaluation must not overlap. Fast settings navigation otherwise lets a
  // later page replace loadingPageId before the earlier script registers.
  const load = pageLoadQueue.then(() => loadVueExtensionPageNow(extension))
  pageLoadQueue = load.then(() => undefined, () => undefined)
  return load
}
