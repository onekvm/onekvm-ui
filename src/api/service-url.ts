// Cloud releases inject a device-scoped base. The same UI still works at the
// device origin without a cloud host or a second implementation of the console.
export function serviceBaseUrl() {
  const base = document.querySelector<HTMLMetaElement>('meta[name="onekvm-service-base"]')?.content
  if (!base) return window.location.origin
  const url = new URL(base, window.location.origin)
  if (url.origin !== window.location.origin || !url.pathname.startsWith('/device-ui/')) {
    throw new Error('Invalid OneKVM service base')
  }
  return url.href.replace(/\/$/, '')
}

// An absolute URL is already addressed. Prefixing the service base again turns
// `https://host` + `https://host/api/...` into a host the browser serializes as
// `https://hosthttps//host/api/...`.
export function resolveServiceURL(base: string, path: string) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return path
  const root = base.replace(/\/$/, '')
  return `${root}${path.startsWith('/') ? path : `/${path}`}`
}

export function serviceURL(path: string) {
  return resolveServiceURL(serviceBaseUrl(), path)
}

export function serviceWebSocketURL(path: string) {
  const url = new URL(serviceURL(path))
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

export function isCloudHosted() {
  return Boolean(document.querySelector('meta[name="onekvm-service-base"]'))
}
