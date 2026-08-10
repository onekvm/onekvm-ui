export type IPv4Mode = 'disabled' | 'dhcp' | 'static'
export type IPv6Mode = 'disabled' | 'slaac' | 'dhcp' | 'static'
export type DeviceLanguage = 'en' | 'zh' | 'zh_tw'

export interface NetworkConfig {
  device: string
  mac_address: string
  ipv4_mode: IPv4Mode
  ipv4_address: string
  ipv4_gateway: string
  dns: string[]
  ipv6_enabled: boolean
  ipv6_mode: IPv6Mode
  ipv6_address: string
  ipv6_gateway: string
  route_metric: number
	static_routes: StaticRoute[]
  wifi_ssid: string
  wifi_psk?: string
  hostname: string
  http_port: number
  https_port: number
  tls_enabled: boolean
  tls_auto_redirect: boolean
  tls_cert_path: string
  tls_key_path: string
  wireguard: WireGuardConfig[]
  interfaces: ManagedNetworkInterface[]
}

export interface ManagedNetworkInterface {
  kind: 'vlan'
  name: string
  parent: string
  vlan_id: number
  ipv4_mode: IPv4Mode
  ipv4_address: string
  ipv4_gateway: string
  ipv6_mode: IPv6Mode
  ipv6_address: string
  ipv6_gateway: string
  route_metric: number
}

export interface WireGuardConfig {
  name: string
  private_key: string
  public_key: string
  addresses: string[]
  listen_port: number
  peers: WireGuardPeer[]
}

export interface StaticRoute {
  destination: string
  next_hop: string
  interface?: string
  metric: number
}

export interface ActiveNetworkRoute {
  destination: string
  next_hop: string
  interface: string
  metric: number
  protocol: string
  scope: string
  source: string
  type: string
  address_family: 'ipv4' | 'ipv6'
}

export interface WireGuardPeer {
  public_key: string
  preshared_key: string
  endpoint: string
  allowed_ips: string[]
  persistent_keepalive: number
}

export interface NetworkInterfaceStatus {
  name: string
  up: boolean
  configured: boolean
  mac: string
  addresses: string[]
	port_type: 'physical' | 'virtual'
	link_speed_mbps: number
}

export interface NetworkApplyStatus {
  pending: boolean
  deadline?: string
  seconds_remaining: number
	new_addresses?: string[]
	confirm_token?: string
	apply_at?: string
	ready?: boolean
	applying?: boolean
}

export interface ConfigSaveResponse {
  status: 'ok' | 'confirmation-required'
  network_apply?: NetworkApplyStatus
}

export interface OneKVMConfig {
  schema_version: number
  video: {
    codec: string
    quality_factor: number
    bitrate_kbps?: number
    initial_qp?: number
    min_qp?: number
    max_qp?: number
    fps: number
    resolution: number
    gop: number
    frame_detect: boolean
    source_device: string
  }
  audio: {
    enabled: boolean
    device: string
    encoder: string
  }
  stream: { sink: string }
  network: NetworkConfig
  ssh: SSHConfig
  auth: Record<string, unknown>
  ota: Record<string, unknown>
  logging: Record<string, unknown>
  system: { language: 'en' | 'zh' | 'zh_tw' }
  keyboard: KeyboardConfig
	usb: USBConfig
}

export interface USBConfig {
	vendor_id: string
	product_id: string
	manufacturer: string
	product: string
	serial_number: string
	configuration: string
	storage_vendor: string
	iso_product: string
	drive_product: string
}

export interface KeyboardShortcut {
  name: string
  keys: string[]
}

export type KeyboardLayout = 'us' | 'uk' | 'de' | 'fr' | 'es' | 'it' | 'ru' | 'jp' | 'ko'

export interface KeyboardConfig {
	layout: KeyboardLayout
  shortcuts: KeyboardShortcut[]
}

export interface KeyboardTextResponse {
  status: 'ok'
  characters: number
  layout: KeyboardLayout
}

export interface SSHConfig {
  port: number
  authorized_keys: string[]
}

export interface CertificateStatus {
  configured: boolean
  curve?: string
  subject?: string
  not_before?: string
  not_after?: string
  error?: string
}

export type CertificateMode = 'self_signed' | 'manual' | 'autossl'

export interface AutoSSLSettings {
  challenge: 'web' | 'dns'
  email: string
  domains: string[]
  directory_url: string
  renew_before_days: number
  dns_provider?: 'cloudflare' | 'webhook'
  dns_zone_id?: string
  dns_present_url?: string
  dns_cleanup_url?: string
  dns_propagation_seconds?: number
  dns_credentials_configured: boolean
  last_issued_at?: string
  last_attempt_at?: string
  last_error?: string
}

export interface AutoSSLIssueRequest {
  challenge: 'web' | 'dns'
  email: string
  domains: string[]
  directory_url: string
  renew_before_days: number
  dns_provider?: 'cloudflare' | 'webhook'
  dns_zone_id?: string
  dns_present_url?: string
  dns_cleanup_url?: string
  dns_propagation_seconds?: number
  cloudflare_api_token?: string
  webhook_bearer_token?: string
}

export interface OneKVMServiceSettings {
  http_port: number
  https_port: number
  tls_enabled: boolean
  tls_auto_redirect: boolean
  certificate: CertificateStatus
  certificate_mode: CertificateMode
  autossl: AutoSSLSettings
}

export interface SSHServiceSettings {
  port: number
  authorized_keys: string[]
}

export interface OneKVMStatus {
  machine: string
  variant: string
  version: string
  uptime_seconds: number
  video: {
    active: boolean
    hdmi_connected: boolean
		codec: string
		fps: number
		actual_fps?: number
		resolution: number
		input_width?: number
		input_height?: number
    source: string
  }
  audio: {
    enabled: boolean
    device: string
    encoder: string
  }
  hid: {
    available: boolean
    connected: boolean
    num_lock?: boolean
    caps_lock?: boolean
    scroll_lock?: boolean
  }
  atx: {
    available: boolean
    pwr_led?: boolean
    hdd_led?: boolean
  }
  network: {
    hostname: string
    ip: string
    ethernet_connected: boolean
    wifi_available: boolean
    wifi_connected: boolean
  }
  system: {
    processor: string
    kernel_version: string
    memory_total_bytes: number
    storage_total_bytes: number
    storage_available_bytes: number
    storage_type: string
    storage_partitions: StoragePartitionStatus[]
  }
}

export interface StoragePartitionStatus {
  device: string
  role: 'boot' | 'boot_a' | 'boot_b' | 'rootfs_a' | 'rootfs_b' | 'userdata' | 'config' | 'partition'
  filesystem?: string
  total_bytes: number
  used_bytes: number
  active?: boolean
}

export interface ResourceSample {
  timestamp: number
  cpu_percent: number
  memory_used_bytes: number
  memory_total_bytes: number
  network_receive_bytes_per_second: number
  network_transmit_bytes_per_second: number
}

export interface ServiceResourceUsage {
  id: string
  kind: 'core' | 'system' | 'extension'
  cpu_percent: number
  memory_bytes: number
  helper_memory_bytes?: number
  process_memory_bytes?: number
}

export interface ResourceHistory {
  window_seconds: number
  samples: ResourceSample[]
  services: ServiceResourceUsage[]
}

export interface OnlineSession {
	id: string
	kind: 'video'
	source: 'browser' | 'extension'
	protocol: string
	transport: string
	client_ip?: string
	username?: string
	codec?: string
	extension_id?: string
	connected_at: string
}

export interface LogResponse {
  lines: string[]
}

export interface SystemTimeStatus {
  timezone: string
  ntp: boolean
  can_ntp: boolean
  ntp_synchronized: boolean
  time_usec: number
  ntp_servers: string[]
  language: DeviceLanguage
}

export interface SetupSystemSettings {
  language: DeviceLanguage
  timezone: string
  ntp: boolean
  ntp_servers: string[]
}

export interface SystemUpdateSlot {
  name: string
  class: string
  device: string
  bootname: string
  state: string
  boot_status: string
  version?: string
}

export interface SystemUpdateStatus {
  compatible: string
  booted_slot: string
  primary_slot: string
  operation: string
  progress: {
    percentage: number
    message: string
    depth: number
  }
  last_error: string
  slots: SystemUpdateSlot[]
}

export interface ConfigSchema {
  machine: string
  variant: string
  hardware_revision?: string
  detected?: Record<string, boolean>
  read_only: string[]
  capabilities: Record<string, boolean>
  video_codecs?: string[]
  video_bitrate_kbps?: {
    minimum: number
    maximum: number
    step: number
    default: number
  }
}

export interface WebRTCAnswer {
  sdp: string
  type: string
  session_id: string
}

export interface AuthStatus {
  configured: boolean
  required: boolean
  authenticated: boolean
  username: string
  hostname: string
  language: DeviceLanguage
  edition?: string
  role?: string
  permissions: string[]
}

export interface AuthUser {
  username: string
  role: string
  permissions: string[]
}

export interface AuthUserUpdate {
  username: string
  password?: string
  role: string
}

export type ExtensionSettingValue = string | number | boolean | null
export type ExtensionLocalizedText = Record<string, string>
export interface ExtensionSettingCondition {
  field: string
  equals: ExtensionSettingValue
}

export interface ExtensionSettingProperty {
  type: 'string' | 'integer' | 'number' | 'boolean'
  title: string
  i18n?: ExtensionLocalizedText
  format?: 'password' | 'address' | 'network-address' | 'path'
  default?: ExtensionSettingValue
  enum?: ExtensionSettingValue[]
  minimum?: number
  maximum?: number
  maxLength?: number
  readOnly?: boolean
  enabled_when?: ExtensionSettingCondition
  required_when?: ExtensionSettingCondition
}

export interface ExtensionSummary {
  id: string
  name: string
  description?: string
  i18n?: Record<string, { name: string; description: string }>
  kind: string
  author?: string
  homepage?: string
  version?: string
  installed: boolean
  enabled: boolean
  running: boolean
  system?: boolean
  error?: string
  icon?:
    | { source: 'lucide'; name: string }
    | { source: 'custom'; path: string }
  has_page?: boolean
  has_settings?: boolean
  services?: ExtensionService[]
	memory_budget_bytes?: number
	memory_budget_used_bytes?: number
	memory_budget_total_bytes?: number
}

export interface ExtensionPackagePreview extends ExtensionSummary {
  package_name: string
  architecture: string
  bundle: boolean
  packages?: ExtensionPackageContent[]
  preview_icon_data_url?: string
}

export interface ExtensionPackageContent {
  name: string
  version: string
  architecture: string
  root?: boolean
  installed: boolean
  installed_version?: string
}

export interface ExtensionUpload {
  token: string
  size: number
  package: ExtensionPackagePreview
}

export interface MSDStatus {
  available: boolean
  connected: boolean
  reason?: string
  iso_mounted?: string
  drive_mounted?: string
  iso_uploading?: boolean
  iso_upload?: MSDISOUpload
  storage_free: number
  storage_total: number
  minimum_drive_mib: number
  maximum_drive_mib: number
}

export interface MSDMedia {
  id: string
  kind: 'iso' | 'drive'
  name: string
  label?: string
  size: number
  created_at: string
  mounted: boolean
}

export interface MSDISOUpload {
  id: string
  name: string
  size: number
  offset: number
  created_at: string
}

export interface MSDFileEntry {
  name: string
  size: number
  modified: string
  directory: boolean
}

export interface MSDDriveTransferProgress {
  transferred: number
  total: number
  current?: string
  done?: boolean
}

export interface ExtensionService {
  id: string
  name: string
  description?: string
  i18n?: Record<string, { name: string; description: string }>
  running: boolean
}

export interface ExtensionRoute {
  path: string
  backend: string
  socket?: string
  port?: number
  auth: string
}

export interface ManagedService {
  id: string
  name: string
  description?: string
  i18n?: Record<string, { name: string; description: string }>
  kind: 'system' | 'extension'
  provider_id?: string
  unit: string
  running: boolean
  enabled: boolean
  actions: Array<'start' | 'stop' | 'restart' | 'enable' | 'disable'>
}

export interface ExtensionStatus extends ExtensionSummary {
  versions?: string[]
  capabilities?: string[]
  video?: {
    settings: 'all'
    mode_select: Array<'h264' | 'h265' | 'mjpeg'>
  }
  device_variants?: string[]
  activation_conflicts?: Array<{ extension: string; machines?: string[] }>
  page?: {
    title: string
    renderer: 'html' | 'layout' | 'vue'
    entrypoint: string
    icon?:
      | { source: 'lucide'; name: string }
      | { source: 'custom'; path: string }
  }
  routes?: ExtensionRoute[]
  settings_schema: {
    type: 'object'
    additionalProperties: boolean
    required?: string[]
    properties: Record<string, ExtensionSettingProperty>
  }
  settings: Record<string, ExtensionSettingValue>
  secrets_configured?: string[]
}

function normalizedLocale(value: string) {
  return value.trim().toLowerCase().replace(/_/g, '-')
}

function localizedValue<T>(localized: Record<string, T>, language: string) {
  const values = new Map(Object.entries(localized).map(([locale, value]) => [normalizedLocale(locale), value]))
  const normalized = normalizedLocale(language)
  const parts = normalized.split('-')
  const candidates = [normalized]
  if (parts[0] === 'zh') {
    const traditional = parts.includes('hant') || parts.some((part: string) => ['tw', 'hk', 'mo'].includes(part))
    candidates.push(traditional ? 'zh-tw' : 'zh-cn', traditional ? 'zh-hant' : 'zh-hans')
  }
  candidates.push(parts[0], 'default')
  for (const candidate of candidates) {
    const value = values.get(candidate)
    if (value !== undefined) return value
  }
  return undefined
}

export function extensionTranslation(extension: ExtensionSummary, language: string) {
  return localizedValue(extension.i18n || {}, language) || {
    name: extension.name,
    description: extension.description || '',
  }
}

export function extensionLocalizedText(localized: ExtensionLocalizedText | undefined, language: string, fallback: string) {
  return localizedValue(localized || {}, language) || fallback
}

export interface ExtensionLayout {
  version: 1
  columns: 1 | 2
  sections: Array<{
    title: string
    i18n: ExtensionLocalizedText
    columns: 1 | 2
    settings: string[]
  }>
}

export function extensionAssetURL(extension: Pick<ExtensionStatus, 'id' | 'version'>, path: string) {
  if (!extension.version) return ''
  const encodedPath = path.split('/').map(encodeURIComponent).join('/')
  return `/api/extension-pages/${encodeURIComponent(extension.id)}/${encodeURIComponent(extension.version)}/${encodedPath}`
}

export function extensionRouteURL(extension: Pick<ExtensionSummary, 'id'>, route: Pick<ExtensionRoute, 'path' | 'backend'>) {
  if (route.backend !== 'file') return ''
  const encodedPath = route.path.split('/').filter(Boolean).map(encodeURIComponent).join('/')
  const path = `/plugins/${encodeURIComponent(extension.id)}/${encodedPath ? `${encodedPath}/` : ''}`
  return new URL(path, serviceBaseUrl()).toString()
}

export class APIError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
  }
}

function serviceBaseUrl() {
  return window.location.origin
}

function serviceWebSocketURL(path: string) {
  const url = new URL(path, serviceBaseUrl())
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${serviceBaseUrl()}${path}`, {
    credentials: import.meta.env.VITE_WITH_CREDENTIALS === 'false' ? 'omit' : 'include',
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    if (response.status === 401 && !path.startsWith('/api/auth/')) {
      window.dispatchEvent(new Event('onekvm:unauthorized'))
    }
    throw new APIError(body?.error || `HTTP ${response.status}`, response.status)
  }

  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

async function getExtension(id: string) {
  const path = `/api/extensions/${encodeURIComponent(id)}`
  try {
    return await request<ExtensionStatus>(path)
  } catch (error) {
    // Older Core versions expose full details through the catalog only. Keep
    // mixed-version upgrades usable, while current versions stay on the small
    // list plus on-demand detail path.
    if (!(error instanceof APIError) || error.status !== 405) throw error
    const legacyCatalog = await request<ExtensionStatus[]>('/api/extensions')
    const extension = legacyCatalog.find((item) => item.id === id)
    if (!extension) throw new APIError(`Extension ${id} not found`, 404)
    return extension
  }
}

function stageLocalExtension(file: File, onProgress: (percentage: number) => void) {
  return new Promise<ExtensionUpload>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${serviceBaseUrl()}/api/extensions/uploads`)
    xhr.withCredentials = import.meta.env.VITE_WITH_CREDENTIALS !== 'false'
    xhr.setRequestHeader('Accept', 'application/json')
    xhr.setRequestHeader(
      'Content-Type',
      file.name.toLowerCase().endsWith('.ipks')
        ? 'application/vnd.onekvm.ipks'
        : 'application/vnd.onekvm.ipk',
    )
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)))
      }
    })
    xhr.addEventListener('load', () => {
      let body: ExtensionUpload | { error?: string } | null = null
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) as ExtensionUpload | { error?: string } : null
      } catch {
        // Preserve the HTTP status fallback below when a proxy returns HTML.
      }
      if (xhr.status >= 200 && xhr.status < 300 && body && 'token' in body) {
        onProgress(100)
        resolve(body)
        return
      }
      if (xhr.status === 401) window.dispatchEvent(new Event('onekvm:unauthorized'))
      const detail = body && 'error' in body ? body.error : ''
      reject(new APIError(detail || `HTTP ${xhr.status || 0}`, xhr.status || 0))
    })
    xhr.addEventListener('error', () => reject(new APIError('Network error', 0)))
    xhr.addEventListener('abort', () => reject(new APIError('Upload cancelled', 0)))
    xhr.send(file)
  })
}

function writeMSDISOUploadChunk(
  id: string,
  offset: number,
  data: Blob,
  onProgress?: (loaded: number, total: number) => void,
  signal?: AbortSignal,
) {
  return new Promise<MSDISOUpload>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const removeAbortListener = () => signal?.removeEventListener('abort', abortRequest)
    const abortRequest = () => xhr.abort()
    xhr.open('PATCH', `${serviceBaseUrl()}/api/msd/iso-uploads/${encodeURIComponent(id)}`)
    xhr.withCredentials = import.meta.env.VITE_WITH_CREDENTIALS !== 'false'
    xhr.setRequestHeader('Accept', 'application/json')
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')
    xhr.setRequestHeader('Upload-Offset', String(offset))
    xhr.upload.addEventListener('progress', (event) => {
      onProgress?.(event.loaded, event.lengthComputable && event.total > 0 ? event.total : data.size)
    })
    xhr.addEventListener('load', () => {
      let body: MSDISOUpload | { error?: string } | null = null
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) as MSDISOUpload | { error?: string } : null
      } catch {
        // Preserve the HTTP status fallback when an intermediary returns HTML.
      }
      if (xhr.status >= 200 && xhr.status < 300 && body && 'id' in body) {
        removeAbortListener()
        onProgress?.(data.size, data.size)
        resolve(body)
        return
      }
      if (xhr.status === 401) window.dispatchEvent(new Event('onekvm:unauthorized'))
      const detail = body && 'error' in body ? body.error : ''
      removeAbortListener()
      reject(new APIError(detail || `HTTP ${xhr.status || 0}`, xhr.status || 0))
    })
    xhr.addEventListener('error', () => {
      removeAbortListener()
      reject(new APIError('Network error', 0))
    })
    xhr.addEventListener('abort', () => {
      removeAbortListener()
      reject(new APIError('Upload cancelled', 0))
    })
    if (signal?.aborted) {
      reject(new APIError('Upload cancelled', 0))
      return
    }
    signal?.addEventListener('abort', abortRequest, { once: true })
    xhr.send(data)
  })
}

async function transferMSDDriveFile(
  id: string,
  from: string,
  to: string,
  operation: 'copy' | 'move',
  onProgress?: (progress: MSDDriveTransferProgress) => void,
  signal?: AbortSignal,
) {
  const path = `/api/msd/drives/${encodeURIComponent(id)}/transfer`
  const response = await fetch(`${serviceBaseUrl()}${path}`, {
    method: 'POST',
    credentials: import.meta.env.VITE_WITH_CREDENTIALS === 'false' ? 'omit' : 'include',
    headers: { Accept: 'application/x-ndjson', 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, operation }),
    signal,
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    if (response.status === 401) window.dispatchEvent(new Event('onekvm:unauthorized'))
    throw new APIError(body?.error || `HTTP ${response.status}`, response.status)
  }
  if (!response.body) throw new APIError('Empty transfer response', 0)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let pending = ''
  let last: MSDDriveTransferProgress | null = null
  const consume = (line: string) => {
    if (!line.trim()) return
    const update = JSON.parse(line) as MSDDriveTransferProgress & { error?: string }
    if (update.error) throw new APIError(update.error, 0)
    last = update
    onProgress?.(update)
  }
  while (true) {
    const { value, done } = await reader.read()
    pending += decoder.decode(value, { stream: !done })
    const lines = pending.split('\n')
    pending = lines.pop() || ''
    for (const line of lines) consume(line)
    if (done) break
  }
  consume(pending)
  const result = last as MSDDriveTransferProgress | null
  if (!result?.done) throw new APIError('Transfer did not complete', 0)
  return result
}

export const api = {
  authStatus: () => request<AuthStatus>('/api/auth/status', { cache: 'no-store' }),
  authSetup: (
    hostname: string,
    username: string,
    password: string,
    network: NetworkConfig,
    system: SetupSystemSettings,
  ) =>
    request<AuthStatus>('/api/auth/setup', {
      method: 'POST',
      body: JSON.stringify({ hostname, username, password, network, system }),
    }),
  authLogin: (username: string, password: string) =>
    request<AuthStatus>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  authLogout: () => request<void>('/api/auth/logout', { method: 'POST' }),
  authUpdateAccount: (username: string, currentPassword: string, newPassword: string) =>
    request<AuthStatus>('/api/auth/account', {
      method: 'PUT',
      body: JSON.stringify({
        username,
        current_password: currentPassword,
        new_password: newPassword,
      }),
    }),
  getAuthUsers: () => request<AuthUser[]>('/api/auth/users'),
  createAuthUser: (user: AuthUserUpdate & { password: string }) =>
    request<AuthUser>('/api/auth/users', { method: 'POST', body: JSON.stringify(user) }),
  updateAuthUser: (username: string, user: AuthUserUpdate) =>
    request<AuthUser>(`/api/auth/users/${encodeURIComponent(username)}`, { method: 'PUT', body: JSON.stringify(user) }),
  deleteAuthUser: (username: string) =>
    request<void>(`/api/auth/users/${encodeURIComponent(username)}`, { method: 'DELETE' }),
  getConfig: () => request<OneKVMConfig>('/api/config'),
  getMJPEGStreamURL: () => `${serviceBaseUrl()}/api/stream`,
  getVideoWebSocketURL: () => serviceWebSocketURL('/api/stream/ws'),
  getHIDWebSocketURL: () => serviceWebSocketURL('/api/hid/ws'),
  getMSDWebSocketURL: () => serviceWebSocketURL('/api/msd/ws'),
  getStatusEventsURL: () => `${serviceBaseUrl()}/api/status/events`,
  getMSDStatus: () => request<MSDStatus>('/api/msd/status', { cache: 'no-store' }),
  connectMSD: () => request<MSDStatus>('/api/msd/connect', { method: 'POST' }),
  disconnectMSD: () => request<MSDStatus>('/api/msd/disconnect', { method: 'POST' }),
  getMSDMedia: () => request<MSDMedia[]>('/api/msd/media', { cache: 'no-store' }),
  mountMSDMedia: (id: string) => request<MSDStatus>(`/api/msd/media/${encodeURIComponent(id)}/mount`, { method: 'POST' }),
  ejectMSD: (kind: 'iso' | 'drive') => request<MSDStatus>(`/api/msd/eject/${kind}`, { method: 'POST' }),
  deleteMSDMedia: (id: string) => request<void>(`/api/msd/media/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  beginMSDISOUpload: (name: string, size: number) => request<MSDISOUpload>('/api/msd/iso-uploads', {
    method: 'POST',
    body: JSON.stringify({ name, size }),
  }),
  getMSDISOUpload: (id: string) => request<MSDISOUpload>(`/api/msd/iso-uploads/${encodeURIComponent(id)}`),
  writeMSDISOUpload: (id: string, offset: number, data: Blob, onProgress?: (loaded: number, total: number) => void, signal?: AbortSignal) =>
    writeMSDISOUploadChunk(id, offset, data, onProgress, signal),
  completeMSDISOUpload: (id: string) => request<MSDMedia>(`/api/msd/iso-uploads/${encodeURIComponent(id)}/complete`, { method: 'POST' }),
  cancelMSDISOUpload: (id: string) => request<void>(`/api/msd/iso-uploads/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  createMSDDrive: (name: string, label: string, sizeMiB: number) => request<MSDMedia>('/api/msd/drives', {
    method: 'POST',
    body: JSON.stringify({ name, label, size_mib: sizeMiB }),
  }),
  listMSDDriveFiles: (id: string, path = '') => request<MSDFileEntry[]>(`/api/msd/drives/${encodeURIComponent(id)}/files?path=${encodeURIComponent(path)}`),
  uploadMSDDriveFile: (id: string, path: string, file: File, overwrite = false) => request<void>(`/api/msd/drives/${encodeURIComponent(id)}/files?path=${encodeURIComponent(path)}&overwrite=${overwrite}`, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': 'application/octet-stream' },
  }),
  createMSDDriveDirectory: (id: string, path: string) => request<void>(`/api/msd/drives/${encodeURIComponent(id)}/directories`, {
    method: 'POST',
    body: JSON.stringify({ path }),
  }),
  renameMSDDriveFile: (id: string, from: string, to: string) => request<void>(`/api/msd/drives/${encodeURIComponent(id)}/rename`, {
    method: 'POST',
    body: JSON.stringify({ from, to }),
  }),
  transferMSDDriveFile,
  deleteMSDDriveFile: (id: string, path: string) => request<void>(`/api/msd/drives/${encodeURIComponent(id)}/files?path=${encodeURIComponent(path)}`, { method: 'DELETE' }),
  getMSDDriveFileURL: (id: string, path: string) => `${serviceBaseUrl()}/api/msd/drives/${encodeURIComponent(id)}/download?path=${encodeURIComponent(path)}`,
  getKeyboardConfig: () => request<KeyboardConfig>('/api/config/keyboard'),
  sendKeyboardText: (text: string, layout?: KeyboardLayout, intervalMS?: number) =>
    request<KeyboardTextResponse>('/api/hid/keyboard/text', {
      method: 'POST',
      body: JSON.stringify({
        text,
        ...(layout ? { layout } : {}),
        ...(intervalMS === undefined ? {} : { interval_ms: intervalMS }),
      }),
    }),
  saveKeyboardConfig: (keyboard: KeyboardConfig) =>
    request<KeyboardConfig>('/api/config/keyboard', {
      method: 'PUT',
      body: JSON.stringify(keyboard),
    }),
  getConfigSchema: () => request<ConfigSchema>('/api/config/schema'),
  saveConfig: (config: OneKVMConfig) =>
		request<ConfigSaveResponse>('/api/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    }),
  resetConfig: () => request<{ status: string }>('/api/config/reset', { method: 'POST', keepalive: true }),
  factoryReset: () => request<{ status: string }>('/api/system/factory-reset', { method: 'POST', keepalive: true }),
  rebootSystem: () => request<{ status: string }>('/api/system/reboot', { method: 'POST', keepalive: true }),
  enterRecovery: () => request<{ status: string }>('/api/system/recovery', { method: 'POST', keepalive: true }),
  getStatus: () => request<OneKVMStatus>('/api/status', { cache: 'no-store' }),
  getResources: () => request<ResourceHistory>('/api/resources'),
  getSessions: () => request<OnlineSession[]>('/api/sessions', { cache: 'no-store' }),
  getLogs: async (lines = 250) =>
    (await request<LogResponse>(`/api/logs?lines=${encodeURIComponent(lines)}`)).lines,
  getServices: () => request<ManagedService[]>('/api/services'),
  serviceAction: (id: string, action: 'start' | 'stop' | 'restart' | 'enable' | 'disable') =>
    request<{ status: string }>(`/api/services/${encodeURIComponent(id)}/${action}`, { method: 'POST' }),
	getOneKVMServiceSettings: () => request<OneKVMServiceSettings>('/api/services/onekvm'),
	saveOneKVMServiceSettings: (settings: Pick<OneKVMServiceSettings, 'http_port' | 'https_port' | 'tls_enabled' | 'tls_auto_redirect'>) =>
		request<OneKVMServiceSettings>('/api/services/onekvm', {
			method: 'PUT',
			body: JSON.stringify(settings),
		}),
	generateOneKVMCertificate: (hostname?: string) =>
		request<OneKVMServiceSettings>('/api/services/onekvm/certificate/generate', {
			method: 'POST',
			body: JSON.stringify(hostname ? { hostname } : {}),
		}),
	uploadOneKVMCertificate: (certificate: File, privateKey: File) => {
		const body = new FormData()
		body.append('certificate', certificate)
		body.append('private_key', privateKey)
		return request<OneKVMServiceSettings>('/api/services/onekvm/certificate/upload', {
			method: 'POST',
			body,
		})
	},
	obtainOneKVMAutoSSLCertificate: (settings: AutoSSLIssueRequest) =>
		request<OneKVMServiceSettings>('/api/services/onekvm/certificate/autossl', {
			method: 'POST',
			body: JSON.stringify(settings),
		}),
	getSSHServiceSettings: () => request<SSHServiceSettings>('/api/services/ssh'),
	saveSSHServiceSettings: (settings: SSHServiceSettings) =>
		request<SSHServiceSettings>('/api/services/ssh', {
			method: 'PUT',
			body: JSON.stringify(settings),
		}),
	getNetworkInterfaces: () => request<NetworkInterfaceStatus[]>('/api/network/interfaces'),
	getNetworkApplyStatus: () => request<NetworkApplyStatus>('/api/network/apply', { cache: 'no-store' }),
	confirmNetworkApply: () => request<{ status: string }>('/api/network/apply/confirm', { method: 'POST' }),
	confirmNetworkApplyToken: (token: string) => request<{ status: string }>(`/api/network/apply/confirm?token=${encodeURIComponent(token)}`, { method: 'POST' }),
	getNetworkDNS: () => request<{ servers: string[] }>('/api/network/dns'),
	setNetworkDNS: (servers: string[]) => request<{ status: string }>('/api/network/dns', { method: 'PUT', body: JSON.stringify({ servers }) }),
	getNetworkRoutes: () => request<StaticRoute[]>('/api/network/routes'),
	setNetworkRoutes: (routes: StaticRoute[]) => request<{ status: string }>('/api/network/routes', { method: 'PUT', body: JSON.stringify(routes) }),
	getNetworkActiveRoutes: () => request<ActiveNetworkRoute[]>('/api/network/routes/active'),
  getSystemTime: () => request<SystemTimeStatus>('/api/system/time'),
  updateSystemTime: (timezone: string, ntp: boolean, ntpServers: string[], language: string) =>
    request<SystemTimeStatus>('/api/system/time', {
      method: 'PUT',
      body: JSON.stringify({ timezone, ntp, ntp_servers: ntpServers, language }),
    }),
  syncBrowserTime: () =>
    request<SystemTimeStatus>('/api/system/time', {
      method: 'PUT',
      body: JSON.stringify({ ntp: false, time_usec: Date.now() * 1000 }),
    }),
  getSystemUpdate: () => request<SystemUpdateStatus>('/api/system/update'),
  setSystemUpdateSlot: (slot: string, allowBad = false) =>
    request<SystemUpdateStatus>('/api/system/update/slot', {
      method: 'POST',
      body: JSON.stringify({ slot, allow_bad: allowBad }),
    }),
  installSystemUpdate: (file: File) =>
    request<{ status: string }>('/api/system/update/bundle', {
      method: 'POST',
      body: file,
      headers: { 'Content-Type': 'application/vnd.onekvm.firmware-update' },
    }),
  getExtensions: () => request<ExtensionSummary[]>('/api/extensions'),
  getExtension,
  getExtensionLayout: (extension: ExtensionStatus) => {
    if (!extension.page || extension.page.renderer !== 'layout') {
      return Promise.reject(new Error('Extension does not register a layout page'))
    }
    return request<ExtensionLayout>(extensionAssetURL(extension, extension.page.entrypoint))
  },
  installExtension: (id: string) =>
    request<{ status: string }>('/api/extensions', {
      method: 'POST',
      body: JSON.stringify({ id }),
    }),
  refreshExtensions: () =>
    request<{ status: string }>('/api/extensions/refresh', { method: 'POST' }),
  installLocalExtension: (file: File) =>
    request<{ status: string }>('/api/extensions/upload', {
      method: 'POST',
      body: file,
      headers: {
        'Content-Type': file.name.toLowerCase().endsWith('.ipks')
          ? 'application/vnd.onekvm.ipks'
          : 'application/vnd.onekvm.ipk',
      },
    }),
  stageLocalExtension,
  installStagedExtension: (token: string) =>
    request<{ status: string }>(`/api/extensions/uploads/${encodeURIComponent(token)}/install`, { method: 'POST' }),
  discardStagedExtension: (token: string) =>
    request<void>(`/api/extensions/uploads/${encodeURIComponent(token)}`, { method: 'DELETE' }),
  updateExtension: (id: string, update: { enabled?: boolean; settings?: Record<string, ExtensionSettingValue> }) =>
    request<{ status: string }>(`/api/extensions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(update),
    }),
  extensionAction: (id: string, action: 'enable' | 'disable' | 'restart') =>
    request<{ status: string }>(`/api/extensions/${id}/${action}`, { method: 'POST' }),
  invokeExtension: <T = unknown>(id: string, method: string, payload: unknown = null) =>
    request<T>(`/api/extensions/${encodeURIComponent(id)}/invoke/${encodeURIComponent(method)}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  removeExtension: (id: string) =>
    request<{ status: string }>(`/api/extensions/${id}`, { method: 'DELETE' }),
  createWebRTCSession: (sdp: string) =>
    request<WebRTCAnswer>('/api/webrtc/offer', {
      method: 'POST',
      body: JSON.stringify({ type: 'offer', sdp }),
    }),
  closeWebRTCSession: (sessionId: string, keepalive = false) =>
    request<{ status: string }>('/api/webrtc/close', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId }),
      keepalive,
    }),
  power: (action: 'on' | 'off' | 'reset') =>
    request<{ status: string }>(`/api/power/${action}`, { method: 'POST' }),
}
