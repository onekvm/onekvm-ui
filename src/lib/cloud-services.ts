import type { ExtensionSummary } from '@/api/client'

export const FEATURED_CLOUD_SERVICE_ID = 'cloud'
export const PLUGIN_MARKETPLACE_ID = 'plugin-marketplace'

export interface MarketplacePackage {
  id: string
  package: string
  name: string
  description?: string
  version?: string
  kind: string
  installed: boolean
  i18n?: Record<string, { name: string; description: string }>
  icon?: ExtensionSummary['icon']
  icon_data_url?: string
  size_bytes?: number
  installed_size_bytes?: number
}

export interface CloudServiceEntry extends ExtensionSummary {
  packageName: string
  marketplaceAvailable: boolean
  sizeBytes: number
  installedSizeBytes: number
}

function marketplaceSummary(item: MarketplacePackage): CloudServiceEntry {
  return {
    id: item.id,
    packageName: item.package || `onekvm-extension-${item.id}`,
    name: item.name || item.id,
    description: item.description || '',
    i18n: item.i18n,
    kind: 'cloud-provider',
    version: item.version,
    installed: item.installed,
    enabled: false,
    running: false,
    icon: item.icon,
    icon_data_url: item.icon_data_url,
    marketplaceAvailable: true,
    sizeBytes: Number(item.size_bytes) || 0,
    installedSizeBytes: Number(item.installed_size_bytes) || 0,
  }
}

function installedSummary(item: ExtensionSummary): CloudServiceEntry {
  return {
    ...item,
    packageName: `onekvm-extension-${item.id}`,
    marketplaceAvailable: false,
    sizeBytes: 0,
    installedSizeBytes: 0,
  }
}

export function mergeCloudServiceCatalog(
  catalog: ExtensionSummary[],
  marketplace: MarketplacePackage[],
): CloudServiceEntry[] {
  const entries = new Map<string, CloudServiceEntry>()
  for (const item of marketplace) {
    if (item.kind !== 'cloud-provider' || !item.id) continue
    entries.set(item.id, marketplaceSummary(item))
  }
  for (const installed of catalog) {
    if (!installed.installed || installed.kind !== 'cloud-provider') continue
    const available = entries.get(installed.id)
    entries.set(installed.id, {
      ...(available || installedSummary(installed)),
      ...installed,
      packageName: available?.packageName || `onekvm-extension-${installed.id}`,
      marketplaceAvailable: available?.marketplaceAvailable || false,
      sizeBytes: available?.sizeBytes || 0,
      installedSizeBytes: available?.installedSizeBytes || 0,
    })
  }
  if (!entries.has(FEATURED_CLOUD_SERVICE_ID)) {
    entries.set(FEATURED_CLOUD_SERVICE_ID, {
      id: FEATURED_CLOUD_SERVICE_ID,
      packageName: 'onekvm-extension-cloud',
      name: 'OneKVM Cloud',
      description: '',
      kind: 'cloud-provider',
      installed: false,
      enabled: false,
      running: false,
      icon: { source: 'lucide', name: 'cloud' },
      marketplaceAvailable: false,
      sizeBytes: 0,
      installedSizeBytes: 0,
    })
  }
  return [...entries.values()].sort((left, right) => {
    if (left.id === FEATURED_CLOUD_SERVICE_ID) return -1
    if (right.id === FEATURED_CLOUD_SERVICE_ID) return 1
    return left.name.localeCompare(right.name)
  })
}

export function enabledCloudService(catalog: ExtensionSummary[]) {
  return catalog.find((item) => item.installed && item.kind === 'cloud-provider' && item.enabled) || null
}
