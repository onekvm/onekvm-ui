import assert from 'node:assert/strict'

import {
  applyPayload,
  collapseDraft,
  draftFromStatus,
  draftsEqual,
  enableProtection,
  extraRules,
  managementServices,
  protocolPort,
  reorderVisible,
  serviceEnabled,
  servicePortRules,
  setService,
  whitelistRules,
  type FirewallDraft,
  type FirewallRuleDraft,
  type FirewallStatus,
} from '../src/lib/firewall-draft.ts'

const services = managementServices(80, 443)

function draft(rules: FirewallRuleDraft[] = [], allowSources: string[] = []): FirewallDraft {
  return { enabled: false, defaultIncoming: 'deny', defaultOutgoing: 'allow', rules, allowSources }
}

function allow(port: string, extra: Partial<FirewallRuleDraft> = {}): FirewallRuleDraft {
  return { id: Number(port) || 1, action: 'allow', direction: 'in', protocol: 'tcp', port, source: '', comment: '', ...extra }
}

assert.deepEqual(managementServices(443, 443).find((service) => service.id === 'web')?.ports, [443])
assert.equal(serviceEnabled([], services[0]), false)

const opened = setService([], services[0], true)
assert.equal(serviceEnabled(opened, services[0]), true)
assert.deepEqual(opened.map((rule) => rule.port).sort(), ['443', '80'])

const kept = setService([allow('22', { source: '10.0.0.0/8', id: 9 })], services[1], false)
assert.equal(kept.length, 1)
assert.equal(kept[0].source, '10.0.0.0/8')

const protectedDraft = enableProtection(draft(), services)
assert.equal(protectedDraft.enabled, true)
assert.equal(protectedDraft.defaultIncoming, 'deny')
assert.equal(serviceEnabled(protectedDraft.rules, services[0]), true)
assert.equal(serviceEnabled(protectedDraft.rules, services[1]), true)

const extras = extraRules([
  allow('80'),
  allow('5900', { protocol: 'tcp', id: 4 }),
  allow('22', { action: 'deny', id: 5 }),
], services)
assert.deepEqual(extras.map((rule) => rule.port), ['5900', '22'])

assert.equal(draftsEqual(draft([allow('80', { source: 'Anywhere' })]), draft([allow('80', { source: '' })])), true)
assert.equal(draftsEqual(draft(), { ...draft(), enabled: true }), false)
assert.equal(draftsEqual(draft([allow('80', { id: 1 }), allow('443', { id: 2 })]), draft([allow('443', { id: 2 }), allow('80', { id: 1 })])), false)

const reordered = reorderVisible([
  allow('80', { id: 1 }),
  allow('5900', { id: 2 }),
  allow('22', { id: 3 }),
  allow('5901', { id: 4 }),
], [2, 4], 4, 2)
assert.deepEqual(reordered.map((rule) => rule.port), ['80', '5901', '22', '5900'])
assert.equal(protocolPort('tcp', '22'), 'TCP/22')
assert.equal(protocolPort('udp', '53'), 'UDP/53')
assert.equal(protocolPort('any', '443'), 'TCP/UDP/443')
assert.deepEqual(whitelistRules([
  allow('22', { id: 1 }),
  allow('53', { id: 2, protocol: 'udp', direction: 'out' }),
  allow('80', { id: 3, action: 'deny' }),
]).map((rule) => rule.port), ['22'])

const status = {
  available: true,
  enabled: false,
  default_incoming: 'deny',
  default_outgoing: 'allow',
  logging: 'off',
  rules: [
    allow('22', { id: 1, source: '10.0.0.0/8' }),
    allow('22', { id: 2, source: '192.168.1.10' }),
    allow('80', { id: 3, source: '10.0.0.0/8' }),
    allow('80', { id: 4, source: '192.168.1.10' }),
  ],
  confirmation: { pending: false, deadline: '', seconds_remaining: 0, confirm_token: '', ready: false, applying: false },
} as FirewallStatus
const collapsed = draftFromStatus(status)
assert.deepEqual(collapsed.allowSources, ['10.0.0.0/8', '192.168.1.10'])
assert.deepEqual(servicePortRules(collapsed.rules).map((rule) => rule.port), ['22', '80'])
assert.equal(collapsed.rules.every((rule) => rule.source === ''), true)
const payload = applyPayload(collapsed)
assert.deepEqual(payload.rules?.map((rule) => `${rule.port}@${rule.source}`), [
  '22@10.0.0.0/8',
  '22@192.168.1.10',
  '80@10.0.0.0/8',
  '80@192.168.1.10',
])
assert.equal(draftsEqual(collapsed, draft([
  allow('22', { id: 1, source: '10.0.0.0/8' }),
  allow('22', { id: 2, source: '192.168.1.10' }),
  allow('80', { id: 3, source: '10.0.0.0/8' }),
  allow('80', { id: 4, source: '192.168.1.10' }),
])), true)
const mixed = collapseDraft(draft([
  allow('22', { id: 1, source: '10.0.0.0/8' }),
  allow('80', { id: 2, source: '192.168.1.10' }),
]))
assert.deepEqual(mixed.allowSources, [])
assert.equal(mixed.rules.length, 2)
