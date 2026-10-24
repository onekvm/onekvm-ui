import assert from 'node:assert/strict'

import {
  WIREGUARD_MARKETPLACE_ID,
  fillMarketplaceTemplate,
  marketplaceFormatPackageSize,
  marketplaceInstallPackageFromRecord,
  marketplaceInstallProgressFromRecord,
  marketplacePackageMatches,
  marketplacePackageText,
  marketplacePackageVersionText,
  marketplaceProgressPercent,
} from '../src/lib/marketplace-install.ts'

assert.equal(WIREGUARD_MARKETPLACE_ID, 'wireguard')

const wireguard = { id: 'wireguard', package: 'onekvm-extension-wireguard' }
assert.equal(marketplacePackageMatches(wireguard, 'wireguard'), true)
assert.equal(marketplacePackageMatches(wireguard, 'onekvm-extension-wireguard'), true)
assert.equal(marketplacePackageMatches(wireguard, ' wireguard '), true)
assert.equal(marketplacePackageMatches(wireguard, 'tailscale'), false)
assert.equal(marketplacePackageMatches(wireguard, ''), false)

const parsed = marketplaceInstallPackageFromRecord({
  id: 'wireguard',
  package: 'onekvm-extension-wireguard',
  name: 'WireGuard',
  description: 'Installs wg.',
  version: '0.1.0',
  installed_version: '0.1.0',
  package_version: '0.1.0-r0',
  installed_package_version: '0.1.0-r0',
  update_available: false,
  size_bytes: 4096,
  installed_size_bytes: 8192,
  icon_data_url: 'data:image/svg+xml;base64,abc',
  icon: { source: 'lucide', name: 'cloud' },
  i18n: { zh: { name: 'WireGuard', description: '安装 wg。' } },
}, 'wireguard')
assert.ok(parsed)
assert.equal(parsed?.packageName, 'onekvm-extension-wireguard')
assert.equal(parsed?.sizeBytes, 4096)
assert.equal(parsed?.installedSizeBytes, 8192)
assert.equal(parsed?.iconDataUrl, 'data:image/svg+xml;base64,abc')
assert.deepEqual(parsed?.icon, {
  source: 'lucide',
  name: 'cloud',
})
assert.equal(marketplacePackageText(parsed!, 'zh').description, '安装 wg。')
assert.equal(marketplacePackageText(parsed!, 'en').description, 'Installs wg.')
assert.equal(marketplacePackageVersionText(parsed!), '0.1.0')
assert.equal(marketplaceInstallPackageFromRecord({ id: 'other', package: 'onekvm-extension-other' }, 'wireguard'), null)
assert.equal(marketplaceInstallPackageFromRecord(null, 'wireguard'), null)
assert.equal(marketplaceInstallPackageFromRecord({ id: 'wireguard', package: 'onekvm-extension-wireguard', icon_data_url: 'text' }, 'wireguard')?.iconDataUrl, '')

const customIcon = marketplaceInstallPackageFromRecord({
  id: 'firewall',
  package: 'onekvm-extension-firewall',
  icon: { source: 'custom', path: 'assets/icon.svg', data: 'data:image/svg+xml;base64,xyz' },
}, 'firewall')
assert.deepEqual(customIcon?.icon, {
  source: 'custom',
  path: 'assets/icon.svg',
  data: 'data:image/svg+xml;base64,xyz',
})

const update = marketplaceInstallPackageFromRecord({
  id: 'wireguard',
  package: 'onekvm-extension-wireguard',
  version: '0.1.0',
  installed_version: '0.1.0',
  package_version: '0.1.0-r1',
  installed_package_version: '0.1.0-r0',
  update_available: true,
}, 'wireguard')
assert.equal(marketplacePackageVersionText(update!), '0.1.0-r0 → 0.1.0-r1')

assert.equal(marketplaceProgressPercent({ percent: 140, bytes: 1, totalBytes: 2 }), 100)
assert.equal(marketplaceProgressPercent({ percent: null, bytes: 50, totalBytes: 200 }), 25)
assert.equal(marketplaceProgressPercent({ percent: null, bytes: 0, totalBytes: 0 }), null)
assert.equal(marketplaceInstallProgressFromRecord({ phase: 'download', percent: null, bytes: 10, total_bytes: 20, status: 'running' }).totalBytes, 20)
const failureProgress = marketplaceInstallProgressFromRecord({
  phase: 'error', status: 'error', log: 'opkg diagnostic\nPrevious extension restored\n', log_truncated: true,
})
assert.equal(failureProgress.log, 'opkg diagnostic\nPrevious extension restored\n')
assert.equal(failureProgress.logTruncated, true)
assert.equal(marketplaceInstallProgressFromRecord({ phase: 'prepare' }).log, '')
assert.equal(marketplaceFormatPackageSize(2048), '2 KiB')
assert.equal(fillMarketplaceTemplate('Install "{name}"', { name: 'WireGuard' }), 'Install "WireGuard"')
