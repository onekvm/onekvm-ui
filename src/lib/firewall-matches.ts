import type { FirewallMatch } from '@/api/client'

export const matchFields = ['protocol', 'source-address', 'destination-address', 'source-port', 'destination-port', 'in-interface', 'out-interface'] as const
export type MatchField = typeof matchFields[number]

export function ruleMatches(rule: { matches?: FirewallMatch[]; protocol: string; port: string; source: string }): FirewallMatch[] {
  if (rule.matches) return rule.matches.map(item => ({ ...item }))
  const rows: FirewallMatch[] = []
  if (rule.protocol === 'tcp' || rule.protocol === 'udp') rows.push({ field: 'protocol', operator: 'eq', value: rule.protocol })
  if (rule.port) rows.push({ field: 'destination-port', operator: 'eq', value: rule.port })
  if (rule.source && !['any', 'Anywhere', 'anywhere', '0.0.0.0/0', '::/0'].includes(rule.source)) rows.push({ field: 'source-address', operator: 'eq', value: rule.source })
  return rows
}

export function legacyMatchFields(matches: FirewallMatch[]) {
  const value = (field: string) => matches.find(item => item.field === field && item.operator === 'eq')?.value || ''
  const protocol = value('protocol')
  return { protocol: protocol === 'tcp-udp' ? 'any' : protocol || 'any', port: value('destination-port'), source: value('source-address') }
}

/** Only these predicates can be edited through the simple port/whitelist UI. */
export function simpleMatches(matches: FirewallMatch[]) {
  return matches.some(item => item.field === 'destination-port' && item.operator === 'eq' && item.value)
    && matches.every(item => item.operator === 'eq' && (
      item.field === 'destination-port' || (item.field === 'source-address' && !['0.0.0.0/0', '::/0'].includes(item.value))
      || (item.field === 'protocol' && ['tcp', 'udp', 'tcp-udp'].includes(item.value))
    ))
}

export function validMatchPort(value: string) {
  let slots = 0
  return value.length <= 96 && value.split(',').every(entry => {
    const parts = entry.replace('-', ':').split(':')
    slots += parts.length
    return parts.length <= 2 && parts.every(part => /^\d+$/.test(part) && Number(part) >= 1 && Number(part) <= 65535)
      && (parts.length === 1 || Number(parts[0]) <= Number(parts[1]))
  }) && slots <= 15
}

export function validMatchAddress(value: string) {
  const [address, prefix, extra] = value.split('/')
  if (!address || extra !== undefined) return false
  const ipv6 = address.includes(':')
  if (prefix !== undefined && (!/^\d+$/.test(prefix) || Number(prefix) > (ipv6 ? 128 : 32))) return false
  if (!ipv6) return /^(\d{1,3}\.){3}\d{1,3}$/.test(address) && address.split('.').every(part => Number(part) <= 255)
  try { return new URL(`http://[${address}]/`).hostname.length > 0 } catch { return false }
}

export function validMatches(matches: FirewallMatch[], direction: string) {
  if (new Set(matches.map(item => item.field)).size !== matches.length) return false
  let family: boolean | undefined
  const families: boolean[] = []
  const protocol = matches.find(item => item.field === 'protocol')
  for (const item of matches) {
    if (!['eq', 'neq'].includes(item.operator)) return false
    switch (item.field) {
      case 'protocol':
        if (!['tcp', 'udp', 'tcp-udp', 'icmp', 'icmpv6'].includes(item.value) || (item.value === 'tcp-udp' && item.operator !== 'eq')) return false
        if (item.value.startsWith('icmp')) families.push(item.value === 'icmpv6')
        break
      case 'source-address': case 'destination-address':
        if (!validMatchAddress(item.value)) return false
        families.push(item.value.includes(':'))
        break
      case 'source-port': case 'destination-port':
        if (!validMatchPort(item.value) || (protocol && (protocol.operator !== 'eq' || !['tcp', 'udp', 'tcp-udp'].includes(protocol.value)))) return false
        break
      case 'in-interface': case 'out-interface':
        if (!/^[a-zA-Z0-9_.:-]{1,15}$/.test(item.value) || (item.field === 'in-interface' ? direction !== 'in' : direction !== 'out')) return false
        break
      default: return false
    }
  }
  family = families[0]
  return families.every(value => value === family)
}
