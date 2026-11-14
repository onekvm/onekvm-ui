import assert from 'node:assert/strict'

import type { ExtensionStatus } from '../src/api/client.ts'
import { validateExtensionSettings } from '../src/lib/extension-settings.ts'

const extension: Pick<ExtensionStatus, 'settings_schema' | 'settings'> = {
  settings_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['dhcp', 'ipv4', 'hostname', 'listen_port'],
    properties: {
      dhcp: { type: 'boolean', title: 'Automatic IP' },
      ipv4: { type: 'string', title: 'Virtual IPv4', maxLength: 18 },
      hostname: { type: 'string', title: 'Hostname', maxLength: 253 },
      listen_port: { type: 'integer', title: 'Listen port', minimum: 1, maximum: 65535 },
      status: { type: 'string', title: 'Status', readOnly: true },
    },
  },
  settings: { dhcp: true, ipv4: '', hostname: 'onekvm', listen_port: 11010 },
}

// EasyTier's automatic mode deliberately submits an empty IPv4 string.
assert.equal(validateExtensionSettings(extension, { dhcp: true, ipv4: '' }), null)
assert.equal(validateExtensionSettings(extension, { hostname: '' }), null)
assert.equal(validateExtensionSettings(extension, { dhcp: false, ipv4: '10.1.2.3/24' }), null)
assert.equal(validateExtensionSettings(extension, { listen_port: 12000 }), null)

const { ipv4: _ipv4, ...missingIPv4 } = extension.settings
assert.equal(validateExtensionSettings({ ...extension, settings: missingIPv4 }, {}), 'ipv4 is required')
assert.equal(validateExtensionSettings({ ...extension, settings: missingIPv4 }, { ipv4: '' }), null)
assert.equal(validateExtensionSettings(extension, { ipv4: null }), 'ipv4 is required')
assert.equal(validateExtensionSettings(extension, { ipv4: false }), 'ipv4 must be a string')
assert.equal(validateExtensionSettings(extension, { dhcp: 'true' }), 'dhcp must be a boolean')
assert.equal(validateExtensionSettings(extension, { ipv4: 'a'.repeat(19) }), 'ipv4 exceeds its maximum length')
assert.equal(validateExtensionSettings(extension, { listen_port: 0 }), 'listen_port is too small')
assert.equal(validateExtensionSettings(extension, { listen_port: 65536 }), 'listen_port is too large')
assert.equal(validateExtensionSettings(extension, { listen_port: 1.5 }), 'listen_port must be an integer')
assert.equal(validateExtensionSettings(extension, { status: 'ready' }), 'status is read-only')
assert.equal(validateExtensionSettings(extension, { other: '' }), 'Unknown setting other')

// A saved secret is redacted from settings and left out of updates that keep it.
const withSecret = {
  settings_schema: {
    type: 'object' as const,
    additionalProperties: false,
    required: ['api_key', 'model'],
    properties: {
      api_key: { type: 'string' as const, title: 'API key', format: 'password' },
      model: { type: 'string' as const, title: 'Model' },
    },
  },
  settings: { model: 'm' },
}
assert.equal(validateExtensionSettings(withSecret, { model: 'n' }), 'api_key is required')
assert.equal(validateExtensionSettings({ ...withSecret, secrets_configured: ['/api_key'] }, { model: 'n' }), null)
assert.equal(validateExtensionSettings({ ...withSecret, secrets_configured: ['/api_key'] }, { api_key: null }), 'api_key is required')

console.log('extension-settings tests passed')
