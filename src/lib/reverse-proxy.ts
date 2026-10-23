import type { ReverseProxySettings } from '@/api/client'
import { isIPv4, isIPv6, validCIDR } from '@/lib/network'

export function defaultReverseProxySettings(): ReverseProxySettings {
  return {
    enabled: false, trusted_proxies: [], client_ip_header: 'x-forwarded-for',
    require_https: true, public_origin: '', security_headers_enabled: true,
    frame_options: 'off', referrer_policy: 'strict-origin-when-cross-origin',
    hsts_enabled: false, hsts_max_age_seconds: 31536000, hsts_include_subdomains: false,
  }
}

export function validProxyAddress(value: string) {
  return !value.endsWith('/0') && (isIPv4(value) || isIPv6(value) || validCIDR(value, 4) || validCIDR(value, 6))
}

export function validClientIpHeader(value: string) {
  return value.length > 0 && value.length <= 128 && /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(value)
}

export function validReverseProxySettings(value: ReverseProxySettings) {
  if (!validClientIpHeader(value.client_ip_header)) return false
  if (value.trusted_proxies.length > 64 || (value.enabled && value.trusted_proxies.length === 0)
    || !value.trusted_proxies.every(validProxyAddress)) return false
  if (value.public_origin) {
    try {
      const url = new URL(value.public_origin)
      if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password
        || url.pathname !== '/' || url.search || url.hash || value.public_origin.length > 512
        || (value.require_https && url.protocol !== 'https:')) return false
    } catch { return false }
  }
  return Number.isInteger(value.hsts_max_age_seconds) && value.hsts_max_age_seconds >= 0 && value.hsts_max_age_seconds <= 63072000
}
