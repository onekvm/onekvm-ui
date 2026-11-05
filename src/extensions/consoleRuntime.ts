import { api, extensionAssetURL, type ConsoleExtension } from '@/api/client'
import { currentLanguage } from '@/i18n/runtime'

export interface ExtensionConsoleHostV1 {
  readonly apiVersion: 1
  readonly extension: Readonly<ConsoleExtension>
  readonly language: string
  readonly signal: AbortSignal
  readonly getStatus: typeof api.getStatus
  readonly assetURL: (path: string) => string
  readonly invoke: <T = unknown>(method: string, payload?: unknown) => Promise<T>
}
export interface ExtensionConsoleDefinitionV1 {
  apiVersion: 1
  onLoad: (host: ExtensionConsoleHostV1) => void | (() => void) | Promise<void | (() => void)>
}
interface Run {
  key: string
  extension: ConsoleExtension
  controller: AbortController
  cancelLoad?: () => void
  cleanup?: () => void
  ready: Promise<void>
}
interface Registration {
  id: string
  accepting: boolean
  definition?: ExtensionConsoleDefinitionV1
}
const definitions = new Map<string, ExtensionConsoleDefinitionV1>()
const registrations = new WeakMap<HTMLScriptElement, Registration>()
const runs = new Map<string, Run>()

export function registerConsole(id: string, definition: ExtensionConsoleDefinitionV1) {
  const script = document.currentScript
  const registration = script instanceof HTMLScriptElement ? registrations.get(script) : undefined
  if (!registration?.accepting || registration.id !== id) {
    throw new Error('Console registration must match the currently executing resource')
  }
  if (registration.definition) throw new Error('Duplicate console registration')
  if (definition?.apiVersion !== 1 || typeof definition.onLoad !== 'function') {
    throw new Error('Console registration requires apiVersion 1 and onLoad')
  }
  registration.definition = Object.freeze({ apiVersion: 1, onLoad: definition.onLoad })
}

function loadDefinition(run: Run): Promise<ExtensionConsoleDefinitionV1> {
  const cached = definitions.get(run.key)
  if (cached) return Promise.resolve(cached)
  const script = document.createElement('script')
  script.async = true
  script.src = extensionAssetURL(run.extension, run.extension.console!.entrypoint)
  const registration: Registration = { id: run.extension.id, accepting: true }
  registrations.set(script, registration)
  return new Promise((resolve, reject) => {
    let timer = 0
    let finished = false
    const finish = (error?: Error) => {
      if (finished) return
      finished = true
      registration.accepting = false
      window.clearTimeout(timer)
      script.remove()
      run.cancelLoad = undefined
      if (error) reject(error)
      else if (!registration.definition) reject(new Error(`Extension ${run.extension.id} did not register its console hook`))
      else {
        definitions.set(run.key, registration.definition)
        resolve(registration.definition)
      }
    }
    run.cancelLoad = () => finish(new Error('Console hook loading was cancelled'))
    timer = window.setTimeout(() => finish(new Error('Console hook loading timed out')), 15000)
    script.addEventListener('load', () => finish(), { once: true })
    script.addEventListener('error', () => finish(new Error(`Failed to load ${run.extension.id} console hook`)), { once: true })
    document.head.append(script)
  })
}

function stop(run: Run) {
  run.controller.abort()
  run.cancelLoad?.()
  const cleanup = run.cleanup
  run.cleanup = undefined
  try { cleanup?.() } catch (error) { console.warn('Extension console cleanup failed', error) }
}

async function start(run: Run) {
  const signal = run.controller.signal
  const assertActive = () => { if (signal.aborted) throw new Error('Extension console is no longer active') }
  const host: ExtensionConsoleHostV1 = Object.freeze({
    apiVersion: 1 as const,
    get extension() { return run.extension },
    get language() { return currentLanguage.value },
    signal,
    getStatus: () => { assertActive(); return api.getStatus() },
    assetURL: (path: string) => { assertActive(); return extensionAssetURL(run.extension, path) },
    invoke: <T = unknown>(method: string, payload: unknown = null) => { assertActive(); return api.invokeExtension<T>(run.extension.id, method, payload) },
  })
  try {
    const definition = await loadDefinition(run)
    if (signal.aborted) return
    const cleanup = await definition.onLoad(host)
    if (cleanup !== undefined && typeof cleanup !== 'function') throw new Error('Console onLoad must return a cleanup function or undefined')
    if (signal.aborted) {
      try { cleanup?.() } catch (error) { console.warn('Extension console cleanup failed', error) }
    } else if (typeof cleanup === 'function') run.cleanup = cleanup
  } catch (error) {
    if (!signal.aborted) {
      console.warn(`Extension ${run.extension.id} console hook failed`, error)
      stop(run)
    }
  }
}

export function clearExtensionConsoles() {
  for (const run of runs.values()) stop(run)
  runs.clear()
}

export async function syncExtensionConsoles(extensions: ConsoleExtension[]) {
  const wanted = new Map(extensions
    .filter(extension => extension.installed && extension.enabled && !extension.error && extension.version && extension.console?.entrypoint)
    .map(extension => [extension.id, extension]))
  const keyFor = (extension: ConsoleExtension) => JSON.stringify([extension.id, extension.version, extension.console!.entrypoint])
  for (const [id, run] of runs) {
    const extension = wanted.get(id)
    if (!extension || keyFor(extension) !== run.key) { runs.delete(id); stop(run) }
  }
  const pending: Promise<void>[] = []
  for (const extension of wanted.values()) {
    const current = runs.get(extension.id)
    if (current) { current.extension = extension; continue }
    const run: Run = { key: keyFor(extension), extension, controller: new AbortController(), ready: Promise.resolve() }
    runs.set(extension.id, run)
    run.ready = start(run)
    pending.push(run.ready)
  }
  await Promise.all(pending)
}
