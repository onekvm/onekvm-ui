import type { FirewallRule, FirewallStatus, FirewallUpdate } from '@/api/client'

export interface FirewallRuleDraft {
  id: number
  action: string
  direction: string
  protocol: string
  port: string
  source: string
  comment: string
}

export interface FirewallDraft {
  enabled: boolean
  defaultIncoming: string
  defaultOutgoing: string
  rules: FirewallRuleDraft[]
  /** Source addresses allowed to use the incoming allow ports. Empty means any address. */
  allowSources: string[]
}

export interface ServiceDef {
  id: 'web' | 'ssh'
  ports: number[]
  protocol: 'tcp'
}

const ANYWHERE = new Set(['', 'any', 'Anywhere', 'anywhere', '0.0.0.0/0', '::/0'])

export function isAnywhere(source: string) {
  return ANYWHERE.has(source.trim())
}

export function protocolPort(protocol: string, port: string) {
  const name = protocol === 'udp' ? 'UDP' : protocol === 'tcp' ? 'TCP' : 'TCP/UDP'
  return `${name}/${port}`
}

export function whitelistRules(rules: FirewallRuleDraft[]) {
  return rules.filter((rule) => rule.action === 'allow' && rule.direction === 'in')
}

export function servicePortRules(rules: FirewallRuleDraft[]) {
  const seen = new Set<string>()
  const ports: FirewallRuleDraft[] = []
  for (const rule of whitelistRules(rules)) {
    const key = portKey(rule)
    if (seen.has(key)) continue
    seen.add(key)
    ports.push(rule)
  }
  return ports
}

export function managementServices(httpPort: number, httpsPort: number): ServiceDef[] {
  const web = [...new Set([httpPort, httpsPort].filter((port) => port > 0 && port < 65536))]
  return [
    { id: 'web', ports: web.length ? web : [80, 443], protocol: 'tcp' },
    { id: 'ssh', ports: [22], protocol: 'tcp' },
  ]
}

export function draftFromStatus(status: FirewallStatus): FirewallDraft {
  return collapseDraft({
    enabled: status.enabled,
    defaultIncoming: status.default_incoming || 'deny',
    defaultOutgoing: status.default_outgoing || 'allow',
    rules: status.rules.map((rule) => normalizeRule(rule)),
    allowSources: [],
  })
}

export function applyPayload(draft: FirewallDraft): FirewallUpdate {
  return {
    enabled: draft.enabled,
    default_incoming: draft.defaultIncoming,
    default_outgoing: draft.defaultOutgoing,
    protect_management: false,
    rules: expandAllowSources(draft.rules, draft.allowSources).map((rule) => ({
      action: rule.action,
      direction: rule.direction,
      protocol: rule.protocol || 'any',
      port: rule.port.trim(),
      source: isAnywhere(rule.source) ? undefined : rule.source.trim(),
      comment: rule.comment.trim() || undefined,
    })),
  }
}

export function expandDraft(draft: FirewallDraft): FirewallDraft {
  if (!draft.allowSources.length) return { ...draft, allowSources: [] }
  let nextId = Math.min(0, ...draft.rules.map((rule) => rule.id)) - 1
  const rules: FirewallRuleDraft[] = []
  for (const rule of draft.rules) {
    if (!(rule.action === 'allow' && rule.direction === 'in' && isAnywhere(rule.source))) {
      rules.push(rule)
      continue
    }
    draft.allowSources.forEach((source, index) => {
      rules.push({ ...rule, source, id: index === 0 ? rule.id : nextId-- })
    })
  }
  return { ...draft, allowSources: [], rules }
}

export function collapseDraft(draft: FirewallDraft): FirewallDraft {
  const expanded = expandAllowSources(draft.rules, draft.allowSources)
  const collapsed = collapseAllowSources(expanded)
  return { ...draft, ...collapsed }
}

export function draftsEqual(left: FirewallDraft, right: FirewallDraft) {
  return JSON.stringify(signature(left)) === JSON.stringify(signature(right))
}

export function serviceEnabled(rules: FirewallRuleDraft[], service: ServiceDef) {
  return service.ports.every((port) => rules.some((rule) => matchesServicePort(rule, service, port)))
}

export function setService(rules: FirewallRuleDraft[], service: ServiceDef, enabled: boolean) {
  const next = rules.filter((rule) => !service.ports.some((port) => matchesServicePort(rule, service, port)) || enabled)
  if (!enabled) return next.filter((rule) => !service.ports.some((port) => matchesServicePort(rule, service, port)))
  for (const port of service.ports) {
    if (!next.some((rule) => matchesServicePort(rule, service, port))) {
      next.push({
        id: -(next.length + port + 1),
        action: 'allow',
        direction: 'in',
        protocol: service.protocol,
        port: String(port),
        source: '',
        comment: '',
      })
    }
  }
  return next
}

export function extraRules(rules: FirewallRuleDraft[], services: ServiceDef[]) {
  return rules.filter((rule) => !services.some((service) => service.ports.some((port) => matchesServicePort(rule, service, port))))
}

export function enableProtection(draft: FirewallDraft, services: ServiceDef[]): FirewallDraft {
  return {
    enabled: true,
    defaultIncoming: 'deny',
    defaultOutgoing: draft.defaultOutgoing || 'allow',
    allowSources: draft.allowSources,
    rules: services.reduce((rules, service) => setService(rules, service, true), draft.rules),
  }
}

export function reorderVisible(rules: FirewallRuleDraft[], visibleIds: number[], fromId: number, toId: number) {
  const from = visibleIds.indexOf(fromId)
  const to = visibleIds.indexOf(toId)
  if (from < 0 || to < 0 || from === to) return rules
  const order = visibleIds.slice()
  const [moved] = order.splice(from, 1)
  order.splice(to, 0, moved)
  const byId = new Map(rules.map((rule) => [rule.id, rule]))
  let cursor = 0
  return rules.map((rule) => {
    if (!visibleIds.includes(rule.id)) return rule
    return byId.get(order[cursor++]) ?? rule
  })
}

export function matchesServicePort(rule: FirewallRuleDraft, service: ServiceDef, port: number) {
  return rule.action === 'allow'
    && rule.direction === 'in'
    && rule.port.trim() === String(port)
    && (rule.protocol === service.protocol || rule.protocol === 'any' || rule.protocol === '')
    && isAnywhere(rule.source)
}

function normalizeRule(rule: FirewallRule): FirewallRuleDraft {
  return {
    id: rule.id,
    action: rule.action,
    direction: rule.direction,
    protocol: rule.protocol || 'any',
    port: rule.port,
    source: isAnywhere(rule.source) ? '' : rule.source,
    comment: rule.comment || '',
  }
}

function portKey(rule: Pick<FirewallRuleDraft, 'protocol' | 'port' | 'comment'>) {
  return `${rule.protocol || 'any'}|${rule.port.trim()}|${rule.comment.trim()}`
}

function expandAllowSources(rules: FirewallRuleDraft[], sources: string[]) {
  const allowSources = sources.map((source) => source.trim()).filter((source) => source && !isAnywhere(source))
  if (!allowSources.length) return rules
  const expanded: FirewallRuleDraft[] = []
  for (const rule of rules) {
    if (!(rule.action === 'allow' && rule.direction === 'in' && isAnywhere(rule.source))) {
      expanded.push(rule)
      continue
    }
    for (const source of allowSources) expanded.push({ ...rule, source })
  }
  return expanded
}

function collapseAllowSources(rules: FirewallRuleDraft[]) {
  const incoming = whitelistRules(rules)
  if (!incoming.length || incoming.some((rule) => isAnywhere(rule.source))) {
    return { rules, allowSources: [] as string[] }
  }
  const groups = new Map<string, string[]>()
  for (const rule of incoming) {
    const key = portKey(rule)
    const sources = groups.get(key) ?? []
    if (!sources.includes(rule.source.trim())) sources.push(rule.source.trim())
    groups.set(key, sources)
  }
  const sets = [...groups.values()].map((sources) => sources.join('\n'))
  if (new Set(sets).size !== 1) return { rules, allowSources: [] as string[] }
  const allowSources = groups.values().next().value ?? []
  const seen = new Set<string>()
  const collapsed: FirewallRuleDraft[] = []
  for (const rule of rules) {
    if (!(rule.action === 'allow' && rule.direction === 'in')) {
      collapsed.push(rule)
      continue
    }
    const key = portKey(rule)
    if (seen.has(key)) continue
    seen.add(key)
    collapsed.push({ ...rule, source: '' })
  }
  return { rules: collapsed, allowSources }
}

function signature(draft: FirewallDraft) {
  return {
    enabled: draft.enabled,
    defaultIncoming: draft.defaultIncoming,
    defaultOutgoing: draft.defaultOutgoing,
    rules: expandAllowSources(draft.rules, draft.allowSources).map((rule) => ({
      action: rule.action,
      direction: rule.direction,
      protocol: rule.protocol || 'any',
      port: rule.port.trim(),
      source: isAnywhere(rule.source) ? '' : rule.source.trim(),
      comment: rule.comment.trim(),
    })),
  }
}
