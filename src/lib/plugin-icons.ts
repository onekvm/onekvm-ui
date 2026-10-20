import type { Component } from 'vue'
import { extensionAssetURL } from '../api/client.ts'
import { Box, Cloud, iconComponent } from '../icons/index.ts'

export const ONEKVM_CLOUD_ID = 'cloud'
export const JETKVM_CLOUD_ID = 'cloud-jetkvm'

export const brandPluginIconUrls: Readonly<Record<string, string>> = {
  [ONEKVM_CLOUD_ID]: '/brand/onekvm-app-icon.svg',
  [JETKVM_CLOUD_ID]: '/brand/jetkvm-mark.svg',
}

export function brandPluginIconUrl(id: string): string {
  return brandPluginIconUrls[id] || ''
}

export function namedPluginIcon(name: string | undefined, fallback: Component = Box): Component {
  return (name && iconComponent(name)) || fallback
}

export function pluginIcon(status: {
  id?: string
  version?: string
  icon_data_url?: string
  icon?: { source?: string; name?: string; data?: string; path?: string }
}, fallback: Component = Box): { component: Component; url: string } {
  const dataUrl =
    (typeof status.icon_data_url === 'string' && status.icon_data_url.trim())
    || (status.icon && 'data' in status.icon && typeof status.icon.data === 'string'
      ? status.icon.data.trim()
      : '')
  if (dataUrl.startsWith('data:image/')) {
    return { component: fallback, url: dataUrl }
  }
  const brand = status.id ? brandPluginIconUrl(status.id) : ''
  if (brand) return { component: fallback, url: brand }
  if (status.icon?.source === 'custom' && status.icon.path && status.id && status.version) {
    return { component: fallback, url: extensionAssetURL({ id: status.id, version: status.version }, status.icon.path) }
  }
  if (status.icon?.source === 'lucide') {
    return { component: namedPluginIcon(status.icon.name, fallback), url: '' }
  }
  return { component: status.id === ONEKVM_CLOUD_ID || status.id === JETKVM_CLOUD_ID ? Cloud : fallback, url: '' }
}
