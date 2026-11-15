import { createPersistentQuery } from './persistent-query.ts'

/** Page-lifetime queries shared by toolbars, tools and extension-backed media. */
export function createExtensionQuery<T>(events?: Pick<EventTarget, 'addEventListener'>) {
  const cache = createPersistentQuery<T>()
  let revision = 0
  function invalidate() {
    revision++
    cache.invalidate()
  }
  events?.addEventListener('onekvm:extensions-changed', invalidate)
  async function get(key: string, fetcher: () => Promise<T>, refresh = false): Promise<T> {
    for (;;) {
      const current = revision
      try {
        const pending = cache.get(key, fetcher, refresh)
        refresh = false
        const value = await pending
        if (current === revision) return value
      } catch (error) {
        if (current === revision) throw error
      }
      // A completed mutation must also refresh consumers already awaiting an
      // older catalog, including an in-flight toolbox refresh.
    }
  }
  return { get, invalidate }
}

// Extension methods cannot install, enable or configure extensions; only the
// plugin market's package installs and removals change the catalog.
const catalogMethods = new Set(['install_package', 'remove_package'])

/**
 * What a successful request can change: the extension catalog, only the
 * published virtual-media directories, or nothing.
 */
export function extensionRequestChange(path: string, method: string | undefined): 'catalog' | 'media' | 'none' {
  if (!path.startsWith('/api/extensions') || !method || method.toUpperCase() === 'GET') return 'none'
  const invoke = path.match(/\/invoke\/([^/?]+)/)
  if (!invoke || catalogMethods.has(decodeURIComponent(invoke[1]!))) return 'catalog'
  // A method can publish or withdraw media directories, as Samba gateways do.
  return 'media'
}
