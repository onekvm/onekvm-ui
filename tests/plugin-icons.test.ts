import assert from 'node:assert/strict'

import {
  JETKVM_CLOUD_ID,
  ONEKVM_CLOUD_ID,
  brandPluginIconUrl,
  pluginIcon,
} from '../src/lib/plugin-icons.ts'

assert.equal(brandPluginIconUrl(ONEKVM_CLOUD_ID), '/brand/onekvm-app-icon.svg')
assert.equal(brandPluginIconUrl(JETKVM_CLOUD_ID), '/brand/jetkvm-mark.svg')
assert.equal(brandPluginIconUrl('other'), '')

const branded = pluginIcon({ id: 'cloud', icon: { source: 'lucide', name: 'cloud' } })
assert.equal(branded.url, '/brand/onekvm-app-icon.svg')

const data = pluginIcon({
  id: 'cloud',
  icon_data_url: 'data:image/svg+xml;base64,abc',
})
assert.equal(data.url, 'data:image/svg+xml;base64,abc')

console.log('plugin-icons tests passed')
