import assert from 'node:assert/strict'

import type { VpnClientConfig } from '../src/api/client.ts'
import { parseVpnConfig, serializeVpnConfig, VpnConfigError } from '../src/lib/vpn-config.ts'

function client(overrides: Partial<VpnClientConfig> = {}): VpnClientConfig {
  return {
    kind: 'openvpn',
    name: 'openvpn0',
    enabled: true,
    remote: '',
    port: 1194,
    protocol: 'udp',
    parent: '',
    username: '',
    password: '',
    service: '',
    config: '',
    default_route: false,
    ...overrides,
  }
}

function fieldsOf(text: string, current: VpnClientConfig): VpnClientConfig {
  const parsed = parseVpnConfig(text, current)
  assert.equal(parsed.kind, 'fields')
  if (parsed.kind !== 'fields') throw new Error('expected fields')
  return parsed.client
}

const generatedOpenVPN = serializeVpnConfig(client())
assert.match(generatedOpenVPN, /^client\ndev tun\nproto udp\nresolv-retry infinite\n/)
assert.doesNotMatch(generatedOpenVPN, /remote /)
const parsedOpenVPN = fieldsOf(generatedOpenVPN, client({ remote: 'stale.example', username: 'kept' }))
assert.equal(parsedOpenVPN.remote, '')
assert.equal(parsedOpenVPN.port, 1194)
assert.equal(parsedOpenVPN.protocol, 'udp')
assert.equal(parsedOpenVPN.username, 'kept')
assert.equal(parsedOpenVPN.config, '')

const filledOpenVPN = client({
  remote: 'vpn.example.com',
  port: 1195,
  protocol: 'tcp',
  username: 'ada',
  password: 'secret',
  default_route: true,
})
const filledOpenVPNText = serializeVpnConfig(filledOpenVPN)
assert.match(filledOpenVPNText, /proto tcp\nremote vpn\.example\.com 1195\n/)
assert.match(filledOpenVPNText, /redirect-gateway def1\n$/)
assert.doesNotMatch(filledOpenVPNText, /secret/)
const roundTripOpenVPN = fieldsOf(filledOpenVPNText, filledOpenVPN)
assert.equal(roundTripOpenVPN.remote, 'vpn.example.com')
assert.equal(roundTripOpenVPN.port, 1195)
assert.equal(roundTripOpenVPN.protocol, 'tcp')
assert.equal(roundTripOpenVPN.default_route, true)
assert.equal(roundTripOpenVPN.username, 'ada')
assert.equal(roundTripOpenVPN.password, 'secret')

const customOpenVPN = parseVpnConfig(`${generatedOpenVPN}<ca>\nCERT\n</ca>\n`, client())
assert.equal(customOpenVPN.kind, 'opaque')
const udp6 = parseVpnConfig('client\ndev tun\nproto udp6\nremote vpn.example.com 1194\n', client())
assert.equal(udp6.kind, 'opaque')

assert.throws(
  () => parseVpnConfig('client\nproto \n', client()),
  (error: unknown) => error instanceof VpnConfigError && error.code === 'protocolInvalid' && error.params.line === 2,
)

const pptp = client({
  kind: 'pptp',
  name: 'pptp0',
  remote: 'vpn.example.com',
  username: 'ada',
  password: 'se"cret',
  default_route: true,
})
const pptpText = serializeVpnConfig(pptp)
assert.match(pptpText, /^pty "pptp vpn\.example\.com --nolaunchpppd"\nrequire-mppe-128\n/)
assert.match(pptpText, /user "ada"\npassword "se\\"cret"\n$/)
const pptpParsed = fieldsOf(pptpText, client({ kind: 'pptp', name: 'pptp0' }))
assert.equal(pptpParsed.remote, 'vpn.example.com')
assert.equal(pptpParsed.username, 'ada')
assert.equal(pptpParsed.password, 'se"cret')
assert.equal(pptpParsed.default_route, true)
assert.equal(pptpParsed.config, '')

const emptyPPTP = fieldsOf(serializeVpnConfig(client({ kind: 'pptp', name: 'pptp0' })), client({ kind: 'pptp', name: 'pptp0', remote: 'old' }))
assert.equal(emptyPPTP.remote, '')
assert.equal(emptyPPTP.username, '')
assert.equal(emptyPPTP.default_route, false)

assert.throws(
  () => parseVpnConfig(`${serializeVpnConfig(client({ kind: 'pptp', name: 'pptp0' }))}Foo = 1\n`, client({ kind: 'pptp', name: 'pptp0' })),
  (error: unknown) => error instanceof VpnConfigError && error.code === 'unsupportedLine' && error.params.line === 11,
)

const pppoe = client({
  kind: 'pppoe',
  name: 'pppoe0',
  parent: 'eth0',
  service: 'isp',
  username: 'ada',
  password: 'secret',
  default_route: true,
})
const pppoeParsed = fieldsOf(serializeVpnConfig(pppoe), client({ kind: 'pppoe', name: 'pppoe0', default_route: false }))
assert.equal(pppoeParsed.parent, 'eth0')
assert.equal(pppoeParsed.service, 'isp')
assert.equal(pppoeParsed.username, 'ada')
assert.equal(pppoeParsed.password, 'secret')
assert.equal(pppoeParsed.default_route, true)

const l2tp = client({
  kind: 'l2tp',
  name: 'l2tp0',
  remote: 'l2tp.example.com',
  username: 'ada',
  password: 'secret',
})
const l2tpText = `[lac l2tp0]\npppoptfile = /etc/onekvm/vpn/l2tp/l2tp0.options\n${serializeVpnConfig(l2tp)}`
const l2tpParsed = fieldsOf(l2tpText, client({ kind: 'l2tp', name: 'l2tp0', default_route: true }))
assert.equal(l2tpParsed.name, 'l2tp0')
assert.equal(l2tpParsed.remote, 'l2tp.example.com')
assert.equal(l2tpParsed.username, 'ada')
assert.equal(l2tpParsed.password, 'secret')
assert.equal(l2tpParsed.default_route, false)

const emptied = fieldsOf('   \n# comment\n', client({ remote: 'vpn.example.com', username: 'ada' }))
assert.equal(emptied.remote, '')
assert.equal(emptied.username, 'ada')
assert.equal(emptied.port, 1194)
