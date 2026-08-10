import type { WireGuardConfig, WireGuardPeer } from '@/api/client'
import { validCIDR, validEndpoint, validWireGuardKey } from '@/lib/network'
import { wireGuardPublicKeyFromBase64 } from '@/lib/wireguard'

function list(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

function integer(value: string, field: string) {
  if (!/^\d+$/.test(value)) throw new Error(`${field} must be an integer`)
  const result = Number(value)
  if (result < 0 || result > 65535) throw new Error(`${field} must be between 0 and 65535`)
  return result
}

function validate(config: WireGuardConfig) {
  if (config.private_key && !validWireGuardKey(config.private_key)) throw new Error('PrivateKey must be a 32-byte base64 WireGuard key')
  if (!config.private_key && !validWireGuardKey(config.public_key)) throw new Error('PrivateKey is required for a new WireGuard interface')
  if (!config.addresses.length || config.addresses.some((address) => !validCIDR(address, address.includes(':') ? 6 : 4))) {
    throw new Error('Address must contain valid IPv4 or IPv6 prefixes')
  }
  for (const [index, peer] of config.peers.entries()) {
    if (!validWireGuardKey(peer.public_key)) throw new Error(`Peer ${index + 1} PublicKey is invalid`)
    if (peer.preshared_key && !validWireGuardKey(peer.preshared_key)) throw new Error(`Peer ${index + 1} PresharedKey is invalid`)
    if (!peer.allowed_ips.length || peer.allowed_ips.some((address) => !validCIDR(address, address.includes(':') ? 6 : 4))) {
      throw new Error(`Peer ${index + 1} AllowedIPs is invalid`)
    }
    if (peer.endpoint && !validEndpoint(peer.endpoint)) throw new Error(`Peer ${index + 1} Endpoint is invalid`)
  }
}

export function serializeWireGuardConfig(config: WireGuardConfig) {
  const output = ['[Interface]']
  if (config.private_key) output.push(`PrivateKey = ${config.private_key}`)
  else if (config.public_key) output.push('# PrivateKey is configured and hidden; add PrivateKey to replace it.')
  if (config.addresses.length) output.push(`Address = ${config.addresses.join(', ')}`)
  if (config.listen_port) output.push(`ListenPort = ${config.listen_port}`)
  for (const peer of config.peers) {
    output.push('', '[Peer]', `PublicKey = ${peer.public_key}`)
    if (peer.preshared_key) output.push(`PresharedKey = ${peer.preshared_key}`)
    if (peer.endpoint) output.push(`Endpoint = ${peer.endpoint}`)
    output.push(`AllowedIPs = ${peer.allowed_ips.join(', ')}`)
    if (peer.persistent_keepalive) output.push(`PersistentKeepalive = ${peer.persistent_keepalive}`)
  }
  return `${output.join('\n')}\n`
}

export function parseWireGuardConfig(source: string, current: WireGuardConfig): WireGuardConfig {
  const config: WireGuardConfig = {
    name: current.name,
    private_key: '',
    public_key: current.public_key,
    addresses: [],
    listen_port: 0,
    peers: [],
  }
  let section: 'interface' | 'peer' | '' = ''
  let peer: WireGuardPeer | undefined
  let interfaceSeen = false

  for (const [lineIndex, sourceLine] of source.split(/\r?\n/).entries()) {
    const line = sourceLine.trim()
    if (!line || line.startsWith('#') || line.startsWith(';')) continue
    const sectionMatch = line.match(/^\[([^\]]+)\]$/)
    if (sectionMatch) {
      const sectionName = sectionMatch[1].toLowerCase()
      if (sectionName === 'interface') {
        if (interfaceSeen) throw new Error(`Line ${lineIndex + 1}: duplicate [Interface] section`)
        interfaceSeen = true
        section = 'interface'
        peer = undefined
      } else if (sectionName === 'peer') {
        section = 'peer'
        peer = { public_key: '', preshared_key: '', endpoint: '', allowed_ips: [], persistent_keepalive: 0 }
        config.peers.push(peer)
      } else {
        throw new Error(`Line ${lineIndex + 1}: unsupported section [${sectionMatch[1]}]`)
      }
      continue
    }
    const separator = line.indexOf('=')
    if (separator < 1 || !section) throw new Error(`Line ${lineIndex + 1}: expected key = value inside a section`)
    const key = line.slice(0, separator).trim().toLowerCase()
    const value = line.slice(separator + 1).trim()
    if (section === 'interface') {
      if (key === 'privatekey') config.private_key = value
      else if (key === 'address') config.addresses.push(...list(value))
      else if (key === 'listenport') config.listen_port = integer(value, 'ListenPort')
      else throw new Error(`Line ${lineIndex + 1}: unsupported [Interface] key`)
    } else if (peer) {
      if (key === 'publickey') peer.public_key = value
      else if (key === 'presharedkey') peer.preshared_key = value
      else if (key === 'endpoint') peer.endpoint = value
      else if (key === 'allowedips') peer.allowed_ips.push(...list(value))
      else if (key === 'persistentkeepalive') peer.persistent_keepalive = integer(value, 'PersistentKeepalive')
      else throw new Error(`Line ${lineIndex + 1}: unsupported [Peer] key`)
    }
  }
  if (!interfaceSeen) throw new Error('The configuration must contain an [Interface] section')
  validate(config)
  if (config.private_key) config.public_key = wireGuardPublicKeyFromBase64(config.private_key)
  return config
}
