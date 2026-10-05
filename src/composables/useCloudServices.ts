import { computed, onScopeDispose, shallowRef, watch, type ComputedRef } from 'vue'

import { api, type ExtensionSummary } from '@/api/client'
import { ensureExtensionShell, invokeExtensionShell } from '@/extensions/pluginUi'
import { t } from '@/i18n/runtime'
import {
  FEATURED_CLOUD_SERVICE_ID,
  PLUGIN_MARKETPLACE_ID,
  enabledCloudService,
  mergeCloudServiceCatalog,
  type CloudServiceEntry,
  type MarketplacePackage,
} from '@/lib/cloud-services'

type MarketplaceState = 'loading' | 'ready' | 'missing' | 'incompatible' | 'error'
type CloudOperation = 'install' | 'start' | 'stop' | ''

export interface CloudInstallProgress {
  percentage: number | null
  message: string
}

interface MarketplaceListResponse {
  packages?: unknown[]
}

interface MarketplaceInstallResponse {
  status?: string
}

interface MarketplaceProgressResponse {
  active?: boolean
  package?: string
  phase?: string
  status?: string
  percent?: number | null
  bytes?: number
  total_bytes?: number
  message?: string
  error?: string
}

interface UseCloudServicesOptions {
  catalog: ComputedRef<ExtensionSummary[]>
  onCatalog: (catalog: ExtensionSummary[]) => void
}

function normalizeMarketplacePackages(value: unknown): MarketplacePackage[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {}
    return {
      id: String(record.id || ''),
      package: String(record.package || ''),
      name: String(record.name || record.id || ''),
      description: String(record.description || ''),
      version: String(record.version || ''),
      kind: String(record.kind || ''),
      installed: Boolean(record.installed),
      i18n: record.i18n && typeof record.i18n === 'object'
        ? record.i18n as MarketplacePackage['i18n']
        : undefined,
      icon: record.icon && typeof record.icon === 'object'
        ? record.icon as MarketplacePackage['icon']
        : undefined,
      icon_data_url: typeof record.icon_data_url === 'string' ? record.icon_data_url : '',
      size_bytes: Number(record.size_bytes) || 0,
      installed_size_bytes: Number(record.installed_size_bytes) || 0,
    }
  }).filter((item) => item.id && item.package)
}

function progressPercentage(progress: MarketplaceProgressResponse) {
  if (progress.percent !== null && progress.percent !== undefined) {
    const raw = Number(progress.percent)
    if (Number.isFinite(raw)) return Math.max(0, Math.min(100, raw))
  }
  const bytes = Number(progress.bytes) || 0
  const total = Number(progress.total_bytes) || 0
  if (total <= 0) return null
  return Math.max(0, Math.min(99, Math.round(bytes / total * 100)))
}

function progressMessage(progress: MarketplaceProgressResponse) {
  const phase = String(progress.phase || '')
  if (phase === 'prepare') {
    return t('settings.cloudProviders.preparingInstall', 'Preparing installation…')
  }
  if (phase === 'download') {
    return t('settings.cloudProviders.downloadingPackage', 'Downloading the cloud service…')
  }
  if (phase === 'install') {
    return t('settings.cloudProviders.installingPackage', 'Installing the cloud service…')
  }
  return String(progress.message || phase)
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds))
}

export function useCloudServices(options: UseCloudServicesOptions) {
  const marketplacePackages = shallowRef<MarketplacePackage[]>([])
  const marketplaceState = shallowRef<MarketplaceState>('loading')
  const marketplaceError = shallowRef('')
  const operationId = shallowRef('')
  const operation = shallowRef<CloudOperation>('')
  const installProgress = shallowRef<CloudInstallProgress | null>(null)
  let marketplaceGeneration = 0
  let operationGeneration = 0

  const marketplaceExtension = computed(() => options.catalog.value.find(
    (item) => item.id === PLUGIN_MARKETPLACE_ID && item.installed,
  ) || null)
  const services = computed(() => mergeCloudServiceCatalog(options.catalog.value, marketplacePackages.value))
  const featuredService = computed(() => services.value.find(
    (item) => item.id === FEATURED_CLOUD_SERVICE_ID,
  ) as CloudServiceEntry)
  const otherServices = computed(() => services.value.filter(
    (item) => item.id !== FEATURED_CLOUD_SERVICE_ID,
  ))
  const installedServices = computed(() => services.value.filter((item) => item.installed))
  const activeService = computed(() => enabledCloudService(options.catalog.value))
  const marketplaceUsable = computed(() => marketplaceState.value === 'ready')

  async function loadMarketplace(showLoading = true) {
    const generation = ++marketplaceGeneration
    const marketplace = marketplaceExtension.value
    marketplaceError.value = ''
    if (!marketplace) {
      marketplacePackages.value = []
      marketplaceState.value = 'missing'
      return
    }
    if (showLoading) marketplaceState.value = 'loading'
    try {
      await ensureExtensionShell(marketplace)
      const response = await invokeExtensionShell<MarketplaceListResponse>(
        PLUGIN_MARKETPLACE_ID,
        'listPackages',
      )
      if (generation !== marketplaceGeneration) return
      marketplacePackages.value = normalizeMarketplacePackages(response?.packages)
      marketplaceState.value = 'ready'
    } catch (reason) {
      if (generation !== marketplaceGeneration) return
      marketplacePackages.value = []
      marketplaceError.value = reason instanceof Error ? reason.message : String(reason)
      marketplaceState.value = marketplace.shell?.entrypoint ? 'error' : 'incompatible'
    }
  }

  async function refreshCatalog() {
    const catalog = await api.getExtensions()
    options.onCatalog(catalog)
    return catalog
  }

  async function waitForInstall(packageName: string, generation: number) {
    const deadline = Date.now() + 20 * 60 * 1000
    let sawJob = false
    while (Date.now() < deadline && generation === operationGeneration) {
      const progress = await invokeExtensionShell<MarketplaceProgressResponse>(
        PLUGIN_MARKETPLACE_ID,
        'installProgress',
      )
      if (generation !== operationGeneration) return
      const currentPackage = String(progress.package || '')
      if (currentPackage && currentPackage !== packageName) {
        await delay(250)
        continue
      }
      const phase = String(progress.phase || '')
      const status = String(progress.status || '')
      if (!currentPackage || status === 'idle' || phase === 'idle') {
        await delay(250)
        continue
      }
      installProgress.value = {
        percentage: progressPercentage(progress),
        message: progressMessage(progress),
      }
      if (progress.active || status === 'running' || ['prepare', 'download', 'install'].includes(phase)) {
        sawJob = true
      }
      if ((status === 'ok' || phase === 'done') && (sawJob || currentPackage === packageName)) return
      if (status === 'error' || phase === 'error') {
        throw new Error(String(progress.error || progress.message || t(
          'settings.cloudProviders.installFailed',
          'Cloud service installation failed. Try again.',
        )))
      }
      await delay(250)
    }
    if (generation === operationGeneration) {
      throw new Error(t(
        'settings.cloudProviders.installTimedOut',
        'Cloud service installation timed out. Try again.',
      ))
    }
  }

  async function install(service: CloudServiceEntry) {
    if (!marketplaceUsable.value) {
      throw new Error(t(
        'settings.cloudProviders.marketplaceUnavailable',
        'Plugin Marketplace is unavailable. Try again later or install a local package from Plugins.',
      ))
    }
    if (!service.marketplaceAvailable) {
      throw new Error(t(
        'settings.cloudProviders.packageUnavailable',
        'This cloud service is not available from the configured package sources.',
      ))
    }
    const generation = ++operationGeneration
    operationId.value = service.id
    operation.value = 'install'
    installProgress.value = { percentage: null, message: '' }
    try {
      const response = await invokeExtensionShell<MarketplaceInstallResponse>(
        PLUGIN_MARKETPLACE_ID,
        'installPackage',
        {
          package: service.packageName,
          wait: false,
          size_bytes: service.sizeBytes,
        },
      )
      if (response?.status && !['started', 'ok'].includes(response.status)) {
        throw new Error(t(
          'settings.cloudProviders.installRejected',
          'The Plugin Marketplace could not start this installation.',
        ))
      }
      await waitForInstall(service.packageName, generation)
      await refreshCatalog()
      await loadMarketplace(false)
    } finally {
      if (generation === operationGeneration) {
        operationId.value = ''
        operation.value = ''
        installProgress.value = null
      }
    }
  }

  async function activate(service: CloudServiceEntry) {
    if (!service.installed) {
      throw new Error(t(
        'settings.cloudProviders.installBeforeStart',
        'Install this cloud service before starting it.',
      ))
    }
    const generation = ++operationGeneration
    operationId.value = service.id
    operation.value = 'start'
    try {
      const enabled = options.catalog.value.filter(
        (item) => item.installed && item.kind === 'cloud-provider' && item.enabled && item.id !== service.id,
      )
      for (const current of enabled) await api.extensionAction(current.id, 'disable')
      if (!service.enabled) await api.extensionAction(service.id, 'enable')
      await refreshCatalog()
    } finally {
      if (generation === operationGeneration) {
        operationId.value = ''
        operation.value = ''
      }
    }
  }

  async function stop(service: CloudServiceEntry) {
    if (!service.installed || !service.enabled) return
    const generation = ++operationGeneration
    operationId.value = service.id
    operation.value = 'stop'
    try {
      await api.extensionAction(service.id, 'disable')
      await refreshCatalog()
    } finally {
      if (generation === operationGeneration) {
        operationId.value = ''
        operation.value = ''
      }
    }
  }

  watch(
    () => {
      const marketplace = marketplaceExtension.value
      return marketplace ? `${marketplace.id}@${marketplace.version || ''}:${marketplace.shell?.entrypoint || ''}` : ''
    },
    () => { void loadMarketplace() },
    { immediate: true },
  )

  onScopeDispose(() => {
    marketplaceGeneration += 1
    operationGeneration += 1
  })

  return {
    activeService,
    featuredService,
    install,
    installProgress,
    installedServices,
    loadMarketplace,
    marketplaceError,
    marketplaceState,
    marketplaceUsable,
    operation,
    operationId,
    otherServices,
    activate,
    stop,
  }
}
