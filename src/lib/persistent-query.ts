/** Share successful queries indefinitely. Only explicit invalidation/refresh expires them. */
export function createPersistentQuery<T>() {
  const entries = new Map<string, Promise<T>>()
  function invalidate() { entries.clear() }
  function get(key: string, fetcher: () => Promise<T>, refresh = false): Promise<T> {
    if (refresh) entries.delete(key)
    const existing = entries.get(key)
    if (existing) return existing
    const pending = Promise.resolve().then(fetcher).catch(error => {
      // A failed old request must not evict a newer request after invalidation.
      if (entries.get(key) === pending) entries.delete(key)
      throw error
    })
    entries.set(key, pending)
    return pending
  }
  return { get, invalidate }
}
