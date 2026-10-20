import type { VpnClientConfig } from '@/api/client'

export class VpnConfigError extends Error {
  readonly code: string
  readonly params: Record<string, string | number>

  constructor(code: string, params: Record<string, string | number> = {}, message = code) {
    super(message)
    this.name = 'VpnConfigError'
    this.code = code
    this.params = params
  }
}

export type VpnParseResult =
  | { kind: 'fields'; client: VpnClientConfig }
  | { kind: 'opaque' }

interface SourceLine {
  line: number
  text: string
}

export function serializeVpnConfig(client: VpnClientConfig): string {
  switch (client.kind) {
    case 'openvpn':
      return serializeOpenVPN(client)
    case 'pptp':
      return serializePPTP(client)
    case 'l2tp':
      return serializeL2TP(client)
    case 'pppoe':
      return serializePPPoE(client)
    default:
      return ''
  }
}

export function parseVpnConfig(text: string, current: VpnClientConfig): VpnParseResult {
  if (!text.trim()) return { kind: 'fields', client: cleared(current) }
  switch (current.kind) {
    case 'openvpn':
      return parseOpenVPN(text, current)
    case 'pptp':
      return { kind: 'fields', client: parsePeer(text, current, 'pptp') }
    case 'pppoe':
      return { kind: 'fields', client: parsePeer(text, current, 'pppoe') }
    case 'l2tp':
      return { kind: 'fields', client: parseL2TP(text, current) }
    default:
      throw new VpnConfigError('unsupportedLine', {}, 'Unsupported VPN type')
  }
}

function serializeOpenVPN(client: VpnClientConfig): string {
  const proto = (client.protocol || 'udp').toLowerCase() === 'tcp' ? 'tcp' : 'udp'
  const lines = ['client', 'dev tun', `proto ${proto}`]
  const remote = (client.remote || '').trim()
  if (remote) {
    const port = client.port && client.port >= 1 && client.port <= 65535 ? client.port : 1194
    lines.push(`remote ${remote} ${port}`)
  }
  lines.push('resolv-retry infinite', 'nobind', 'persist-key', 'persist-tun', 'verb 3')
  if (client.default_route) lines.push('redirect-gateway def1')
  return `${lines.join('\n')}\n`
}

function serializePPTP(client: VpnClientConfig): string {
  const lines: string[] = []
  const remote = (client.remote || '').trim()
  if (remote) lines.push(`pty "pptp ${remote} --nolaunchpppd"`)
  lines.push('require-mppe-128', 'noipdefault', 'usepeerdns')
  lines.push(...routeLines(Boolean(client.default_route)))
  lines.push(...pppTail(client))
  return `${lines.join('\n')}\n`
}

function serializePPPoE(client: VpnClientConfig): string {
  const lines = ['plugin rp-pppoe.so']
  const parent = (client.parent || '').trim()
  if (parent) lines.push(parent)
  const service = client.service || ''
  if (service) lines.push(`rp_pppoe_service ${quote(service)}`)
  lines.push('noipdefault', 'usepeerdns')
  lines.push(...routeLines(Boolean(client.default_route)))
  lines.push(...pppTail(client))
  return `${lines.join('\n')}\n`
}

function serializeL2TP(client: VpnClientConfig): string {
  const lines: string[] = []
  const remote = (client.remote || '').trim()
  if (remote) lines.push(`lns = ${remote}`)
  lines.push(
    'ppp debug = no',
    'autodial = yes',
    'redial = yes',
    'redial timeout = 5',
    'ipcp-accept-local',
    'ipcp-accept-remote',
    'refuse-eap',
    'noccp',
    'noauth',
  )
  lines.push(...routeLines(Boolean(client.default_route)))
  lines.push('usepeerdns')
  const username = client.username || ''
  if (username) lines.push(`user ${quote(username)}`)
  const password = client.password || ''
  if (password) lines.push(`password ${quote(password)}`)
  return `${lines.join('\n')}\n`
}

function routeLines(defaultRoute: boolean): string[] {
  return defaultRoute ? ['defaultroute', 'replacedefaultroute'] : ['nodefaultroute']
}

function pppTail(client: VpnClientConfig): string[] {
  const lines = [
    'hide-password',
    'lcp-echo-interval 20',
    'lcp-echo-failure 3',
    'noauth',
    'persist',
    'maxfail 0',
  ]
  const username = client.username || ''
  if (username) lines.push(`user ${quote(username)}`)
  const password = client.password || ''
  if (password) lines.push(`password ${quote(password)}`)
  return lines
}

function quote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function cleared(current: VpnClientConfig): VpnClientConfig {
  return {
    ...current,
    remote: '',
    port: current.kind === 'openvpn' ? 1194 : 0,
    protocol: current.kind === 'openvpn' ? 'udp' : '',
    parent: '',
    username: '',
    password: '',
    service: '',
    config: '',
    default_route: current.kind === 'pppoe',
  }
}

function sourceLines(text: string): SourceLine[] {
  return text.split(/\r?\n/).flatMap((raw, index) => {
    const text = raw.trim()
    if (!text || text.startsWith('#')) return []
    return [{ line: index + 1, text }]
  })
}

function fail(code: string, line: number, message: string): never {
  throw new VpnConfigError(code, { line }, message)
}

function readQuoted(rest: string, line: number): string {
  const trimmed = rest.trim()
  if (!trimmed.startsWith('"')) fail('quote', line, 'A quoted value is required')
  let index = 1
  let closed = -1
  while (index < trimmed.length) {
    if (trimmed[index] === '\\') {
      index += 2
      continue
    }
    if (trimmed[index] === '"') {
      closed = index
      break
    }
    index += 1
  }
  if (closed < 0) fail('quote', line, 'The quoted value is missing its closing quote')
  if (trimmed.slice(closed + 1).trim()) fail('unsupportedLine', line, 'Unsupported configuration line')
  return unescapeQuoted(trimmed.slice(1, closed), line)
}

function unescapeQuoted(body: string, line: number): string {
  let out = ''
  for (let index = 0; index < body.length; index += 1) {
    if (body[index] !== '\\') {
      out += body[index]
      continue
    }
    if (index + 1 >= body.length) fail('quote', line, 'The quoted value is missing its closing quote')
    out += body[index + 1]
    index += 1
  }
  return out
}

function parseOpenVPN(text: string, current: VpnClientConfig): VpnParseResult {
  let remote = ''
  let sawRemote = false
  let port = 1194
  let protocol = 'udp'
  let sawProtocol = false
  let defaultRoute = false
  let foreign = false
  let broken: VpnConfigError | null = null

  for (const entry of sourceLines(text)) {
    const { line, text: value } = entry
    if (['client', 'nobind', 'persist-key', 'persist-tun'].includes(value)) continue
    if (value === 'resolv-retry infinite' || value === 'verb 3' || value === 'dev tun') continue
    if (value === 'redirect-gateway def1') {
      defaultRoute = true
      continue
    }
    if (value === 'proto udp' || value === 'proto tcp') {
      protocol = value.slice(6)
      sawProtocol = true
      continue
    }
    if (value.startsWith('proto ') && value !== 'proto udp' && value !== 'proto tcp') {
      foreign = true
      continue
    }
    const remoteMatch = /^remote\s+(\S+)(?:\s+(\d+))?$/.exec(value)
    if (value.startsWith('remote')) {
      if (!remoteMatch) {
        if (value !== 'remote' && /^remote\s+\S+/.test(value)) foreign = true
        else broken ??= new VpnConfigError('remoteInvalid', { line }, 'The server address is invalid')
        continue
      }
      const parsedPort = remoteMatch[2] ? Number(remoteMatch[2]) : 1194
      if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
        broken ??= new VpnConfigError('portInvalid', { line }, 'The port must be from 1 to 65535')
        continue
      }
      remote = remoteMatch[1]
      port = parsedPort
      sawRemote = true
      continue
    }
    if (value === 'proto') {
      broken ??= new VpnConfigError('protocolInvalid', { line }, 'The protocol must be udp or tcp')
      continue
    }
    foreign = true
  }

  // A pasted .ovpn often carries certificates and options this form cannot edit.
  // Keep that file intact instead of rejecting it line by line.
  if (foreign) return { kind: 'opaque' }
  if (broken) throw broken
  return {
    kind: 'fields',
    client: {
      ...current,
      remote: sawRemote ? remote : '',
      port,
      protocol: sawProtocol ? protocol : 'udp',
      config: '',
      default_route: defaultRoute,
    },
  }
}

function parsePeer(text: string, current: VpnClientConfig, kind: 'pptp' | 'pppoe'): VpnClientConfig {
  let remote = ''
  let parent = ''
  let service = ''
  let username = ''
  let password = ''
  let defaultRoute: boolean | null = null
  let sawPlugin = false

  for (const entry of sourceLines(text)) {
    const { line, text: value } = entry
    if (isCommonPeerLine(value)) continue
    if (value === 'require-mppe-128') {
      if (kind !== 'pptp') fail('unsupportedLine', line, 'Unsupported configuration line')
      continue
    }
    if (value === 'plugin rp-pppoe.so') {
      if (kind !== 'pppoe') fail('unsupportedLine', line, 'Unsupported configuration line')
      sawPlugin = true
      continue
    }
    const route = readRoute(value, line, defaultRoute)
    if (route.matched) {
      defaultRoute = route.defaultRoute
      continue
    }
    const secret = readSecret(value, line)
    if (secret.kind === 'user') {
      username = secret.value
      continue
    }
    if (secret.kind === 'password') {
      password = secret.value
      continue
    }
    if (kind === 'pptp') {
      const pty = /^pty "pptp (.*) --nolaunchpppd"$/.exec(value)
      if (value.startsWith('pty ')) {
        if (!pty || !pty[1].trim()) fail('remoteInvalid', line, 'The server address is invalid')
        remote = pty[1].trim()
        continue
      }
    }
    if (kind === 'pppoe' && value.startsWith('rp_pppoe_service ')) {
      service = readQuoted(value.slice('rp_pppoe_service '.length), line)
      continue
    }
    if (kind === 'pppoe' && sawPlugin && !parent && /^[A-Za-z0-9_.:@-]+$/.test(value)) {
      parent = value
      continue
    }
    fail('unsupportedLine', line, 'Unsupported configuration line')
  }

  return {
    ...current,
    remote: kind === 'pptp' ? remote : '',
    parent: kind === 'pppoe' ? parent : '',
    service: kind === 'pppoe' ? service : '',
    username,
    password,
    config: '',
    default_route: Boolean(defaultRoute),
  }
}

function parseL2TP(text: string, current: VpnClientConfig): VpnClientConfig {
  let remote = ''
  let username = ''
  let password = ''
  let defaultRoute: boolean | null = null

  for (const entry of sourceLines(text)) {
    const { line, text: value } = entry
    if (value.startsWith('[lac ') && value.endsWith(']')) continue
    if (/^pppoptfile\s*=/.test(value)) continue
    if (['ppp debug = no', 'autodial = yes', 'redial = yes', 'redial timeout = 5'].includes(value)) continue
    if (['ipcp-accept-local', 'ipcp-accept-remote', 'refuse-eap', 'noccp', 'noauth', 'usepeerdns'].includes(value)) continue
    const route = readRoute(value, line, defaultRoute)
    if (route.matched) {
      defaultRoute = route.defaultRoute
      continue
    }
    const secret = readSecret(value, line)
    if (secret.kind === 'user') {
      username = secret.value
      continue
    }
    if (secret.kind === 'password') {
      password = secret.value
      continue
    }
    const server = /^lns\s*=\s*(\S+)$/.exec(value)
    if (value.startsWith('lns')) {
      if (!server) fail('remoteInvalid', line, 'The server address is invalid')
      remote = server[1]
      continue
    }
    fail('unsupportedLine', line, 'Unsupported configuration line')
  }

  return {
    ...current,
    remote,
    username,
    password,
    config: '',
    default_route: Boolean(defaultRoute),
  }
}

function isCommonPeerLine(value: string): boolean {
  return [
    'noipdefault',
    'usepeerdns',
    'hide-password',
    'lcp-echo-interval 20',
    'lcp-echo-failure 3',
    'noauth',
    'persist',
    'maxfail 0',
  ].includes(value)
}

function readRoute(value: string, line: number, current: boolean | null): { matched: boolean; defaultRoute: boolean | null } {
  if (value === 'defaultroute' || value === 'replacedefaultroute') {
    if (current === false) fail('unsupportedLine', line, 'Unsupported configuration line')
    return { matched: true, defaultRoute: true }
  }
  if (value === 'nodefaultroute') {
    if (current === true) fail('unsupportedLine', line, 'Unsupported configuration line')
    return { matched: true, defaultRoute: false }
  }
  return { matched: false, defaultRoute: current }
}

function readSecret(value: string, line: number): { kind: 'user' | 'password' | ''; value: string } {
  if (value.startsWith('user ')) return { kind: 'user', value: readQuoted(value.slice(5), line) }
  if (value.startsWith('password ')) return { kind: 'password', value: readQuoted(value.slice(9), line) }
  return { kind: '', value: '' }
}
