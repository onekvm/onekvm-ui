import type { ExtensionSummary } from '@/api/client'

export const WIREGUARD_MARKETPLACE_ID = 'wireguard'

export interface MarketplaceInstallText {
  name?: string
  description?: string
}

export interface MarketplaceInstallPackage {
  id: string
  packageName: string
  name: string
  description: string
  version: string
  installedVersion: string
  packageVersion: string
  installedPackageVersion: string
  updateAvailable: boolean
  sizeBytes: number
  installedSizeBytes: number
  iconDataUrl: string
  icon?: ExtensionSummary['icon']
  i18n: Record<string, MarketplaceInstallText>
}

export interface MarketplaceInstallErrors {
  rejected: string
  failed: string
  timedOut: string
}

export interface MarketplaceInstallProgress {
  phase: string
  percent: number | null
  bytes: number
  totalBytes: number
  message: string
  status: string
  error: string
  log: string
  logTruncated: boolean
}

export function marketplacePackageMatches(entry: { id?: string; package?: string }, id: string) {
  const wanted = id.trim()
  if (!wanted) return false
  return entry.id === wanted
    || entry.package === wanted
    || entry.package === `onekvm-extension-${wanted}`
}

function readText(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function readI18n(value: unknown) {
  const result: Record<string, MarketplaceInstallText> = {}
  if (!value || typeof value !== 'object') return result
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const name = readText(record.name).trim()
    const description = readText(record.description).trim()
    if (name || description) result[key] = { name, description }
  }
  return result
}

function readIconDataUrl(record: Record<string, unknown>) {
  const direct = readText(record.icon_data_url).trim()
  if (direct.startsWith('data:image/')) return direct
  const icon = record.icon
  if (icon && typeof icon === 'object') {
    const data = readText((icon as Record<string, unknown>).data).trim()
    if (data.startsWith('data:image/')) return data
  }
  return ''
}

function readIcon(value: unknown): ExtensionSummary['icon'] {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const source = readText(record.source)
  if (source === 'lucide') {
    const name = readText(record.name).trim()
    return name ? { source: 'lucide', name } : undefined
  }
  if (source === 'custom') {
    const path = readText(record.path).trim()
    const data = readText(record.data).trim()
    if (!path && !data.startsWith('data:image/')) return undefined
    return {
      source: 'custom',
      path,
      ...(data.startsWith('data:image/') ? { data } : {}),
    }
  }
  return undefined
}

export function marketplaceInstallPackageFromRecord(value: unknown, id: string): MarketplaceInstallPackage | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const entry = {
    id: readText(record.id),
    package: readText(record.package),
  }
  if (!entry.package || !marketplacePackageMatches(entry, id)) return null
  const iconDataUrl = readIconDataUrl(record)
  return {
    id: entry.id,
    packageName: entry.package,
    name: readText(record.name) || entry.id || entry.package,
    description: readText(record.description),
    version: readText(record.version),
    installedVersion: readText(record.installed_version),
    packageVersion: readText(record.package_version),
    installedPackageVersion: readText(record.installed_package_version),
    updateAvailable: record.update_available === true,
    sizeBytes: Number(record.size_bytes) || 0,
    installedSizeBytes: Number(record.installed_size_bytes) || 0,
    iconDataUrl,
    icon: readIcon(record.icon),
    i18n: readI18n(record.i18n),
  }
}

export function marketplacePackageText(pkg: MarketplaceInstallPackage, language: string) {
  const key = language === 'zh' ? 'zh' : language === 'zh_tw' ? 'zh-TW' : ''
  const localized = key ? pkg.i18n[key] : undefined
  return {
    name: localized?.name || pkg.name || pkg.id,
    description: localized?.description || pkg.description,
  }
}

export function marketplacePackageVersions(pkg: MarketplaceInstallPackage) {
  const sameVersion = pkg.installedVersion === pkg.version
  return {
    current: (sameVersion && pkg.installedPackageVersion) || pkg.installedVersion,
    latest: (sameVersion && pkg.packageVersion) || pkg.version,
  }
}

export function marketplacePackageVersionText(pkg: MarketplaceInstallPackage) {
  const versions = marketplacePackageVersions(pkg)
  return pkg.updateAvailable
    ? `${versions.current} → ${versions.latest}`
    : (pkg.installedVersion || pkg.version)
}

export function marketplaceProgressPercent(progress: { percent?: number | null; bytes?: number; totalBytes?: number }) {
  if (progress.percent != null && Number.isFinite(progress.percent)) {
    return Math.max(0, Math.min(100, progress.percent))
  }
  const bytes = Number(progress.bytes) || 0
  const total = Number(progress.totalBytes) || 0
  if (total > 0 && bytes >= 0) return Math.max(0, Math.min(99, Math.round((bytes / total) * 100)))
  return null
}

export function marketplaceInstallProgressFromRecord(value: unknown): MarketplaceInstallProgress {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const rawPercent = record.percent
  const percent = typeof rawPercent === 'number' && Number.isFinite(rawPercent) ? rawPercent : null
  return {
    phase: readText(record.phase),
    percent,
    bytes: Number(record.bytes) || 0,
    totalBytes: Number(record.total_bytes) || 0,
    message: readText(record.message),
    status: readText(record.status),
    error: readText(record.error),
    log: readText(record.log),
    logTruncated: record.log_truncated === true,
  }
}

export function marketplaceFormatStorageBytes(bytes: number) {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value < 0) return ''
  if (value >= 1_000_000_000) {
    const scaled = value / 1_000_000_000
    return `${scaled.toFixed(scaled >= 10 ? 1 : 2)} GB`
  }
  if (value >= 1_000_000) {
    const scaled = value / 1_000_000
    return `${scaled.toFixed(scaled >= 10 ? 0 : 1)} MB`
  }
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)} kB`
  return `${Math.round(value)} B`
}

export function marketplaceFormatPackageSize(bytes: number) {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value <= 0) return ''
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KiB`
  return `${(value / (1024 * 1024)).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)} MiB`
}

export function fillMarketplaceTemplate(template: string, values: Record<string, string | number | null | undefined>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = values[key]
    return value == null ? '' : String(value)
  })
}
