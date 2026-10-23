export interface AccessRevokedRoute {
  requested: boolean
  preview: boolean
}

export function isAccessRevoked(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'status' in error && error.status === 423
}

export function accessRevokedURL(url: URL) {
  const target = new URL(url.href)
  target.searchParams.delete('preview')
  target.hash = '/banned'
  return `${target.pathname}${target.search}${target.hash}`
}

export function accessRevokedRoute(url: URL): AccessRevokedRoute {
  const [path, query = ''] = url.hash.slice(1).split('?')
  const requested = /^\/banned\/?$/.test(path || '')
  const preview = new URLSearchParams(query).get('preview') ?? url.searchParams.get('preview')
  return { requested, preview: requested && preview === 'true' }
}

export async function resolveAccessRevokedRoute(
  route: AccessRevokedRoute,
  readStatus: () => Promise<unknown>,
): Promise<'home' | 'banned'> {
  if (!route.requested) return 'home'
  if (route.preview) return 'banned'
  try {
    await readStatus()
    return 'home'
  } catch (error) {
    if (isAccessRevoked(error)) return 'banned'
    throw error
  }
}

export function accessRevokedHomeURL(url: URL) {
  const home = new URL(url.href)
  home.hash = ''
  home.searchParams.delete('preview')
  return `${home.pathname}${home.search}`
}
