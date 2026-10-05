import assert from 'node:assert/strict'

import {
  enabledCloudService,
  mergeCloudServiceCatalog,
} from '../src/lib/cloud-services.ts'

const catalog = [{
  id: 'cloud-other',
  name: 'Other Cloud',
  kind: 'cloud-provider',
  installed: true,
  enabled: true,
  running: true,
}]
const marketplace = [
  {
    id: 'cloud-other',
    package: 'onekvm-extension-cloud-other',
    name: 'Other Cloud',
    kind: 'cloud-provider',
    installed: true,
    size_bytes: 10,
  },
  {
    id: 'protocol-example',
    package: 'onekvm-extension-protocol-example',
    name: 'Protocol',
    kind: 'protocol',
    installed: false,
  },
]

const merged = mergeCloudServiceCatalog(catalog, marketplace)
assert.equal(merged[0].id, 'cloud')
assert.equal(merged[0].marketplaceAvailable, false)
assert.equal(merged.length, 2)
assert.equal(merged[1].id, 'cloud-other')
assert.equal(merged[1].enabled, true)
assert.equal(merged[1].marketplaceAvailable, true)
assert.equal(merged[1].sizeBytes, 10)
assert.equal(enabledCloudService(catalog)?.id, 'cloud-other')

console.log('cloud-services tests passed')
