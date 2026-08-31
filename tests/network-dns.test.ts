import assert from 'node:assert/strict'

import { defaultNetworkConfig, isDNSServer } from '../src/lib/network.ts'

const accepted = [
  '1.1.1.1',
  '1.1.1.1:53',
  '1.1.1.1:5353',
  'https://cloudflare-dns.com:443/dns-query',
  '1.1.1.1#one.one.one.one',
  'udp://1.1.1.1',
  'tcp://1.0.0.1:53',
  'tls://1.1.1.1',
  'tls://8.8.8.8#dns.google',
  'tls://[2606:4700:4700::1111]:853',
  'https://cloudflare-dns.com/dns-query',
  'https://1.1.1.1/dns-query',
  '2606:4700:4700::1111#one.one.one.one',
]

const rejected = [
  '',
  'one.one.one.one',
  '1.1.1.1#',
  'tls://dns.google',
  'tls://one.one.one.one',
  'quic://dns.adguard.com',
  'h3://cloudflare-dns.com/dns-query',
  'sdns://AgcAAAAAAAAA',
  'udp://dns.google',
  'foo://1.1.1.1',
  'udp://1.1.1.1#one.one.one.one',
  'http://dns.google/dns-query',
]

for (const server of accepted) {
  assert.equal(isDNSServer(server), true, `accepted ${server}`)
}

for (const server of rejected) {
  assert.equal(isDNSServer(server), false, `rejected ${server}`)
}

assert.equal(defaultNetworkConfig().dnssec, false, 'DNSSEC defaults to off')

console.log('network-dns tests passed')
