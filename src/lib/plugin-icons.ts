import type { Component } from 'vue'
import { Box, Cloud, icons } from '@lucide/vue'

export const ONEKVM_CLOUD_ID = 'cloud'
export const JETKVM_CLOUD_ID = 'cloud-jetkvm'

export const brandPluginIconUrls: Readonly<Record<string, string>> = {
  [ONEKVM_CLOUD_ID]: '/brand/onekvm-app-icon.svg',
  [JETKVM_CLOUD_ID]: '/brand/jetkvm-mark.svg',
}

export function brandPluginIconUrl(id: string): string {
  return brandPluginIconUrls[id] || ''
}

export function lucidePluginIcon(name: string | undefined, fallback: Component = Box): Component {
  if (!name) return fallback
  const componentName = name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
  return (icons as Record<string, Component>)[componentName] || fallback
}

export function pluginIcon(status: {
  id?: string
  icon_data_url?: string
  icon?: { source?: string; name?: string; data?: string }
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
  if (status.icon?.source === 'lucide') {
    return { component: lucidePluginIcon(status.icon.name, fallback), url: '' }
  }
  return { component: status.id === ONEKVM_CLOUD_ID || status.id === JETKVM_CLOUD_ID ? Cloud : fallback, url: '' }
}
