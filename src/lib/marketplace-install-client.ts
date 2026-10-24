import { ensureExtensionShell, invokeExtensionShell } from '@/extensions/pluginUi'
import { type ExtensionSummary } from '@/api/client'
import { PLUGIN_MARKETPLACE_ID } from '@/lib/cloud-services'
import {
  marketplaceInstallPackageFromRecord,
  marketplaceInstallProgressFromRecord,
  type MarketplaceInstallErrors,
  type MarketplaceInstallPackage,
  type MarketplaceInstallProgress,
} from '@/lib/marketplace-install'

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
  error?: string
  message?: string
  percent?: number | null
  bytes?: number
  total_bytes?: number
  log?: string
  log_truncated?: boolean
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds))
}

export async function loadMarketplaceInstallPackage(extension: ExtensionSummary, id: string) {
  await ensureExtensionShell(extension)
  const response = await invokeExtensionShell<MarketplaceListResponse>(
    PLUGIN_MARKETPLACE_ID,
    'listPackages',
  )
  const packages = Array.isArray(response?.packages) ? response.packages : []
  for (const item of packages) {
    const match = marketplaceInstallPackageFromRecord(item, id)
    if (match) return match
  }
  return null
}

async function waitForMarketplaceInstall(
  packageName: string,
  errors: MarketplaceInstallErrors,
  onProgress?: (progress: MarketplaceInstallProgress) => void,
) {
  const deadline = Date.now() + 20 * 60 * 1000
  let sawJob = false
  while (Date.now() < deadline) {
    const progress = await invokeExtensionShell<MarketplaceProgressResponse>(
      PLUGIN_MARKETPLACE_ID,
      'installProgress',
    )
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
    onProgress?.(marketplaceInstallProgressFromRecord(progress))
    if (progress.active || status === 'running' || ['prepare', 'download', 'install'].includes(phase)) {
      sawJob = true
    }
    if ((status === 'ok' || phase === 'done') && (sawJob || currentPackage === packageName)) return
    if (status === 'error' || phase === 'error') {
      throw new Error(String(progress.error || progress.message || errors.failed))
    }
    await delay(250)
  }
  throw new Error(errors.timedOut)
}

// Same Plugin Marketplace shell calls the marketplace page uses:
// listPackages, installPackage, then installProgress until the job finishes.
export async function installMarketplacePackage(
  pkg: MarketplaceInstallPackage,
  errors: MarketplaceInstallErrors,
  onProgress?: (progress: MarketplaceInstallProgress) => void,
) {
  const response = await invokeExtensionShell<MarketplaceInstallResponse>(
    PLUGIN_MARKETPLACE_ID,
    'installPackage',
    {
      package: pkg.packageName,
      wait: false,
      size_bytes: pkg.sizeBytes,
    },
  )
  if (response?.status && !['started', 'ok'].includes(response.status)) {
    throw new Error(errors.rejected)
  }
  await waitForMarketplaceInstall(pkg.packageName, errors, onProgress)
}
