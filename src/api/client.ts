import { createPersistentQuery } from '../lib/persistent-query.ts'
import type { WifiApNetwork } from '../lib/wifi-ap-network'
import { resolveServiceURL, serviceBaseUrl, serviceURL, serviceWebSocketURL } from './service-url.ts'
export type IPv4Mode = 'disabled' | 'dhcp' | 'dhcp-static' | 'static'
export type IPv6Mode = 'disabled' | 'slaac' | 'dhcp' | 'static'
export type DeviceLanguage = 'en' | 'zh' | 'zh_tw'

export interface NetworkConfig {
  primary_interface: string
  static_routes: StaticRoute[]
  hostname: string
  mdns?: boolean
  discovery_enabled?: boolean
  use_custom_discovery_url?: boolean
  discovery_url?: string
  dnssec?: string | boolean
  http_port: number
  https_port: number
  tls_enabled: boolean
  tls_auto_redirect: boolean
  tls_cert_path: string
  tls_key_path: string
  interfaces: NetworkInterfaceConfig[]
  proxy?: ProxyConfig
  webrtc?: WebRtcIceConfig
}

export interface FirewallRule {
  id: number
  action: 'allow' | 'deny' | 'reject' | 'limit' | string
  direction: 'in' | 'out' | string
  protocol: 'tcp' | 'udp' | 'any' | string
  port: string
  source: string
  comment: string
  enabled: boolean
}

export interface FirewallConfirmation {
  pending: boolean
  deadline?: string
  seconds_remaining: number
  confirm_token?: string
  ready?: boolean
  applying?: boolean
}

export interface FirewallStatus {
  available: boolean
  enabled: boolean
  default_incoming: string
  default_outgoing: string
  logging: string
  rules: FirewallRule[]
  confirmation?: FirewallConfirmation
}

export interface FirewallRuleInput {
  action: string
  direction: string
  protocol: string
  port: string
  source?: string
  comment?: string
}

export interface FirewallUpdate {
  enabled?: boolean
  default_incoming?: string
  default_outgoing?: string
  protect_management?: boolean
  rules?: FirewallRuleInput[]
}

export interface WifiNetwork {
  ssid: string
  signal_dbm: number
  secure: boolean
  /** open, wep, wpa, wpa2, wpa3, wpa2-wpa3, owe. Absent on older servers. */
  security?: string
  bands?: { band: string; generation: string | null }[]
}

export interface SavedWifiNetwork {
  ssid: string
  secure: boolean
  auto_connect: boolean
  priority: number
  hidden: boolean
  band: string
  bssid: string
}

export interface WifiProfileSettings {
  interface: string
  ssid: string
  password?: string
  auto_connect: boolean
  priority: number
  hidden: boolean
  band: string
  bssid: string
}

export interface WifiStatus {
  ap_interface?: string
  interface?: string
  saved_networks?: SavedWifiNetwork[]
  available: boolean
  mode: 'ap' | 'ap_station' | 'station'
  ap_enabled: boolean
  ap_ssid: string
  ap_password: string
  ap_address: string
  ap_network?: WifiApNetwork
  ap_channel: number
  ap_band: '2.4' | '5'
  ap_operating_channel: number | null
  ap_channels?: number[]
  radio_bands?: ('2.4' | '5' | '6')[]
  ap_expires_in: number | null
  connecting: boolean
  connected: boolean
  station_ssid: string
  station_address: string
  error: string
}

export interface ProxyConfig {
  http?: string
  https?: string
  no_proxy?: string
}

export interface WebRtcIceConfig {
  stun?: string
  turn_servers?: WebRtcTurnServerConfig[]
}

export interface WebRtcTurnServerConfig {
  url: string
  username: string
  credential: string
}

export interface IceServer {
  urls: string | string[]
  username?: string
  credential?: string
}

export interface VpnClientConfig {
  kind: 'openvpn' | 'pppoe' | 'pptp' | 'l2tp'
  name: string
  enabled: boolean
  remote?: string
  port?: number
  protocol?: string
  parent?: string
  username?: string
  password?: string
  service?: string
  config?: string
  default_route?: boolean
}

export interface ManagedNetworkInterface {
  kind: 'physical' | 'vlan' | 'gre' | 'ipip' | 'sit' | 'vxlan' | 'geneve' | 'fou' | 'bareudp' | 'gretap'
  name: string
  disabled?: boolean
  mac_address?: string
  dns?: string[]
  use_custom_dns?: boolean
  parent: string
  vlan_id: number
  local?: string
  remote?: string
  key?: string
  vni?: number
  port?: number
  group?: string
  protocol?: string
  ether_type?: string
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
  disabled?: boolean
  dns?: string[]
}

export type WireGuardInterface = WireGuardConfig & { kind: 'wireguard' }
export type VpnInterface = Omit<VpnClientConfig, 'enabled'> & { disabled?: boolean }
export type NetworkInterfaceConfig = ManagedNetworkInterface | WireGuardInterface | VpnInterface

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
  wifi_role?: '' | 'ap' | 'station'
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
    h26x: {
      bitrate_kbps?: number
      initial_qp?: number
      min_qp?: number
      max_qp?: number
      gop: number
    }
    fps: number
    resolution: number
    mjpeg: { frame_detect: boolean }
    source_device: string
  }
  audio: {
    enabled: boolean
    microphone?: boolean
    device: string
    quality?: 'low' | 'medium' | 'high' | 'pcm'
    channels?: 'mono' | 'stereo'
    product_name?: string
  }
  network: NetworkConfig
  ssh: SSHConfig
  auth: Record<string, unknown>
  logging: Record<string, unknown>
  system: { language: 'en' | 'zh' | 'zh_tw'; zram_size_mb?: number }
  personalization: PersonalizationConfig
  keyboard: KeyboardConfig
  input: InputConfig
  usb: USBConfig
}

export type ConsoleTitleSource = 'device_name' | 'hostname' | 'custom'
export type ConsoleSubtitlePart = 'hostname' | 'device_model' | 'custom'

export interface PersonalizationConfig {
  device_name: string
  console_title_source: ConsoleTitleSource
  custom_console_title: string
  console_subtitle_parts: ConsoleSubtitlePart[]
  custom_console_subtitle: string
}

export interface InputConfig {
  mouse_report_rate_hz: number
  mouse_scroll_interval_ms: number
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
	gamepad: boolean
	mass_storage?: boolean
	mtp?: boolean
	keyboard_name?: string
	keyboard_interval?: number
	keyboard_no_out?: boolean
	mouse_name?: string
	mouse_interval?: number
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
  fingerprint_sha256?: string
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

export interface ReverseProxySettings {
  enabled: boolean
  trusted_proxies: string[]
  client_ip_header: string
  require_https: boolean
  public_origin: string
  security_headers_enabled: boolean
  frame_options: 'off' | 'sameorigin' | 'deny'
  referrer_policy: 'no-referrer' | 'same-origin' | 'strict-origin-when-cross-origin'
  hsts_enabled: boolean
  hsts_max_age_seconds: number
  hsts_include_subdomains: boolean
}

export interface OneKVMServiceSettings {
  reverse_proxy: ReverseProxySettings
  http_port: number
  https_port: number
  tls_enabled: boolean
  tls_auto_redirect: boolean
  login_protection_enabled: boolean
  api_protection_enabled: boolean
  api_protection_max_failures: number
  api_protection_ban_duration_seconds: number
  api_protection_scope: 'ip' | 'subnet'
  api_protection_ipv4_prefix: number
  api_protection_ipv6_prefix: number
  api_protection_window_seconds: number
  api_protection_requests_per_second: number
  api_protection_burst: number
  honeypot_enabled: boolean
  server_disguise_enabled: boolean
  login_protection_block_weak_credentials: boolean
  login_protection_max_failures: number
  login_protection_ban_duration_seconds: number
  login_protection_scope: 'subnet' | 'ip'
  login_protection_ipv4_prefix: number
  login_protection_ipv6_prefix: number
  crash_recovery_enabled: boolean
  certificate: CertificateStatus
  certificate_mode: CertificateMode
  autossl: AutoSSLSettings
}

export interface SSHServiceSettings {
  port: number
  authorized_keys: string[]
}

export type OneKVMSecuritySettings = Pick<OneKVMServiceSettings,
  'api_protection_enabled' | 'login_protection_enabled' | 'login_protection_block_weak_credentials' | 'login_protection_max_failures'
  | 'api_protection_max_failures'
  | 'api_protection_ban_duration_seconds'
  | 'api_protection_scope'
  | 'api_protection_ipv4_prefix'
  | 'api_protection_ipv6_prefix'
  | 'api_protection_window_seconds'
  | 'api_protection_requests_per_second'
  | 'api_protection_burst'
  | 'honeypot_enabled'
  | 'reverse_proxy'
  | 'server_disguise_enabled'
  | 'login_protection_ban_duration_seconds' | 'login_protection_scope' |
  'login_protection_ipv4_prefix' | 'login_protection_ipv6_prefix' | 'crash_recovery_enabled'>

export interface LoginBan {
  id: string
  address: string
  source: 'manual' | 'login_failures' | 'weak_credentials' | 'api_scan' | 'honeypot'
  reason: string
  failures: number
  trigger_ip?: string | null
  expires_at: number | null
}

export interface ManualLoginBanRequest {
  address: string
  reason: string
  expires_at: number | null
}

export interface HoneypotStatus {
  enabled: boolean
  mysql: { port: number; listening: boolean; error: string | null }
  redis: { port: number; listening: boolean; error: string | null }
}

export interface ZramServiceSettings {
  size_mb: number
  max_size_mb?: number
}

export interface OneKVMStatus {
  machine: string
  vendor?: string
  name?: string
  variant: string
  variant_label?: string
  version: string
  uptime_seconds: number
  video: {
    active: boolean
    hdmi_connected: boolean
		codec: string
		actual_codec?: string
		fps: number
		actual_fps?: number
		resolution: number
		input_width?: number
		input_height?: number
		bit_depth?: number | null
		color_range?: 'unknown' | 'limited' | 'full' | 'unspecified'
		hdmi_error?: string
		capture_latency_us?: number
		encode_latency_us?: number
    source: string
  }
  audio: {
    enabled: boolean
    microphone?: boolean
    microphone_available?: boolean
    microphone_session?: string
    device: string
    encoder: string
    quality?: string
    channels?: string
    sample_rate?: number
    stream_channels?: number
    actual_fps?: number
    bitrate_kbps?: number
    capture_latency_us?: number
    encode_latency_us?: number
  }
  hid: {
    available: boolean
    connected: boolean
    gamepad?: boolean
    macro_generation?: number
    macro_owner?: string | null
    num_lock?: boolean
    caps_lock?: boolean
    scroll_lock?: boolean
    gadget?: {
      udc?: string
      in_limit: number
      out_limit: number
      mass_storage: boolean
      mtp_available?: boolean
      mtp: boolean
    }
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
  identity?: PersonalizationConfig
  system: {
    processor: string
    architecture?: string
    soc_name?: string
    kernel_version: string
    memory_total_bytes: number
    memory_physical_bytes?: number
    memory_type?: string
    memory_available_bytes?: number
    memory_hardware_reserved_bytes?: number | null
    memory_linux_reserved_bytes?: number | null
    storage_total_bytes: number
    storage_device_bytes?: number
    storage_available_bytes: number
    storage_type: string
    storage_partitions: StoragePartitionStatus[]
  }
}

export interface StoragePartitionStatus {
  device: string
  role: 'boot' | 'boot_a' | 'boot_b' | 'rootfs' | 'rootfs_a' | 'rootfs_b' | 'userdata' | 'config' | 'partition'
  filesystem?: string
  total_bytes: number
  used_bytes: number
  active?: boolean
}

export type StorageStatus = Pick<OneKVMStatus['system'],
  'storage_total_bytes' | 'storage_device_bytes' | 'storage_available_bytes' | 'storage_type' | 'storage_partitions'>

export interface ResourceSample {
  timestamp: number
  cpu_percent: number
  temperature_celsius?: number
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
	kind: 'video' | 'audio'
	source: 'web' | 'browser' | 'extension'
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

export interface SystemOnlineUpdate {
  repository: string | null
  current_version: string
  latest_version: string | null
  available: boolean
  reason: 'source_not_configured' | 'up_to_date' | 'bundle_missing' | ''
  asset_name?: string
  asset_size?: number
}

export interface SystemOnlineUpdateProgress {
  phase: 'idle' | 'downloading' | 'checking' | 'awaiting_packages' | 'installing' | 'error'
  bytes: number
  total_bytes: number
  error: string
}

export interface SystemUpdatePreflight {
  id?: string
  phase: 'idle' | 'prepared' | 'armed' | 'installing' | 'complete' | 'failed'
  error?: string
  kernel_changed?: boolean
  current_kernel?: string
  target_kernel?: string
  target_build?: string
  ready?: boolean
  missing?: { package: string; plugin: string; reason: string }[]
  packages?: { name: string; version: string }[]
}

export type SystemUpdateSource =
  | { source: 'http'; url: string }
  | { source: 'tftp'; server: string; path: string; port?: number }
  | { source: 'nfs'; server: string; export: string; path: string }
  | { source: 'local'; path: string }

export interface SystemUpdateLocalFile {
  path: string
  name: string
  size: number
}

export interface ConfigSchema {
  schema_version?: number
  json_schema?: Record<string, unknown>
  machine: string
  vendor?: string
  name?: string
  variant: string
  variant_label?: string
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
  microphone?: boolean
  is_primary?: boolean
}

export interface AuthStatus {
  configured: boolean
  required: boolean
  authenticated: boolean
  username: string
  hostname: string
  language: DeviceLanguage
  role?: string
  permissions: string[]
  mfa_required?: boolean
  pending_token?: string
  factors?: AuthFactor[]
  mfa?: AuthMfaStatus
}

export interface AuthFactor {
  type: 'totp' | 'backup' | 'plugin'
  id?: string
  name?: string
  version?: string
  method?: string
  login?: string
  enroll?: string
}

export interface AuthMfaStatus {
  totp: boolean
  backup_codes: number
  plugins: AuthFactor[]
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

export interface ExtensionToolboxItem {
  id: string
  title: string
  subtitle?: string
  i18n?: Record<string, { title: string; subtitle?: string }>
  icon?: { source: 'lucide'; name: string } | { source: 'custom'; path: string }
  order?: number
  presentation: 'drawer' | 'window'
  layout?: 'padded' | 'edge-to-edge'
  size?: { width?: number; height?: number }
  view: { renderer: 'vue'; entrypoint: string }
}

export type ConsoleExtension = Pick<ExtensionSummary,
  'id' | 'name' | 'i18n' | 'version' | 'installed' | 'enabled' | 'error' | 'toolbox' | 'toolbar' | 'shell' | 'icon'>

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
    | { source: 'custom'; path: string; data?: string }
  icon_data_url?: string
  has_page?: boolean
  has_toolbar?: boolean
  toolbar?: {
    entrypoint: string
  }
  has_shell?: boolean
  shell?: {
    entrypoint: string
  }
  toolbox?: { items: ExtensionToolboxItem[] }
  has_settings?: boolean
  services?: ExtensionService[]
	memory_budget_bytes?: number
	memory_budget_used_bytes?: number
	memory_budget_total_bytes?: number
  auth_provider?: {
    method: string
    cancel_method?: string
    login?: string
    enroll?: string
  }
}

export type RemoveExtensionOptions = {
  deleteData?: boolean
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
  mtp_available?: boolean
  mtp?: boolean
  reason?: string
  iso_mounted?: string
  drive_mounted?: string
  iso_uploading?: boolean
  iso_upload?: MSDISOUpload
  storage_free: number
  storage_total: number
  minimum_drive_mib: number
  maximum_drive_mib: number
  drive_filesystems?: string[]
}

export interface MSDMedia {
  id: string
  kind: 'iso' | 'drive'
  name: string
  label?: string
  size: number
  created_at: string
  mounted: boolean
  external?: boolean
  imported?: boolean
  filesystem?: 'exfat' | 'fat32' | string
}

export interface MSDSource {
  extension: string
  directory: string
  name: string
  available: boolean
}

export interface MSDSourceEntry {
  name: string
  path: string
  directory: boolean
  media?: MSDMedia
}

export interface MSDSourceListing {
  entries: MSDSourceEntry[]
  truncated: boolean
}

export interface MSDISOUpload {
  id: string
  name: string
  size: number
  offset: number
  created_at: string
  kind?: 'iso' | 'drive'
}

export interface MSDFileEntry {
  name: string
  size: number
  modified: string
  directory: boolean
}

export interface DeviceFileEntry {
  name: string
  size: number
  modified: number
  directory: boolean
  mode: number
  owner: string
}

export interface DeviceFileListing {
  root: string
  path: string
  entries: DeviceFileEntry[]
}

export interface MSDDriveTransferProgress {
  transferred: number
  total: number
  current?: string
  done?: boolean
}

export interface MSDDownloadTask {
  id: string
  state: 'running' | 'cancelling' | 'completed' | 'cancelled' | 'failed'
  error?: string | null
  status?: number | null
  name: string
  transferred: number
  total: number
  media?: MSDMedia | null
  url_name?: string | null
  server_name?: string | null
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
  permissions?: string[]
  kernel_modules?: string[]
  package_dependencies?: string[] | null
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
  toolbar?: {
    entrypoint: string
  }
  shell?: {
    entrypoint: string
  }
  routes?: ExtensionRoute[]
  auth_provider?: {
    method: string
    cancel_method?: string
    login?: string
    enroll?: string
  }
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
    description?: string
    description_i18n?: ExtensionLocalizedText
    columns: 1 | 2
    settings: string[]
  }>
}

export function extensionPagePath(extension: Pick<ExtensionStatus, 'id' | 'version'>, path: string) {
  if (!extension.version) return ''
  const encodedPath = path.split('/').map(encodeURIComponent).join('/')
  return `/api/extension-pages/${encodeURIComponent(extension.id)}/${encodeURIComponent(extension.version)}/${encodedPath}`
}

export function extensionAssetURL(extension: Pick<ExtensionStatus, 'id' | 'version'>, path: string) {
  const pagePath = extensionPagePath(extension, path)
  return pagePath ? serviceURL(pagePath) : ''
}

export function extensionRouteURL(extension: Pick<ExtensionSummary, 'id'>, route: Pick<ExtensionRoute, 'path' | 'backend'>) {
  if (route.backend !== 'file') return ''
  const encodedPath = route.path.split('/').filter(Boolean).map(encodeURIComponent).join('/')
  const path = `/plugins/${encodeURIComponent(extension.id)}/${encodedPath ? `${encodedPath}/` : ''}`
  return serviceURL(path)
}

export class APIError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export function isUnauthorizedError(error: unknown): boolean {
  return error instanceof APIError && error.status === 401
}

const consoleExtensions = createPersistentQuery<ConsoleExtension[]>()
const msdSources = createPersistentQuery<MSDSource[]>()

export function invalidateExtensionCaches() {
  consoleExtensions.invalidate()
  msdSources.invalidate()
}

function changesExtensions(path: string, method: string | undefined) {
  if (!path.startsWith('/api/extensions') || !method || method.toUpperCase() === 'GET') return false
  const invoke = path.match(/\/invoke\/([^/?]+)/)
  return !invoke || !['status', 'assistance_info', 'list_packages', 'list_sources', 'install_progress',
    'set_source', 'set_source_enabled', 'remove_source'].includes(decodeURIComponent(invoke[1]!))
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(resolveServiceURL(serviceBaseUrl(), path), {
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
    if (response.status === 403) window.dispatchEvent(new Event('onekvm:permissions-changed'))
    if ([423, 429].includes(response.status) && path !== '/api/auth/status') window.dispatchEvent(new Event('onekvm:access-check'))
    throw new APIError(body?.error || `HTTP ${response.status}`, response.status)
  }

  if (changesExtensions(path, options.method)) {
    invalidateExtensionCaches()
    window.dispatchEvent(new Event('onekvm:extensions-changed'))
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

function putOctetStream(
  path: string,
  file: Blob,
  onProgress?: (loaded: number, total: number) => void,
  signal?: AbortSignal,
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const abortRequest = () => xhr.abort()
    const removeAbortListener = () => signal?.removeEventListener('abort', abortRequest)
    xhr.open('PUT', `${serviceBaseUrl()}${path}`)
    xhr.withCredentials = import.meta.env.VITE_WITH_CREDENTIALS !== 'false'
    xhr.setRequestHeader('Accept', 'application/json')
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')
    xhr.upload.addEventListener('progress', (event) => {
      onProgress?.(event.loaded, event.lengthComputable && event.total > 0 ? event.total : file.size)
    })
    xhr.addEventListener('load', () => {
      removeAbortListener()
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(file.size, file.size)
        resolve()
        return
      }
      let detail = ''
      try {
        detail = (JSON.parse(xhr.responseText) as { error?: string }).error || ''
      } catch {
        // Preserve the HTTP status fallback when an intermediary returns HTML.
      }
      if (xhr.status === 401) window.dispatchEvent(new Event('onekvm:unauthorized'))
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
    xhr.send(file)
  })
}

function uploadDeviceFile(
  path: string,
  file: Blob,
  overwrite: boolean,
  onProgress?: (loaded: number, total: number) => void,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ path, overwrite: String(overwrite) })
  return putOctetStream(`/api/files?${query}`, file, onProgress, signal)
}

function uploadMSDDriveFile(
  id: string,
  path: string,
  file: File,
  overwrite = false,
  onProgress?: (loaded: number, total: number) => void,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ path, overwrite: String(overwrite) })
  return putOctetStream(
    `/api/msd/drives/${encodeURIComponent(id)}/files?${query}`,
    file,
    onProgress,
    signal,
  )
}

async function readDeviceFile(path: string, signal?: AbortSignal) {
  const response = await fetch(`${serviceBaseUrl()}/api/files/download?path=${encodeURIComponent(path)}`, {
    credentials: import.meta.env.VITE_WITH_CREDENTIALS === 'false' ? 'omit' : 'include',
    headers: { Accept: 'application/octet-stream' },
    signal,
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    if (response.status === 401) window.dispatchEvent(new Event('onekvm:unauthorized'))
    throw new APIError(body?.error || `HTTP ${response.status}`, response.status)
  }
  return new Uint8Array(await response.arrayBuffer())
}

function postOctetStream<T>(
  path: string,
  file: Blob,
  onProgress?: (loaded: number, total: number) => void,
  signal?: AbortSignal,
) {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const removeAbortListener = () => signal?.removeEventListener('abort', abortRequest)
    const abortRequest = () => xhr.abort()
    xhr.open('POST', `${serviceBaseUrl()}${path}`)
    xhr.withCredentials = import.meta.env.VITE_WITH_CREDENTIALS !== 'false'
    xhr.setRequestHeader('Accept', 'application/json')
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')
    xhr.upload.addEventListener('progress', (event) => {
      onProgress?.(event.loaded, event.lengthComputable && event.total > 0 ? event.total : file.size)
    })
    xhr.addEventListener('load', () => {
      let body: T | { error?: string } | null = null
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) as T | { error?: string } : null
      } catch {
        // Preserve the HTTP status fallback when an intermediary returns HTML.
      }
      if (xhr.status >= 200 && xhr.status < 300 && body && typeof body === 'object' && 'id' in body) {
        removeAbortListener()
        onProgress?.(file.size, file.size)
        resolve(body as T)
        return
      }
      if (xhr.status === 401) window.dispatchEvent(new Event('onekvm:unauthorized'))
      const detail = body && typeof body === 'object' && 'error' in body ? body.error : ''
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
    xhr.send(file)
  })
}

function uploadStoredImage(
  path: string,
  file: File,
  onProgress?: (loaded: number, total: number) => void,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ name: file.name })
  return postOctetStream<MSDMedia>(`${path}?${query}`, file, onProgress, signal)
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

export type EDIDApplyRequired = 'none' | 'hotplug' | 'reboot' | 'power_cycle'

export type DiagnosticsEvent =
  | { type: 'job'; id: string }
  | { type: 'line'; text: string }
  | { type: 'done'; id: string; name: string }
  | { type: 'error'; message: string }

export interface EDIDStatus {
  supported: boolean
  writable?: boolean
  persistent?: boolean
  hotplug?: boolean
  apply_policy?: EDIDApplyRequired
  chip_id?: string
  board_id?: string
  size?: number
  data_hex?: string
  summary?: {
    manufacturer?: string
    monitor_name?: string
    preferred?: { width: number; height: number; fps: number }
  }
  directories?: {
    extension: string
    id: string
    role?: string
    writable: boolean
    files: { id: string; size: number }[]
  }[]
}

const wifiScanFlights = new Map<string, Promise<WifiNetwork[]>>()
function scanWifi(interfaceName = ''): Promise<WifiNetwork[]> {
  const existing = wifiScanFlights.get(interfaceName)
  if (existing) return existing
  const task = request<WifiNetwork[]>(`/api/network/wifi/scan?interface=${encodeURIComponent(interfaceName)}`, { cache: 'no-store' })
    .finally(() => { wifiScanFlights.delete(interfaceName) })
  wifiScanFlights.set(interfaceName, task)
  return task
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
  authMfaComplete: (body: {
    pending_token?: string
    type: string
    code?: string
    plugin_id?: string
    response?: unknown
  }) =>
    request<AuthStatus>('/api/auth/mfa/complete', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  authMfaCancel: (pendingToken?: string) =>
    request<void>('/api/auth/mfa/cancel', {
      method: 'POST',
      body: JSON.stringify({ pending_token: pendingToken || '' }),
    }),
  authTotpBegin: () => request<{ secret: string; otpauth_url: string }>('/api/auth/mfa/totp/begin', { method: 'POST' }),
  authTotpConfirm: (code: string) =>
    request<{ recovery_codes?: string[]; backup_codes?: string[] }>('/api/auth/mfa/totp/confirm', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),
  authTotpRecovery: (currentPassword: string) =>
    request<{ recovery_codes?: string[]; backup_codes?: string[] }>('/api/auth/mfa/totp/recovery', {
      method: 'POST',
      body: JSON.stringify({ current_password: currentPassword }),
    }),
  authTotpDisable: (currentPassword: string) =>
    request<void>('/api/auth/mfa/totp', {
      method: 'DELETE',
      body: JSON.stringify({ current_password: currentPassword }),
    }),
  authPluginEnroll: (id: string) =>
    request<{ status: string; id: string }>(`/api/auth/mfa/plugin/${encodeURIComponent(id)}`, { method: 'POST' }),
  authPluginDisable: (id: string, currentPassword: string) =>
    request<void>(`/api/auth/mfa/plugin/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      body: JSON.stringify({ current_password: currentPassword }),
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
  getVideoEDID: () => request<EDIDStatus>('/api/video/edid', { cache: 'no-store' }),
  applyVideoEDID: (body: { data_hex?: string; library?: { extension: string; directory: string; id: string }; preset?: string; custom?: string }) =>
    request<{ status: string; apply_required: EDIDApplyRequired }>('/api/video/edid', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  resetVideoEDID: () => request<{ status: string; apply_required: EDIDApplyRequired }>('/api/video/edid/reset', { method: 'POST' }),
  getMJPEGStreamURL: () => `${serviceBaseUrl()}/api/stream`,
  getVideoWebSocketURL: (videoCodec?: string) => serviceWebSocketURL(
    `/api/stream/ws${videoCodec ? `?video_codec=${encodeURIComponent(videoCodec)}` : ''}`,
  ),
  getAudioWebSocketURL: () => serviceWebSocketURL('/api/audio/ws'),
  getHIDWebSocketURL: () => serviceWebSocketURL('/api/hid/ws'),
  resetUSB: () => request<{ status: string }>('/api/hid/reset', { method: 'POST' }),
  getMSDWebSocketURL: () => serviceWebSocketURL('/api/msd/ws'),
  // The status endpoint negotiates a snapshot or SSE stream from Accept.
  getStatusEventsURL: () => `${serviceBaseUrl()}/api/status`,
  getMSDStatus: () => request<MSDStatus>('/api/msd/status', { cache: 'no-store' }),
  connectMSD: () => request<MSDStatus>('/api/msd/connect', { method: 'POST' }),
  disconnectMSD: () => request<MSDStatus>('/api/msd/disconnect', { method: 'POST' }),
  connectMSDMTP: () => request<MSDStatus>('/api/msd/mtp/connect', { method: 'POST' }),
  disconnectMSDMTP: () => request<MSDStatus>('/api/msd/mtp/disconnect', { method: 'POST' }),
  getMSDMedia: () => request<MSDMedia[]>('/api/msd/media', { cache: 'no-store' }),
  getMSDSources: (refresh = false) => msdSources.get(serviceBaseUrl(), () => request<MSDSource[]>(`/api/msd/sources${refresh ? '?refresh=true' : ''}`, { cache: 'no-store' }), refresh),
  browseMSDSource: (source: MSDSource, path: string, kind: MSDMedia['kind'], signal?: AbortSignal) => {
    const query = new URLSearchParams({ extension: source.extension, directory: source.directory, path, kind })
    return request<MSDSourceListing>(`/api/msd/sources/browse?${query}`, { cache: 'no-store', signal })
  },
  mountMSDMedia: (id: string) => request<MSDStatus>(`/api/msd/media/${encodeURIComponent(id)}/mount`, { method: 'POST' }),
  ejectMSD: (kind: 'iso' | 'drive') => request<MSDStatus>(`/api/msd/eject/${kind}`, { method: 'POST' }),
  deleteMSDMedia: (id: string) => request<void>(`/api/msd/media/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  renameMSDISO: (id: string, name: string) => request<MSDMedia>(`/api/msd/media/${encodeURIComponent(id)}/rename`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  }),
  uploadMSDISO: (file: File, onProgress?: (loaded: number, total: number) => void, signal?: AbortSignal) =>
    uploadStoredImage('/api/msd/iso-uploads', file, onProgress, signal),
  startMSDDownload: (url: string, name: string) => request<MSDDownloadTask>('/api/msd/iso-downloads', {
    method: 'POST', body: JSON.stringify({ url, name }),
  }),
  getMSDDownloads: (signal?: AbortSignal) => request<MSDDownloadTask[]>('/api/msd/iso-downloads', { signal }),
  cancelMSDDownload: (id: string) => request<MSDDownloadTask>(`/api/msd/iso-downloads/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
  }),
  uploadMSDDriveImage: (file: File, onProgress?: (loaded: number, total: number) => void, signal?: AbortSignal) =>
    uploadStoredImage('/api/msd/drive-uploads', file, onProgress, signal),
  createMSDDrive: (name: string, label: string, sizeMiB: number, filesystem = 'exfat') => request<MSDMedia>('/api/msd/drives', {
    method: 'POST',
    body: JSON.stringify({ name, label, size_mib: sizeMiB, filesystem }),
  }),
  listMSDDriveFiles: (id: string, path = '') => request<MSDFileEntry[]>(`/api/msd/drives/${encodeURIComponent(id)}/files?path=${encodeURIComponent(path)}`),
  uploadMSDDriveFile,
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
  listDeviceFiles: (path = '') => request<DeviceFileListing>(`/api/files?path=${encodeURIComponent(path)}`, { cache: 'no-store' }),
  readDeviceFile,
  uploadDeviceFile,
  createDeviceDirectory: (path: string) => request<void>('/api/files/directories', {
    method: 'POST',
    body: JSON.stringify({ path }),
  }),
  renameDeviceFile: (from: string, to: string) => request<void>('/api/files/rename', {
    method: 'POST',
    body: JSON.stringify({ from, to }),
  }),
  deleteDeviceFile: (path: string) => request<void>(`/api/files?path=${encodeURIComponent(path)}`, { method: 'DELETE' }),
  getDeviceFileURL: (path: string) => `${serviceBaseUrl()}/api/files/download?path=${encodeURIComponent(path)}`,
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
  savePersonalizationConfig: (personalization: PersonalizationConfig) =>
    request<PersonalizationConfig>('/api/config/personalization', {
      method: 'PUT',
      body: JSON.stringify(personalization),
    }),
  getInputConfig: () => request<InputConfig>('/api/config/input', { cache: 'no-store' }),
  saveInputConfig: (input: InputConfig) =>
    request<InputConfig>('/api/config/input', {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  getConfigSchema: () => request<ConfigSchema>('/api/config/schema'),
  saveConfig: (config: OneKVMConfig, webRTCSessionId = '') =>
		request<ConfigSaveResponse>('/api/config', {
      method: 'PUT',
      body: JSON.stringify(config),
      headers: webRTCSessionId ? { 'X-OneKVM-WebRTC-Session': webRTCSessionId } : undefined,
    }),
  patchConfig: (key: string, value: string, webRTCSessionId = '') =>
    request<ConfigSaveResponse>('/api/config', {
      method: 'PATCH',
      body: JSON.stringify({ key, value }),
      headers: webRTCSessionId ? { 'X-OneKVM-WebRTC-Session': webRTCSessionId } : undefined,
    }),
  resetConfig: () => request<{ status: string }>('/api/config/reset', { method: 'POST', keepalive: true }),
  factoryReset: () => request<{ status: string }>('/api/system/factory-reset', { method: 'POST', keepalive: true }),
  rebootSystem: () => request<{ status: string }>('/api/system/reboot', { method: 'POST', keepalive: true }),
  enterRecovery: (network: RecoveryNetworkSettings) => request<{ status: string }>('/api/system/recovery', { method: 'POST', body: JSON.stringify(network), keepalive: true }),
  runDiagnostics: async (
    onEvent: (event: DiagnosticsEvent) => void,
    signal?: AbortSignal,
    resumeId?: string,
  ) => {
    const { id } = resumeId ? { id: resumeId } : await request<{ id: string }>(
      '/api/system/diagnostics/run', { method: 'POST', signal },
    )
    onEvent({ type: 'job', id })
    let seen = 0
    const deadline = Date.now() + 360_000
    while (!signal?.aborted && Date.now() < deadline) {
      let job: { state: string; lines: string[]; name?: string; message?: string }
      try {
        job = await request(`/api/system/diagnostics/${encodeURIComponent(id)}`, {
          cache: 'no-store', signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(5000)])
            : AbortSignal.timeout(5000),
        })
      } catch (error) {
        if (signal?.aborted || (error instanceof APIError && error.status < 500)) throw error
        // Bridge reads stop Core briefly. The independent job keeps running.
        await new Promise<void>((resolve) => window.setTimeout(resolve, 1500))
        continue
      }
      for (const text of job.lines.slice(seen)) onEvent({ type: 'line', text })
      seen = job.lines.length
      if (job.state === 'done' && job.name) {
        onEvent({ type: 'done', id, name: job.name })
        return
      }
      if (job.state === 'error') {
        onEvent({ type: 'error', message: job.message || job.lines.at(-1) || 'Diagnostics collection failed' })
        return
      }
      await new Promise<void>((resolve) => window.setTimeout(resolve, 1500))
    }
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    throw new APIError('Diagnostics collection timed out', 0)
  },
  downloadDiagnostics: async (id: string) => {
    const response = await fetch(
      `${serviceBaseUrl()}/api/system/diagnostics/${encodeURIComponent(id)}/download`,
      {
        credentials: import.meta.env.VITE_WITH_CREDENTIALS === 'false' ? 'omit' : 'include',
      },
    )
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null
      if (response.status === 401) window.dispatchEvent(new Event('onekvm:unauthorized'))
      throw new APIError(body?.error || `HTTP ${response.status}`, response.status)
    }
    const disposition = response.headers.get('Content-Disposition') || ''
    const match = /filename="([^"]+)"/i.exec(disposition)
    const name = match?.[1] || `onekvm-diagnostics-${id}.zip`
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    try {
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = name
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
    } finally {
      URL.revokeObjectURL(url)
    }
  },
  getStatus: () => request<OneKVMStatus>('/api/status', { cache: 'no-store' }),
  getStorageStatusEventsURL: () => `${serviceBaseUrl()}/api/system/storage/events`,
  getResources: () => request<ResourceHistory>('/api/resources'),
  getSessions: () => request<OnlineSession[]>('/api/sessions', { cache: 'no-store' }),
  getLogs: async (lines = 250) =>
    (await request<LogResponse>(`/api/logs?lines=${encodeURIComponent(lines)}`)).lines,
  getServices: () => request<ManagedService[]>('/api/services'),
  serviceAction: (id: string, action: 'start' | 'stop' | 'restart' | 'enable' | 'disable') =>
    request<{ status: string }>(`/api/services/${encodeURIComponent(id)}/${action}`, { method: 'POST' }),
	getOneKVMServiceSettings: () => request<OneKVMServiceSettings>('/api/services/onekvm'),
	getLoginBans: () => request<LoginBan[]>('/api/security/login-bans', { cache: 'no-store' }),
  getHoneypotStatus: () => request<HoneypotStatus>('/api/security/honeypot', { cache: 'no-store' }),
	addLoginBan: (ban: ManualLoginBanRequest) => request<LoginBan[]>('/api/security/login-bans', { method: 'POST', body: JSON.stringify(ban) }),
	removeLoginBan: (id: string) => request<void>(`/api/security/login-bans/${encodeURIComponent(id)}`, { method: 'DELETE' }),
	saveOneKVMSecuritySettings: (settings: OneKVMSecuritySettings) =>
		request<OneKVMServiceSettings>('/api/services/onekvm', { method: 'PUT', body: JSON.stringify(settings) }),
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
	getZramServiceSettings: () => request<ZramServiceSettings>('/api/services/zram'),
	saveZramServiceSettings: (settings: ZramServiceSettings) =>
		request<ZramServiceSettings>('/api/services/zram', {
			method: 'PUT',
			body: JSON.stringify(settings),
		}),
	getNetworkInterfaces: () => request<NetworkInterfaceStatus[]>('/api/network/interfaces'),
	getWifiStatus: (interfaceName = '') => request<WifiStatus>(`/api/network/wifi?interface=${encodeURIComponent(interfaceName)}`, { cache: 'no-store' }),
	scanWifi,
	connectWifi: (ssid: string, password?: string, interfaceName = '') => request<WifiStatus>('/api/network/wifi/connect', { method: 'POST', body: JSON.stringify({ interface: interfaceName, ssid, password }) }),
  saveWifiNetwork: (profile: WifiProfileSettings) => request<WifiStatus>('/api/network/wifi/saved', { method: 'POST', body: JSON.stringify(profile) }),
  forgetWifiNetwork: (ssid: string, interfaceName = '') => request<WifiStatus>('/api/network/wifi/saved', { method: 'DELETE', body: JSON.stringify({ interface: interfaceName, ssid }) }),
	setWifiAp: (enabled: boolean) => request<WifiStatus>('/api/network/wifi/ap', { method: 'POST', body: JSON.stringify({ enabled }) }),
	setWifiApConfig: (ssid: string, password: string, channel: number, band: '2.4' | '5', network: WifiApNetwork) => request<WifiStatus>('/api/network/wifi/ap/config', { method: 'POST', body: JSON.stringify({ ssid, password, channel, band, network }) }),
	setWifiMode: (mode: WifiStatus['mode']) => request<WifiStatus>('/api/network/wifi/mode', { method: 'POST', body: JSON.stringify({ mode }) }),
	getNetworkApplyStatus: () => request<NetworkApplyStatus>('/api/network/apply', { cache: 'no-store' }),
	confirmNetworkApply: () => request<{ status: string }>('/api/network/apply/confirm', { method: 'POST' }),
	confirmNetworkApplyToken: (token: string) => request<{ status: string }>(`/api/network/apply/confirm?token=${encodeURIComponent(token)}`, { method: 'POST' }),
	getNetworkDNS: () => request<{ servers: string[]; use_custom_dns: boolean; automatic_servers: string[] }>('/api/network/dns'),
	setNetworkDNS: (servers: string[], useCustomDNS = servers.length > 0) => request<{ status: string }>('/api/network/dns', { method: 'PUT', body: JSON.stringify({ servers, use_custom_dns: useCustomDNS }) }),
	getNetworkRoutes: () => request<StaticRoute[]>('/api/network/routes'),
	setNetworkRoutes: (routes: StaticRoute[]) => request<{ status: string }>('/api/network/routes', { method: 'PUT', body: JSON.stringify(routes) }),
	getNetworkActiveRoutes: () => request<ActiveNetworkRoute[]>('/api/network/routes/active'),
  getFirewall: () => request<FirewallStatus>('/api/firewall', { cache: 'no-store' }),
  updateFirewall: (settings: FirewallUpdate) =>
    request<FirewallStatus>('/api/firewall', { method: 'PUT', body: JSON.stringify(settings) }),
  addFirewallRule: (rule: FirewallRuleInput) =>
    request<FirewallStatus>('/api/firewall/rules', { method: 'POST', body: JSON.stringify(rule) }),
  deleteFirewallRule: (id: number) => request<FirewallStatus>(`/api/firewall/rules/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  confirmFirewall: (token?: string) => request<{ status: string }>(`/api/firewall/confirm${token ? `?token=${encodeURIComponent(token)}` : ''}`, { method: 'POST' }),
  rollbackFirewall: () => request<{ status: string }>('/api/firewall/rollback', { method: 'POST' }),
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
  getSystemUpdatePreflight: () => request<SystemUpdatePreflight>('/api/system/update/preflight'),
  addSystemUpdatePackage: (id: string, file: File) => request<SystemUpdatePreflight>('/api/system/update/preflight/packages', {
    method: 'POST', body: file, headers: { 'Content-Type': 'application/octet-stream', 'X-OneKVM-Update-ID': id },
  }),
  commitSystemUpdatePreflight: (id: string) => request<{ status: string }>('/api/system/update/preflight', {
    method: 'POST', body: JSON.stringify({ id }),
  }),
  cancelSystemUpdatePreflight: (id: string) => request<SystemUpdatePreflight>('/api/system/update/preflight', {
    method: 'DELETE', body: JSON.stringify({ id }),
  }),
  getSystemOnlineUpdate: () => request<SystemOnlineUpdate>('/api/system/update/online'),
  startSystemOnlineUpdate: () => request<{ status: string }>('/api/system/update/online', { method: 'POST' }),
  getSystemOnlineUpdateProgress: () => request<SystemOnlineUpdateProgress>('/api/system/update/online/progress'),
  getSystemUpdateFiles: () => request<{ files: SystemUpdateLocalFile[] }>('/api/system/update/files'),
  startSystemUpdateSource: (source: SystemUpdateSource) =>
    request<{ status: string }>('/api/system/update/source', { method: 'POST', body: JSON.stringify(source) }),
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
  getConsoleExtensions: () => consoleExtensions.get(serviceBaseUrl(), () => request<ConsoleExtension[]>('/api/extensions/console', { cache: 'no-store' })),
  getExtension,
  getExtensionLayout: (extension: ExtensionStatus) => {
    if (!extension.page || extension.page.renderer !== 'layout') {
      return Promise.reject(new Error('Extension does not register a layout page'))
    }
    return request<ExtensionLayout>(extensionPagePath(extension, extension.page.entrypoint))
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
  removeExtension: (id: string, options?: RemoveExtensionOptions) =>
    request<{ status: string }>(`/api/extensions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      body: JSON.stringify({ delete_data: Boolean(options?.deleteData) }),
    }),
  getWebRTCIce: () => request<{ ice_servers: IceServer[] }>('/api/webrtc/ice', { cache: 'no-store' }),
  createWebRTCSession: (sdp: string, microphone = false, media: 'audio_video' | 'video' | 'audio' = 'audio_video', videoCodec?: string) =>
    request<WebRTCAnswer>('/api/webrtc/offer', {
      method: 'POST',
      body: JSON.stringify({ type: 'offer', sdp, microphone, media, video_codec: videoCodec }),
    }),
  closeWebRTCSession: (sessionId: string, keepalive = false) =>
    request<{ status: string }>('/api/webrtc/close', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId }),
      keepalive,
    }),
  setWebRTCMicrophone: (sessionId: string, enabled: boolean) =>
    request<{ status: string; microphone?: boolean }>('/api/webrtc/microphone', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId, enabled }),
    }),
  power: (action: 'on' | 'off' | 'reset') =>
    request<{ status: string }>(`/api/power/${action}`, { method: 'POST' }),
}

export interface RecoveryNetworkSettings {
  source: 'system' | 'custom'
  interface: string
  mode: 'dhcp' | 'static'
  address: string
  gateway: string
  fallback_enabled: boolean
  fallback_address: string
  mac_address: string
  use_custom_dns: boolean
  dns: string[]
}
export interface RecoveryNetworkPreview {
  settings: RecoveryNetworkSettings
  effective: RecoveryNetworkSettings | null
  error: string | null
  pending_system_network: boolean
}
export const recoveryNetworkApi = {
  get: () => request<RecoveryNetworkPreview>('/api/system/recovery-network'),
  preview: (settings: RecoveryNetworkSettings) => request<RecoveryNetworkPreview>('/api/system/recovery-network', { method: 'POST', body: JSON.stringify(settings) }),
}
