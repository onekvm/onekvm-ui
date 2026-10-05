<script setup lang="ts">
import { computed, h, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch, type Component } from 'vue'
import {
  ArrowLeft,
  Activity,
  Box,
  Boxes,
  Cable,
  Check,
  ChevronDown,
  CircleUserRound,
  Cloud,
  Clock3,
  Download,
  ExternalLink,
  FileUp,
  FolderOpen,
  Keyboard,
  LaptopMinimalCheck,
  LifeBuoy,
  ListRestart,
  LoaderCircle,
  LogOut,
  Cpu,
  HardDrive,
  MonitorUp,
  Network,
  Palette,
  Plus,
  RadioTower,
  RefreshCw,
  RotateCcw,
  Save,
  ScrollText,
  ServerCog,
  Trash2,
  Upload,
	Usb,
  Wifi,
  icons,
} from '@lucide/vue'
import { NIcon, useDialog, useMessage, type DropdownOption } from 'naive-ui'

import { useOneKVMTheme } from '@/theme/runtime'
import { isCloudHosted } from '@/api/service-url'
import { oneKVMThemeCSSVariables, type OneKVMAppearancePreference } from '@/theme/model'

import {
  api,
  APIError,
  extensionAssetURL,
  extensionRouteURL,
  extensionTranslation,
  type ExtensionSummary,
  type ExtensionStatus,
  type ConfigSchema,
  type OneKVMConfig,
  type OneKVMStatus,
	type NetworkApplyStatus,
  type StoragePartitionStatus,
  type SystemTimeStatus,
  type SystemUpdateSlot,
  type SystemUpdateStatus,
  type SystemOnlineUpdate,
  type SystemOnlineUpdateProgress,
  type SystemUpdateSource,
} from '@/api/client'
import { hasPermission } from '@/build'
import { useAuth } from '@/composables/useAuth'
import { currentLanguage, languageOptions, setLanguage, t } from '@/i18n/runtime'
import { machineDisplayName } from '@/lib/machine'
import { brandPluginIconUrl } from '@/lib/plugin-icons'
import { DEFAULT_DISCOVERY_URL, configuredStaticAddresses, isNetworkConfigDirty, isNetworkConfigValid, networkConfigSnapshot, usesCustomDNS, usesCustomDiscoveryURL, validHostname } from '@/lib/network'
import {
  SETTINGS_APP_QUERY,
  SETTINGS_INDEX,
  cloudSettingsTarget,
  settingsSidebarActive,
  settingsSidebarGroupActive,
  groupSettingsSections,
  isSettingsIndex,
  settingsBackTarget,
  settingsGroupTone,
} from '@/lib/settings-nav'
import { uiProduct } from '@/product'

import ExtensionLayoutPage from './ExtensionLayoutPage.vue'
import ExtensionServiceRecovery from './ExtensionServiceRecovery.vue'
import ExtensionVuePage from './ExtensionVuePage.vue'
import CloudProvidersPage from './CloudProvidersPage.vue'
import AccountDrawer from './AccountDrawer.vue'
import DNSSettingsForm from './DNSSettingsForm.vue'
import ActiveRoutesPanel from './ActiveRoutesPanel.vue'
import DisplaySettingsForm from './DisplaySettingsForm.vue'
import HostnameSettingsForm from './HostnameSettingsForm.vue'
import DiscoverySettingsForm from './DiscoverySettingsForm.vue'
import NetworkInterfaceManager from './NetworkInterfaceManager.vue'
import ProxySettingsForm from './ProxySettingsForm.vue'
import WebRtcIceSettingsForm from './WebRtcIceSettingsForm.vue'
import ExtensionManager from './ExtensionManager.vue'
import ResourceMonitorPage from './ResourceMonitorPage.vue'
import OnlineSessionsPage from './OnlineSessionsPage.vue'
import LogsPage from './LogsPage.vue'
import ServicesPage from './ServicesPage.vue'
import StaticRoutesForm from './StaticRoutesForm.vue'
import TimezoneMap from './TimezoneMap.vue'
import SystemUpdateSourceSelector, { type UpdateMethod } from './SystemUpdateSourceSelector.vue'
import { timezones } from '@/lib/timezones'
import KeyboardShortcutEditor from './KeyboardShortcutEditor.vue'
import UserManagement from './UserManagement.vue'
import USBSettingsForm from './USBSettingsForm.vue'
import AdvancedSettingsLoading from './AdvancedSettingsLoading.vue'
import DiagnosticsCollectModal from './DiagnosticsCollectModal.vue'
import FileManagerPage from './file-manager/FileManagerPage.vue'
import SettingsAppList from './SettingsAppList.vue'
import SystemMemorySpec from './SystemMemorySpec.vue'
import SystemSpecBadge from './SystemSpecBadge.vue'

type Section = string
type SystemAction = 'factory-reset' | 'reboot' | 'recovery'
type SystemActionStage = 'submitting' | 'waiting' | 'offline' | 'complete' | 'timeout'
type SidebarSection = {
  key: string
  label: string
  icon: Component
  iconURL?: string
  parent?: 'plugins'
  component?: Component
}

function sectionFromRoute(route: string): Section {
  const normalized = route.replace(/^\/+|\/+$/g, '')
  if (!normalized || normalized === SETTINGS_INDEX) return SETTINGS_INDEX
  if (normalized.startsWith('plugins/')) {
    try {
      return `extension:${decodeURIComponent(normalized.slice('plugins/'.length))}`
    } catch {
      return 'plugins'
    }
  }
  if (normalized.startsWith('cloud/')) {
    try {
      return `extension:${decodeURIComponent(normalized.slice('cloud/'.length))}`
    } catch {
      return 'cloud'
    }
  }
  if (uiProduct.settingsSections?.some((item) => item.key === normalized)) return normalized
  if (normalized === 'audio') return 'usb'
  return ['display', 'network', 'keyboard', 'usb', 'cloud', 'plugins', 'services', 'logs', 'resources', 'sessions', 'system', 'files', 'users', 'time', 'update'].includes(normalized) ? normalized : 'system'
}

function routeFromSection(value: Section) {
  if (isSettingsIndex(value)) return ''
  if (value.startsWith('extension:')) {
    const id = value.slice('extension:'.length)
    const prefix = extensions.value.find((extension) => extension.id === id)?.kind === 'cloud-provider'
      ? 'cloud'
      : 'plugins'
    return `${prefix}/${encodeURIComponent(id)}`
  }
  return value
}

const props = defineProps<{
  status: OneKVMStatus | null
  route: string
  canChangeVideo: boolean
  videoSessionId: string
}>()
const emit = defineEmits<{ close: []; navigate: [route: string] }>()

const storagePartitions = computed(() =>
  (props.status?.system?.storage_partitions || []).filter((partition) => partition.total_bytes > 0),
)
const storageCapacityBytes = computed(() => {
  const partitionTotal = storagePartitions.value.reduce((total, partition) => total + partition.total_bytes, 0)
  return partitionTotal || props.status?.system?.storage_total_bytes || 0
})
const highlightedStoragePartition = ref('')

const dialog = useDialog()
const message = useMessage()
const { auth, logout, refresh: refreshAuth } = useAuth()
const canManageUsers = computed(() => hasPermission(auth, 'users.manage'))
const canManageSettings = computed(() => hasPermission(auth, 'settings.manage'))
const accountOpen = ref(false)
const section = ref<Section>(sectionFromRoute(props.route))
const lastDetailSection = ref<Section>(isSettingsIndex(section.value) ? 'system' : section.value)
const mobileSettings = shallowRef(window.matchMedia(SETTINGS_APP_QUERY).matches)
let settingsAppQuery: MediaQueryList | null = null
const config = ref<OneKVMConfig | null>(null)
const schema = ref<ConfigSchema | null>(null)
const extensions = ref<ExtensionSummary[]>([])
const extensionDetails = ref<Record<string, ExtensionStatus>>({})
const extensionsLoaded = ref(false)
const extensionsLoading = ref(false)
const extensionLoading = ref(false)
const extensionError = ref('')
const loading = ref(true)
const saving = ref(false)
const keyboardShortcutsValid = ref(true)
const usbSettingsValid = ref(true)
const keyboardLayoutOptions = computed(() => [
	{ value: 'us', label: t('keyboard.layouts.us', 'English (US)') },
	{ value: 'uk', label: t('keyboard.layouts.uk', 'English (UK)') },
	{ value: 'de', label: t('keyboard.layouts.de', 'German') },
	{ value: 'fr', label: t('keyboard.layouts.fr', 'French') },
	{ value: 'es', label: t('keyboard.layouts.es', 'Spanish') },
	{ value: 'it', label: t('keyboard.layouts.it', 'Italian') },
	{ value: 'ru', label: t('keyboard.layouts.ru', 'Russian') },
	{ value: 'jp', label: t('keyboard.layouts.jp', 'Japanese') },
	{ value: 'ko', label: t('keyboard.layouts.ko', 'Korean') },
])
const networkEditorsValid = ref(true)
const automaticDNSServers = ref<string[]>([])
const savedNetworkSnapshot = shallowRef('')
const networkDirty = computed(() => {
  const network = config.value?.network
  return Boolean(network && isNetworkConfigDirty(network, savedNetworkSnapshot.value))
})
const networkApply = ref<NetworkApplyStatus | null>(null)
const networkApplyExpiresAt = ref(0)
const networkApplyConnectionLost = ref(false)
const networkConfirming = ref(false)
const resetting = ref(false)
const rebooting = ref(false)
const enteringRecovery = ref(false)
const diagnosticsOpen = ref(false)
const systemAction = ref<SystemAction | null>(null)
const systemActionStage = ref<SystemActionStage>('submitting')
const systemActionInitialUptime = ref(0)
const systemActionInitiallyAuthenticated = ref(false)
const systemActionSawOffline = ref(false)
const error = ref('')
const systemDetailsError = ref('')
const systemTime = ref<SystemTimeStatus | null>(null)
const systemUpdate = ref<SystemUpdateStatus | null>(null)
const systemUpdateUnavailable = ref(false)
const onlineUpdate = ref<SystemOnlineUpdate | null>(null)
const updateMethod = shallowRef<UpdateMethod>('github')
const updateStarted = shallowRef(false)
const onlineUpdateProgress = ref<SystemOnlineUpdateProgress | null>(null)
const onlineUpdateError = ref('')
const onlineUpdateLoading = ref(false)
const onlineDownloadPercent = computed(() => {
  const progress = onlineUpdateProgress.value
  return progress?.total_bytes ? Math.round(progress.bytes / progress.total_bytes * 100) : 0
})
const selectedTimezone = ref('UTC')
const selectedNTP = ref(true)
const selectedNTPServers = ref<string[]>([])
const selectedDeviceLanguage = ref('en')
const systemDetailsLoading = ref(false)
const timeSaving = ref(false)
const browserTimeSyncing = ref(false)
const slotSwitching = ref('')
const updateFile = ref<File | null>(null)
const updateFileInput = ref<HTMLInputElement | null>(null)
const updateFileDragging = ref(false)
const updateInstalling = ref(false)
const clockTick = ref(Date.now())
const pluginsExpanded = ref(true)
const sidebarNav = ref<HTMLElement | null>(null)
const pluginFrame = ref<HTMLIFrameElement | null>(null)
const pluginFrameHeight = ref<number | null>(null)
let pluginFrameObserver: ResizeObserver | null = null
let pluginFrameMutationObserver: MutationObserver | null = null
let pluginFrameAnimationFrame: number | null = null
let clockTimer: number | null = null
let updatePollTimer: number | null = null
let onlineUpdateTimer: number | null = null
let updatePollSawOperation = false
let systemActionRun = 0
let networkApplyPollInFlight = false
let networkApplyLastPoll = 0

const networkApplySeconds = computed(() => {
	clockTick.value
	if (!networkApply.value?.pending) return 0
	return Math.max(0, Math.ceil((networkApplyExpiresAt.value - Date.now()) / 1000))
})

const networkApplyMessage = computed(() =>
	(networkApply.value?.ready === false
		? t('network.confirm.preparing', 'Applying network settings…')
		: t('network.confirm.message', 'Please confirm configuration within {{time}}'))
		.replace('{{time}}', `${networkApplySeconds.value}s`),
)

const networkApplyLinks = computed(() => {
	const network = config.value?.network
	if (!network) return []
	const protocol = network.tls_enabled ? 'https:' : 'http:'
	const port = network.tls_enabled ? network.https_port : network.http_port
	const defaultPort = (protocol === 'https:' && port === 443) || (protocol === 'http:' && port === 80)
	return (networkApply.value?.new_addresses || []).map((address) => {
		const host = address.includes(':') ? `[${address}]` : address
		const url = new URL(`${protocol}//${host}${defaultPort ? '' : `:${port}`}${window.location.pathname}`)
		if (networkApply.value?.confirm_token) {
			url.searchParams.set('network-confirm', networkApply.value.confirm_token)
		}
		url.hash = '/settings/advanced/network'
		return { address, label: url.origin, href: url.toString() }
	}).filter((link) => new URL(link.href).origin !== window.location.origin)
})

function pendingNetworkStatus(): NetworkApplyStatus {
	const network = config.value?.network
	const previous = savedNetworkSnapshot.value ? JSON.parse(savedNetworkSnapshot.value) as typeof network : null
	const existing = new Set(previous ? configuredStaticAddresses(previous) : [])
	const endpointChanged = Boolean(previous && network && (
		previous.tls_enabled !== network.tls_enabled ||
		previous.http_port !== network.http_port ||
		previous.https_port !== network.https_port
	))
	const addresses = network
		? configuredStaticAddresses(network).filter((address) => endpointChanged || !existing.has(address))
		: []
	return { pending: true, seconds_remaining: 60, new_addresses: addresses, applying: true }
}

function setNetworkApplyStatus(status: NetworkApplyStatus, connectionLost = false) {
	if (!status.pending) {
		networkApply.value = null
		networkApplyExpiresAt.value = 0
		networkApplyConnectionLost.value = false
		return
	}
	networkApply.value = status
	networkApplyExpiresAt.value = Date.now() + Math.max(0, status.seconds_remaining) * 1000
	networkApplyConnectionLost.value = connectionLost
}

async function refreshNetworkApplyStatus(showRollback = false) {
	if (networkApplyPollInFlight) return
	networkApplyPollInFlight = true
	try {
		const status = await api.getNetworkApplyStatus()
		const wasPending = Boolean(networkApply.value?.pending)
		setNetworkApplyStatus(status)
		if (wasPending && !status.pending) {
			if (showRollback) message.warning(t('network.confirm.autoRollback', 'Configuration automatically rolled back'))
			await load()
		}
	} catch {
		// A changed address or interface restart can make the old address
		// temporarily unreachable. The device still owns the rollback timer.
	} finally {
		networkApplyPollInFlight = false
	}
}

async function confirmNetworkConfiguration() {
	networkConfirming.value = true
	try {
		await api.confirmNetworkApply()
		setNetworkApplyStatus({ pending: false, seconds_remaining: 0 })
		message.success(t('network.confirm.confirmed', 'Network configuration confirmed'))
		await load()
	} catch (reason) {
		message.error(`${t('network.confirm.confirmError', 'Confirmation failed')}: ${reason instanceof Error ? reason.message : String(reason)}`)
	} finally {
		networkConfirming.value = false
	}
}

const systemActionSpinning = computed(() =>
  systemAction.value !== null && !['complete', 'timeout'].includes(systemActionStage.value),
)

const systemActionTitle = computed(() => {
  if (systemAction.value === 'factory-reset') {
    if (systemActionStage.value === 'complete') return t('settings.factoryReset.completeTitle', 'Factory settings restored')
    if (systemActionStage.value === 'timeout') return t('settings.factoryReset.timeoutTitle', 'Unable to reconnect')
    return t('settings.factoryReset.processingTitle', 'Restoring factory settings')
  }
  if (systemAction.value === 'recovery') {
    if (systemActionStage.value === 'complete') return t('settings.recoveryMode.completeTitle', 'Device entered Recovery')
    if (systemActionStage.value === 'timeout') return t('settings.recoveryMode.timeoutTitle', 'Recovery is taking longer than expected')
    return t('settings.recoveryMode.processingTitle', 'Entering Recovery')
  }
  if (systemActionStage.value === 'complete') return t('settings.rebootDevice.completeTitle', 'Device restarted')
  if (systemActionStage.value === 'timeout') return t('settings.rebootDevice.timeoutTitle', 'Device is still unavailable')
  return t('settings.rebootDevice.processingTitle', 'Restarting device')
})

const systemActionDescription = computed(() => {
  if (systemAction.value === 'factory-reset') {
    if (systemActionStage.value === 'complete') return t('settings.factoryReset.complete', 'Factory settings have been restored. Reopening OneKVM...')
    if (systemActionStage.value === 'timeout') return t('settings.factoryReset.timeout', 'The reset was submitted, but this address is not responding. The device may have obtained a new network address.')
    if (systemActionStage.value === 'offline') return t('settings.factoryReset.offline', 'The device connection was interrupted while applying defaults. Waiting for it to become available...')
    if (systemActionStage.value === 'waiting') return t('settings.factoryReset.waiting', 'The reset was submitted. Waiting for the initial setup service...')
    return t('settings.factoryReset.processing', 'Removing OneKVM settings and the login account. Do not disconnect power.')
  }
  if (systemAction.value === 'recovery') {
    if (systemActionStage.value === 'complete') return t('settings.recoveryMode.complete', 'The web connection has closed. Finish the recovery operation and return the device to normal mode before refreshing this page.')
    if (systemActionStage.value === 'timeout') return t('settings.recoveryMode.timeout', 'The device is still responding in normal mode. You can keep waiting without sending the Recovery command again.')
    return systemActionStage.value === 'waiting'
      ? t('settings.recoveryMode.waiting', 'Waiting for the device to leave normal mode. This web page will become unavailable in Recovery.')
      : t('settings.recoveryMode.processing', 'Sending the Recovery command. Do not disconnect power.')
  }
  if (systemActionStage.value === 'complete') return t('settings.rebootDevice.complete', 'The device is online again. Reloading OneKVM...')
  if (systemActionStage.value === 'timeout') return t('settings.rebootDevice.timeout', 'The device did not come back before the timeout. You can continue waiting without restarting it again.')
  if (systemActionStage.value === 'offline') return t('settings.rebootDevice.offline', 'The device is offline. Waiting for OneKVM to finish starting...')
  if (systemActionStage.value === 'waiting') return t('settings.rebootDevice.waiting', 'Waiting for the device to restart...')
  return t('settings.rebootDevice.processing', 'Sending the restart command. Do not disconnect power.')
})
let updatePollIdleCount = 0

const dropdownIcon = (component: typeof CircleUserRound) => () => h(NIcon, null, { default: () => h(component) })
const { appearance, setAppearance } = useOneKVMTheme()
const themeChoices: { key: OneKVMAppearancePreference; label: () => string }[] = [
  { key: 'system', label: () => t('settings.appearance.followSystem', 'System') },
  { key: 'light', label: () => t('settings.appearance.light', 'Light') },
  { key: 'dark', label: () => t('settings.appearance.dark', 'Dark') },
]
const accountOptions = computed<DropdownOption[]>(() => [
  {
    key: 'theme',
    label: t('settings.appearance.theme', 'Theme'),
    icon: dropdownIcon(Palette),
    children: themeChoices.map((choice) => ({
      key: `theme-${choice.key}`,
      label: choice.label(),
      icon: appearance.value === choice.key ? dropdownIcon(Check) : undefined,
    })),
  },
  { type: 'divider', key: 'account-theme-divider' },
  { key: 'settings', label: t('settings.account.manage', 'Account settings'), icon: dropdownIcon(CircleUserRound) },
  { key: 'logout', label: t('settings.account.logoutBtn', 'Logout'), icon: dropdownIcon(LogOut) },
])

function selectAccount(key: string | number) {
  const value = String(key)
  if (value.startsWith('theme-')) {
    setAppearance(value.slice('theme-'.length))
    return
  }
  if (key === 'settings') accountOpen.value = true
  if (key === 'logout') void logout()
}

function lucideIcon(name: string | undefined): Component {
  if (!name) return Box
  const componentName = name.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('')
  return (icons as Record<string, Component>)[componentName] || Box
}

const activeCloudProviderPage = computed(() => extensions.value.find(
  (extension) => extension.installed
    && extension.enabled
    && extension.version
    && extension.has_page
    && extension.kind === 'cloud-provider',
) || null)

const sections = computed<SidebarSection[]>(() => {
  const pluginPages = extensions.value
    .filter((extension) => extension.installed
      && extension.enabled
      && extension.version
      && extension.has_page
      && extension.kind !== 'cloud-provider')
    .map((extension): SidebarSection => {
      const icon = extension.icon
      return {
        key: `extension:${extension.id}`,
        label: extensionTranslation(extension, currentLanguage.value).name,
        icon: icon?.source === 'lucide' ? lucideIcon(icon.name) : Box,
        iconURL:
          icon?.source === 'custom' && extension.icon_data_url?.startsWith('data:image/')
            ? extension.icon_data_url
            : brandPluginIconUrl(extension.id) || undefined,
        parent: 'plugins',
      }
    })
  return [
    { key: 'system', label: t('settings.advancedSettings.system', 'System'), icon: ServerCog },
    ...(canManageSettings.value
      ? [{ key: 'files', label: t('settings.advancedSettings.files', 'Files'), icon: FolderOpen }]
      : []),
    { key: 'display', label: t('settings.advancedSettings.display', 'Display'), icon: MonitorUp },
		{ key: 'keyboard', label: t('settings.advancedSettings.keyboard', 'Keyboard'), icon: Keyboard },
		{ key: 'usb', label: t('settings.advancedSettings.usb', 'USB'), icon: Usb },
    { key: 'network', label: t('settings.advancedSettings.network', 'Network'), icon: Network },
    { key: 'cloud', label: t('settings.advancedSettings.cloudProviders', 'Cloud services'), icon: Cloud },
    { key: 'plugins', label: t('settings.advancedSettings.plugins', 'Plugins'), icon: Box },
    ...pluginPages,
    { key: 'services', label: t('settings.advancedSettings.services', 'Services'), icon: ListRestart },
    { key: 'logs', label: t('settings.advancedSettings.logs', 'Logs'), icon: ScrollText },
    { key: 'resources', label: t('settings.advancedSettings.resources', 'Resource monitor'), icon: Activity },
    { key: 'sessions', label: t('settings.advancedSettings.sessions', 'Online sessions'), icon: RadioTower },
    ...(canManageUsers.value
      ? [{ key: 'users', label: t('settings.advancedSettings.users', 'Users'), icon: CircleUserRound }]
      : []),
    ...(uiProduct.settingsSections || [])
      .filter((item) => item.visible(auth))
      .map((item) => ({
        key: item.key,
        label: item.label(),
        icon: item.icon,
        component: item.component,
      })),
    { key: 'time', label: t('settings.advancedSettings.time', 'Region and time'), icon: Clock3 },
    { key: 'update', label: t('settings.advancedSettings.update', 'System update'), icon: Download },
  ]
})

const visibleSections = computed(() => sections.value.filter((item) => !item.parent || pluginsExpanded.value))
const paneSection = computed(() => (isSettingsIndex(section.value) ? lastDetailSection.value : section.value))
const mobileDetail = computed(() => mobileSettings.value && !isSettingsIndex(section.value))
const activeExtensionParent = computed(() => {
  const sidebarParent = sections.value.find((item) => item.key === paneSection.value)?.parent
  if (sidebarParent) return sidebarParent
  if (!paneSection.value.startsWith('extension:')) return undefined
  const id = paneSection.value.slice('extension:'.length)
  return extensions.value.find((extension) => extension.id === id)?.kind === 'cloud-provider'
    ? 'cloud'
    : undefined
})
const settingsPageClass = computed(() => ({
  'is-settings-app': mobileSettings.value,
  'is-settings-index': mobileSettings.value && isSettingsIndex(section.value),
  'is-settings-detail': mobileDetail.value,
}))

function sidebarItemLoading(item: SidebarSection) {
  if (item.key === 'cloud' || item.key === 'plugins') return extensionsLoading.value
  return item.key === paneSection.value && Boolean(item.parent) && extensionLoading.value
}

const activeTitle = computed(() => {
  const sidebarTitle = sections.value.find((item) => item.key === paneSection.value)?.label
  if (sidebarTitle) return sidebarTitle
  if (!paneSection.value.startsWith('extension:')) return ''
  const id = paneSection.value.slice('extension:'.length)
  const extension = extensions.value.find((item) => item.id === id)
  return extension ? extensionTranslation(extension, currentLanguage.value).name : ''
})
const settingsBackLabel = computed(() => {
  if (!mobileDetail.value) return t('settings.advancedSettings.console', 'Console')
  const current = sections.value.find((item) => item.key === section.value)
  const target = settingsBackTarget(section.value, current?.parent)
  if (target === 'cloud' || target === 'plugins') {
    return sections.value.find((item) => item.key === target)?.label
      || (target === 'cloud'
        ? t('settings.advancedSettings.cloudProviders', 'Cloud services')
        : t('settings.advancedSettings.plugins', 'Plugins'))
  }
  return t('settings.advancedSettings.title', 'Advanced settings')
})
const settingsHeaderTitle = computed(() =>
  mobileDetail.value ? activeTitle.value : t('settings.advancedSettings.title', 'Advanced settings'),
)
const settingsListGroups = computed(() => {
  const labels: Record<string, string> = {
    device: t('settings.advancedSettings.groups.device', 'Device'),
    network: t('settings.advancedSettings.groups.network', 'Network'),
    extensions: t('settings.advancedSettings.groups.extensions', 'Extensions'),
    admin: t('settings.advancedSettings.groups.administration', 'Administration'),
  }
  return groupSettingsSections(sections.value).map((group) => ({
    id: group.id,
    label: labels[group.id] || '',
    items: group.items.map((item) => ({
      key: item.key,
      label: item.label,
      icon: item.icon,
      iconURL: item.iconURL,
      tone: settingsGroupTone(group.id),
      loading: sidebarItemLoading(item),
    })),
  }))
})
const activeProductSection = computed(() =>
  sections.value.find((item) => item.key === paneSection.value && item.component),
)
const activeExtensionSummary = computed(() => {
  if (!paneSection.value.startsWith('extension:')) return null
  const id = paneSection.value.slice('extension:'.length)
  return extensions.value.find((extension) => extension.id === id && extension.enabled && extension.has_page) || null
})
const activeExtension = computed(() => {
  const summary = activeExtensionSummary.value
  return summary ? extensionDetails.value[summary.id] || null : null
})
const activeExtensionURL = computed(() => {
  const extension = activeExtension.value
  if (!extension?.version || !extension.page) return ''
  return extensionAssetURL(extension, extension.page.entrypoint)
})
const activeExtensionStandaloneURL = computed(() => {
  const extension = activeExtension.value
  if (!extension?.page || extension.page.renderer !== 'html') return ''
  const fileRoute = extension.routes?.find((route) => route.backend === 'file' && route.path === '')
  return fileRoute ? extensionRouteURL(extension, fileRoute) : activeExtensionURL.value
})
const deviceVariant = computed(() => machineDisplayName({
  vendor: props.status?.vendor || schema.value?.vendor,
  name: props.status?.name || schema.value?.name,
  machine: props.status?.machine || schema.value?.machine,
  variant: props.status?.variant || schema.value?.variant,
}))
const routeInterfaceNames = computed(() => {
	if (!config.value) return []
	return [
		config.value.network.device,
		...(config.value.network.interfaces || []).map(({ name }) => name),
		...(config.value.network.wireguard || []).map(({ name }) => name),
	].filter((name, index, values) => name && values.indexOf(name) === index)
})
const timezoneOptions = computed(() => {
  const currentTimezone = systemTime.value?.timezone
  const availableTimezones = currentTimezone && !timezones.includes(currentTimezone)
    ? [currentTimezone, ...timezones]
    : timezones
  return availableTimezones.map((timezone) => ({
  label: timezone.split('_').join(' '),
  value: timezone,
  }))
})

function addNTPServer() {
  if (selectedNTPServers.value.length < 8) selectedNTPServers.value.push('')
}

function removeNTPServer(index: number) {
  if (index >= 0 && index < selectedNTPServers.value.length) selectedNTPServers.value.splice(index, 1)
}

const currentDateTime = computed(() => {
  clockTick.value
  try {
    return new Intl.DateTimeFormat(currentLanguage.value.replace('_', '-'), {
      dateStyle: 'medium',
      timeStyle: 'medium',
      timeZone: selectedTimezone.value,
    }).format(new Date())
  } catch {
    return new Date().toLocaleString()
  }
})

function formatUptime(totalSeconds: number) {
  const minutes = Math.floor(Math.max(0, totalSeconds) / 60)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const remainingMinutes = minutes % 60
  const parts = []
  if (days) parts.push(`${days}${t('settings.advancedSettings.systemPage.dayShort', 'd')}`)
  if (hours || days) parts.push(`${hours}${t('settings.advancedSettings.systemPage.hourShort', 'h')}`)
  parts.push(`${remainingMinutes}${t('settings.advancedSettings.systemPage.minuteShort', 'min')}`)
  return parts.join(' ')
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '-'
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** index
  return `${value.toFixed(index === 0 || value >= 10 ? 0 : 1)} ${units[index]}`
}

function formatStorageCapacity(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '-'
  const value = bytes / 1_000_000_000
  return `${value.toFixed(value >= 100 ? 0 : 1)} GB`
}

function formatStorageBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return '-'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KiB', 'MiB', 'GiB', 'TiB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)) - 1, units.length - 1)
  const value = bytes / 1024 ** (index + 1)
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2
  return `${Number(value.toFixed(digits))} ${units[index]}`
}

function partitionUsedPercent(partition: StoragePartitionStatus) {
  if (partition.total_bytes <= 0) return 0
  return Math.min(100, Math.max(0, partition.used_bytes / partition.total_bytes * 100))
}

function formatPartitionPercent(partition: StoragePartitionStatus) {
  const percent = partitionUsedPercent(partition)
  if (percent <= 0) return '0%'
  if (percent < 1) return '<1%'
  return `${Math.round(percent)}%`
}

function partitionRoleLabel(role: StoragePartitionStatus['role']) {
  const labels: Record<StoragePartitionStatus['role'], string> = {
    boot: t('settings.advancedSettings.systemPage.partitionBoot', 'Boot'),
    boot_a: t('settings.advancedSettings.systemPage.partitionBootA', 'Boot A'),
    boot_b: t('settings.advancedSettings.systemPage.partitionBootB', 'Boot B'),
    rootfs_a: t('settings.advancedSettings.systemPage.partitionRootFSA', 'RootFS A'),
    rootfs_b: t('settings.advancedSettings.systemPage.partitionRootFSB', 'RootFS B'),
    userdata: t('settings.advancedSettings.systemPage.partitionUserData', 'User data'),
    config: t('settings.advancedSettings.systemPage.partitionConfig', 'Configuration'),
    partition: t('settings.advancedSettings.systemPage.partitionOther', 'Partition'),
  }
  return labels[role]
}

function connectionLabel(connected: boolean, available = true) {
  if (!available) return t('settings.advancedSettings.systemPage.unavailable', 'Unavailable')
  return connected
    ? t('settings.advancedSettings.systemPage.connected', 'Connected')
    : t('settings.advancedSettings.systemPage.disconnected', 'Disconnected')
}

function updateOperationLabel(operation: string) {
  if (operation === 'idle') {
    if (onlineUpdateProgress.value?.phase === 'downloading') return t('settings.advancedSettings.systemPage.updateDownloading', '正在下载升级包')
    if (onlineUpdateProgress.value?.phase === 'installing' || updateInstalling.value) return t('settings.advancedSettings.systemPage.updateInstalling', 'Installing')
    return updateFile.value
      ? t('settings.advancedSettings.systemPage.bundleReady', 'Bundle selected')
      : t('settings.advancedSettings.systemPage.updateIdle', 'Waiting for bundle')
  }
  return t('settings.advancedSettings.systemPage.updateInstalling', 'Installing')
}

function onlineUpdateLabel(update: SystemOnlineUpdate) {
  if (update.available) return t('settings.advancedSettings.systemPage.onlineAvailable', 'A new system update is available')
  if (update.reason === 'source_not_configured') return t('settings.advancedSettings.systemPage.onlineNoSource', 'No online update source is configured for this model')
  if (update.reason === 'bundle_missing') return t('settings.advancedSettings.systemPage.onlineNoBundle', 'The latest release has no compatible .fwup update bundle')
  return t('settings.advancedSettings.systemPage.onlineUpToDate', 'No newer system update is available')
}

async function loadSystemDetails() {
  if (section.value !== 'time' && section.value !== 'update') return
  systemDetailsLoading.value = true
  systemDetailsError.value = ''
  systemUpdateUnavailable.value = false
  try {
    if (section.value === 'time') {
      const value = await api.getSystemTime()
      systemTime.value = value
      selectedTimezone.value = value.timezone
      selectedNTP.value = value.ntp
      selectedNTPServers.value = [...value.ntp_servers]
      selectedDeviceLanguage.value = value.language
    } else {
      systemUpdate.value = await api.getSystemUpdate()
      void loadOnlineUpdate()
    }
  } catch (reason) {
    if (section.value === 'update' && reason instanceof APIError && reason.status === 503) {
      systemUpdate.value = null
      systemUpdateUnavailable.value = true
    } else {
      systemDetailsError.value = reason instanceof Error ? reason.message : String(reason)
    }
  } finally {
    systemDetailsLoading.value = false
  }
}

async function applySystemTime() {
  if (!selectedTimezone.value) return
  timeSaving.value = true
  try {
    systemTime.value = await api.updateSystemTime(
      selectedTimezone.value,
      selectedNTP.value,
      selectedNTPServers.value.map((server) => server.trim()).filter(Boolean),
      selectedDeviceLanguage.value,
    )
    selectedNTPServers.value = [...systemTime.value.ntp_servers]
    await setLanguage(selectedDeviceLanguage.value)
    message.success(t('settings.advancedSettings.systemPage.timeSaved', 'Region and time updated'))
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : String(reason))
  } finally {
    timeSaving.value = false
  }
}

async function syncBrowserTime() {
  browserTimeSyncing.value = true
  try {
    systemTime.value = await api.syncBrowserTime()
    selectedNTP.value = false
    message.success(t('settings.advancedSettings.systemPage.browserTimeSynced', 'Time synchronized from browser'))
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : String(reason))
  } finally {
    browserTimeSyncing.value = false
  }
}

function confirmSlotSwitch(slot: SystemUpdateSlot) {
  const bad = slot.boot_status === 'bad'
  dialog.warning({
    title: t('settings.advancedSettings.systemPage.switchSlot', 'Switch boot slot'),
    content: bad
      ? t('settings.advancedSettings.systemPage.switchBadSlotConfirm', 'This slot is marked bad. Use it for the next boot anyway?')
      : t('settings.advancedSettings.systemPage.switchSlotConfirm', 'Use this slot on the next boot?'),
    positiveText: t('settings.advancedSettings.systemPage.useNextBoot', 'Use for next boot'),
    negativeText: t('common.cancel', 'Cancel'),
    positiveButtonProps: bad ? { type: 'error' } : { type: 'primary' },
    onPositiveClick: async () => {
      slotSwitching.value = slot.name
      try {
        systemUpdate.value = await api.setSystemUpdateSlot(slot.name, bad)
        message.success(t('settings.advancedSettings.systemPage.slotSwitched', 'Next boot slot updated'))
      } catch (reason) {
        message.error(reason instanceof Error ? reason.message : String(reason))
      } finally {
        slotSwitching.value = ''
      }
    },
  })
}

function selectUpdateFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) setUpdateFile(file)
}

function setUpdateFile(file: File) {
  if (!file.name.toLowerCase().endsWith('.fwup')) {
    message.error(t('settings.advancedSettings.systemPage.invalidBundle', 'Select a .fwup update package'))
    if (updateFileInput.value) updateFileInput.value.value = ''
    return
  }
  updateFile.value = file
}

function clearUpdateFile() {
  updateFile.value = null
  if (updateFileInput.value) updateFileInput.value.value = ''
}

function dropUpdateFile(event: DragEvent) {
  updateFileDragging.value = false
  const file = event.dataTransfer?.files[0]
  if (file) setUpdateFile(file)
}

function stopUpdatePolling() {
  if (updatePollTimer !== null) window.clearTimeout(updatePollTimer)
  updatePollTimer = null
}

async function loadOnlineUpdate() {
  onlineUpdateLoading.value = true
  onlineUpdateError.value = ''
  try {
    onlineUpdate.value = await api.getSystemOnlineUpdate()
  } catch (reason) {
    onlineUpdate.value = null
    onlineUpdateError.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    onlineUpdateLoading.value = false
  }
}

function stopOnlineUpdatePolling() {
  if (onlineUpdateTimer !== null) window.clearTimeout(onlineUpdateTimer)
  onlineUpdateTimer = null
}

async function pollOnlineUpdate() {
  stopOnlineUpdatePolling()
  try {
    const progress = await api.getSystemOnlineUpdateProgress()
    onlineUpdateProgress.value = progress
    if (progress.phase === 'error') {
      updateInstalling.value = false
      onlineUpdateError.value = progress.error
      return
    }
    if (progress.phase === 'installing') {
      updatePollSawOperation = false
      updatePollIdleCount = 0
      await pollSystemUpdate()
      return
    }
  } catch (reason) {
    updateInstalling.value = false
    onlineUpdateError.value = reason instanceof Error ? reason.message : String(reason)
    return
  }
  onlineUpdateTimer = window.setTimeout(pollOnlineUpdate, 1000)
}

function confirmOnlineUpdate() {
  if (onlineUpdateLoading.value || updateInstalling.value || systemUpdate.value?.operation !== 'idle' || !onlineUpdate.value?.available) return
  dialog.warning({
    title: t('settings.advancedSettings.systemPage.installUpdate', 'Install system update'),
    content: t('settings.advancedSettings.systemPage.onlineUpdateConfirm', 'Download the signed update from the official release and install it to the inactive slot?'),
    positiveText: t('settings.advancedSettings.systemPage.install', 'Install'),
    negativeText: t('common.cancel', 'Cancel'),
    onPositiveClick: async () => {
      updateInstalling.value = true
      onlineUpdateError.value = ''
      onlineUpdateProgress.value = null
      try {
        await api.startSystemOnlineUpdate()
        updateStarted.value = true
        await pollOnlineUpdate()
      } catch (reason) {
        updateInstalling.value = false
        onlineUpdateError.value = reason instanceof Error ? reason.message : String(reason)
      }
    },
  })
}

function confirmSourceUpdate(source: SystemUpdateSource) {
  if (updateInstalling.value || systemUpdate.value?.operation !== 'idle') return
  dialog.warning({
    title: t('settings.advancedSettings.systemPage.installUpdate', '安装系统升级'),
    content: t('settings.advancedSettings.systemPage.installUpdateConfirm', '将所选来源的已签名升级包安装到非活动分区？'),
    positiveText: t('settings.advancedSettings.systemPage.install', '安装'),
    negativeText: t('common.cancel', '取消'),
    onPositiveClick: async () => {
      updateInstalling.value = true
      onlineUpdateError.value = ''
      onlineUpdateProgress.value = null
      try {
        await api.startSystemUpdateSource(source)
        updateStarted.value = true
        await pollOnlineUpdate()
      } catch (reason) {
        updateInstalling.value = false
        onlineUpdateError.value = reason instanceof Error ? reason.message : String(reason)
      }
    },
  })
}

async function pollSystemUpdate() {
  stopUpdatePolling()
  try {
    const status = await api.getSystemUpdate()
    systemUpdate.value = status
    if (status.operation !== 'idle') {
      updatePollSawOperation = true
      updatePollIdleCount = 0
    } else {
      updatePollIdleCount += 1
    }
    if ((updatePollSawOperation && status.operation === 'idle') || updatePollIdleCount >= 3) {
      updateInstalling.value = false
      if (status.last_error) message.error(status.last_error)
      else message.success(t('settings.advancedSettings.systemPage.updateComplete', 'System update installed'))
      return
    }
  } catch (reason) {
    updateInstalling.value = false
    message.error(reason instanceof Error ? reason.message : String(reason))
    return
  }
  updatePollTimer = window.setTimeout(pollSystemUpdate, 1000)
}

function confirmSystemUpdate() {
  if (!updateFile.value) return
  dialog.warning({
    title: t('settings.advancedSettings.systemPage.installUpdate', 'Install system update'),
    content: t('settings.advancedSettings.systemPage.installUpdateConfirm', 'Install the selected signed update bundle to the inactive slot?'),
    positiveText: t('settings.advancedSettings.systemPage.install', 'Install'),
    negativeText: t('common.cancel', 'Cancel'),
    onPositiveClick: async () => {
      if (!updateFile.value) return
      updateInstalling.value = true
      updatePollSawOperation = false
      updatePollIdleCount = 0
      try {
        await api.installSystemUpdate(updateFile.value)
        updateStarted.value = true
        await pollSystemUpdate()
      } catch (reason) {
        updateInstalling.value = false
        message.error(reason instanceof Error ? reason.message : String(reason))
      }
    },
  })
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [loadedConfig, loadedSchema, dnsStatus] = await Promise.all([
      api.getConfig(),
      api.getConfigSchema(),
      api.getNetworkDNS().catch(() => null),
    ])
		loadedConfig.network.dns ||= []
		automaticDNSServers.value = dnsStatus?.automatic_servers || []
		loadedConfig.network.static_routes ||= []
		loadedConfig.network.mac_address ||= ''
		loadedConfig.network.wireguard ||= []
		loadedConfig.network.interfaces ||= []
		loadedConfig.network.vpn ||= []
		loadedConfig.network.discovery_url ??= DEFAULT_DISCOVERY_URL
		loadedConfig.network.discovery_enabled ??= true
		loadedConfig.network.use_custom_discovery_url ??= usesCustomDiscoveryURL(loadedConfig.network)
		loadedConfig.keyboard ||= { layout: 'us', shortcuts: [] }
		loadedConfig.keyboard.layout ||= 'us'
    loadedConfig.keyboard.shortcuts ||= []
    loadedConfig.system ||= { language: 'en' }
    loadedConfig.system.zram_size_mb ??= 16
    loadedConfig.video.frame_detect ??= false
    loadedConfig.video.bitrate_kbps ??= 0
    loadedConfig.video.initial_qp ??= 0
    loadedConfig.video.min_qp ??= 0
    loadedConfig.video.max_qp ??= 0
    networkEditorsValid.value = true
    config.value = loadedConfig
    schema.value = loadedSchema
    savedNetworkSnapshot.value = networkConfigSnapshot(loadedConfig.network)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    loading.value = false
  }
}

async function loadExtensions() {
  extensionsLoading.value = true
  extensionError.value = ''
  try {
    updateExtensions(await api.getExtensions())
  } catch (reason) {
    extensionError.value = reason instanceof Error ? reason.message : String(reason)
    extensionsLoaded.value = true
  } finally {
    extensionsLoading.value = false
  }
}

function onExtensionsChanged() {
  void api.getExtensions().then(updateExtensions).catch((reason) => {
    extensionError.value = reason instanceof Error ? reason.message : String(reason)
  })
}

function stopPluginFrameObserver() {
  pluginFrameObserver?.disconnect()
  pluginFrameObserver = null
  pluginFrameMutationObserver?.disconnect()
  pluginFrameMutationObserver = null
  if (pluginFrameAnimationFrame !== null) window.cancelAnimationFrame(pluginFrameAnimationFrame)
  pluginFrameAnimationFrame = null
}

function pluginFrameCap() {
  return Math.max(240, Math.round(Math.min(720, window.innerHeight - 150)))
}

function applyPluginFrameTheme() {
  try {
    const frameDocument = pluginFrame.value?.contentDocument
    if (!frameDocument?.documentElement) return
    const hostRoot = document.documentElement
    const appearance = hostRoot.dataset.theme || 'dark'
    const source = getComputedStyle(hostRoot)
    const target = frameDocument.documentElement
    target.dataset.theme = appearance
    target.style.colorScheme = appearance
    for (const variable of Object.values(oneKVMThemeCSSVariables)) {
      const value = source.getPropertyValue(variable).trim()
      if (value) target.style.setProperty(variable, value)
    }
  } catch {
    // Sandboxed or cross-origin plugin frames cannot be themed from the host.
  }
}

function syncPluginFrameHeight() {
  const frame = pluginFrame.value
  const document = frame?.contentDocument
  if (!frame || !document) return
  const height = Math.max(
    document.documentElement?.scrollHeight || 0,
    document.documentElement?.offsetHeight || 0,
    document.body?.scrollHeight || 0,
    document.body?.offsetHeight || 0,
  )
  if (height > 0) pluginFrameHeight.value = Math.min(Math.ceil(height), pluginFrameCap())
}

function schedulePluginFrameHeight() {
  if (pluginFrameAnimationFrame !== null) return
  pluginFrameAnimationFrame = window.requestAnimationFrame(() => {
    pluginFrameAnimationFrame = null
    syncPluginFrameHeight()
  })
}

function observePluginFrame() {
  stopPluginFrameObserver()
  pluginFrameHeight.value = null
  try {
    const document = pluginFrame.value?.contentDocument
    if (!document) return
    pluginFrameObserver = new ResizeObserver(schedulePluginFrameHeight)
    const observeResizeTargets = () => {
      pluginFrameObserver?.disconnect()
      pluginFrameObserver?.observe(document.documentElement)
      pluginFrameObserver?.observe(document.body)
      for (const child of document.body.children) pluginFrameObserver?.observe(child)
    }
    observeResizeTargets()
    pluginFrameMutationObserver = new MutationObserver(() => {
      observeResizeTargets()
      schedulePluginFrameHeight()
    })
    pluginFrameMutationObserver.observe(document.documentElement, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    })
    applyPluginFrameTheme()
    schedulePluginFrameHeight()
    void document.fonts?.ready.then(schedulePluginFrameHeight)
  } catch {
    // Sandboxed non-same-origin pages retain the fixed-height fallback.
  }
}

function updateExtensions(value: ExtensionSummary[]) {
  const next = new Map(value.map((extension) => [extension.id, extension]))
  const details: Record<string, ExtensionStatus> = {}
  for (const [id, detail] of Object.entries(extensionDetails.value)) {
    const summary = next.get(id)
    if (summary && summary.version === detail.version) details[id] = { ...detail, ...summary }
  }
  extensionDetails.value = details
  extensions.value = value
  extensionsLoaded.value = true
}

function updateExtensionDetail(value: ExtensionStatus) {
  extensionDetails.value = { ...extensionDetails.value, [value.id]: value }
}

let extensionLoadSequence = 0
async function loadExtensionDetail(summary: ExtensionSummary | null, force = false) {
  const sequence = ++extensionLoadSequence
  extensionError.value = ''
  if (!summary) {
    extensionLoading.value = false
    return
  }
  const cached = extensionDetails.value[summary.id]
  if (!force && cached?.version === summary.version) {
    extensionLoading.value = false
    return
  }
  extensionLoading.value = true
  try {
    const detail = await api.getExtension(summary.id)
    if (sequence === extensionLoadSequence) updateExtensionDetail(detail)
  } catch (reason) {
    if (sequence === extensionLoadSequence) {
      extensionError.value = reason instanceof Error ? reason.message : String(reason)
    }
  } finally {
    if (sequence === extensionLoadSequence) extensionLoading.value = false
  }
}

function selectSidebar(item: SidebarSection) {
  const targetKey = item.key === 'cloud'
    ? cloudSettingsTarget(activeCloudProviderPage.value?.id)
    : item.key
  if (item.key === 'plugins') {
    if (paneSection.value === 'plugins') pluginsExpanded.value = !pluginsExpanded.value
    else pluginsExpanded.value = true
  }
  lastDetailSection.value = targetKey
  section.value = targetKey
  emit('navigate', routeFromSection(targetKey))
}

function selectSettingsItem(key: string) {
  const targetKey = key === 'cloud'
    ? cloudSettingsTarget(activeCloudProviderPage.value?.id)
    : key
  const item = sections.value.find((entry) => entry.key === targetKey)
  const extension = targetKey.startsWith('extension:')
    ? extensions.value.find((entry) => `extension:${entry.id}` === targetKey && entry.enabled && entry.has_page)
    : null
  if (!item && !extension) return
  if (item?.parent === 'plugins') pluginsExpanded.value = true
  lastDetailSection.value = targetKey
  section.value = targetKey
  emit('navigate', routeFromSection(targetKey))
}

function openCloudProvider(id: string) {
  selectSettingsItem(`extension:${id}`)
}

function manageCloudProvider() {
  selectSettingsItem('plugins')
}

function onSettingsBack() {
  if (!mobileSettings.value) {
    emit('close')
    return
  }
  const current = sections.value.find((item) => item.key === section.value)
  const target = settingsBackTarget(section.value, current?.parent)
  if (!target) {
    emit('close')
    return
  }
  section.value = target
  emit('navigate', routeFromSection(target))
}

function navigateFromService(route: string) {
  section.value = sectionFromRoute(route)
  emit('navigate', route)
}

async function revealActiveSidebarItem() {
  await nextTick()
  const active = sidebarNav.value?.querySelector<HTMLElement>('button.active')
  active?.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    block: 'nearest',
    inline: 'nearest',
  })
}

async function save() {
  if (!config.value) return
  saving.value = true
  try {
		const response = await api.saveConfig(config.value, props.videoSessionId)
		if (response.network_apply?.pending) {
			setNetworkApplyStatus(response.network_apply)
		} else {
			message.success(t('settings.success', 'Settings saved'))
		}
		savedNetworkSnapshot.value = networkConfigSnapshot(config.value.network)
	} catch (reason) {
		if (section.value === 'network' && !(reason instanceof APIError)) {
			const status = pendingNetworkStatus()
			setNetworkApplyStatus(status, true)
			message.warning(status.new_addresses?.length
				? t('network.confirm.connectionLost', 'The connection was interrupted. Open the device at its new address and confirm within 60 seconds; otherwise the old configuration will return automatically.')
				: t('network.confirm.connectionLostNoNewAddress', 'The connection was interrupted. Reconnect to the device and confirm within 60 seconds; otherwise the old configuration will return automatically.'))
		} else {
			message.error(reason instanceof Error ? reason.message : String(reason))
		}
  } finally {
    saving.value = false
  }
}

async function saveKeyboardShortcuts() {
  if (!config.value || !keyboardShortcutsValid.value) return
  saving.value = true
  try {
    config.value.keyboard = await api.saveKeyboardConfig(config.value.keyboard)
    message.success(t('keyboard.shortcuts.deviceSaved', 'Device shortcuts saved'))
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : String(reason))
  } finally {
    saving.value = false
  }
}

const SYSTEM_ACTION_REQUEST_GRACE_MS = 6_000
const SYSTEM_ACTION_POLL_INTERVAL_MS = 2_000

function sleep(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds))
}

type SystemActionDispatchResult =
  | { kind: 'accepted' | 'connection-lost' | 'pending' }
  | { kind: 'rejected'; error: APIError }

async function dispatchSystemAction(request: Promise<unknown>): Promise<SystemActionDispatchResult> {
  const result: Promise<SystemActionDispatchResult> = request
    .then(() => ({ kind: 'accepted' as const }))
    .catch((reason: unknown): SystemActionDispatchResult => reason instanceof APIError
      ? { kind: 'rejected', error: reason }
      : { kind: 'connection-lost' })
  return Promise.race([
    result,
    sleep(SYSTEM_ACTION_REQUEST_GRACE_MS).then<SystemActionDispatchResult>(() => ({ kind: 'pending' })),
  ])
}

function beginSystemAction(action: SystemAction) {
  systemActionRun += 1
  systemAction.value = action
  systemActionStage.value = 'submitting'
  systemActionInitialUptime.value = props.status?.uptime_seconds || 0
  systemActionInitiallyAuthenticated.value = auth.authenticated
  systemActionSawOffline.value = false
  return systemActionRun
}

function failSystemAction(token: number, reason: unknown) {
  if (token !== systemActionRun) return
  systemActionRun += 1
  systemAction.value = null
  resetting.value = false
  rebooting.value = false
  enteringRecovery.value = false
  message.error(reason instanceof Error ? reason.message : String(reason))
}

function reloadWithoutSettingsRoute() {
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
  window.location.reload()
}

function reloadCurrentPage() {
  window.location.reload()
}

async function waitForFactoryReset(token: number) {
  const deadline = Date.now() + 120_000
  systemActionStage.value = 'waiting'
  while (token === systemActionRun && Date.now() < deadline) {
    try {
      const status = await api.authStatus()
      if (!status.configured) {
        systemActionStage.value = 'complete'
        await refreshAuth()
        await sleep(700)
        if (token === systemActionRun) reloadWithoutSettingsRoute()
        return
      }
      systemActionStage.value = systemActionSawOffline.value ? 'offline' : 'waiting'
    } catch {
      systemActionSawOffline.value = true
      systemActionStage.value = 'offline'
    }
    await sleep(SYSTEM_ACTION_POLL_INTERVAL_MS)
  }
  if (token === systemActionRun) systemActionStage.value = 'timeout'
}

async function performFactoryReset() {
  if (systemAction.value) return
  resetting.value = true
  const token = beginSystemAction('factory-reset')
  const result = await dispatchSystemAction(api.factoryReset())
  if (token !== systemActionRun) return
  if (result.kind === 'rejected') {
    failSystemAction(token, result.error)
    return
  }
  await waitForFactoryReset(token)
}

async function waitForDeviceRestart(token: number) {
  const deadline = Date.now() + 180_000
  if (!systemActionSawOffline.value) systemActionStage.value = 'waiting'
  await sleep(1_000)
  while (token === systemActionRun && Date.now() < deadline) {
    if (systemActionSawOffline.value) {
      try {
        await api.authStatus()
        systemActionStage.value = 'complete'
        await sleep(900)
        if (token === systemActionRun) window.location.reload()
        return
      } catch {
        systemActionStage.value = 'offline'
        await sleep(SYSTEM_ACTION_POLL_INTERVAL_MS)
        continue
      }
    }
    try {
      const status = await api.getStatus()
      const uptimeReset = systemActionInitialUptime.value > status.uptime_seconds + 5
      if (uptimeReset) {
        systemActionStage.value = 'complete'
        await sleep(900)
        if (token === systemActionRun) window.location.reload()
        return
      }
      systemActionStage.value = 'waiting'
    } catch {
      try {
        const authStatus = await api.authStatus()
        if (systemActionInitiallyAuthenticated.value && !authStatus.authenticated) {
          systemActionStage.value = 'complete'
          await sleep(900)
          if (token === systemActionRun) window.location.reload()
          return
        }
        systemActionStage.value = 'waiting'
      } catch {
        systemActionSawOffline.value = true
        systemActionStage.value = 'offline'
      }
    }
    await sleep(SYSTEM_ACTION_POLL_INTERVAL_MS)
  }
  if (token === systemActionRun) systemActionStage.value = 'timeout'
}

async function performSystemReboot() {
  if (systemAction.value) return
  rebooting.value = true
  const token = beginSystemAction('reboot')
  const result = await dispatchSystemAction(api.rebootSystem())
  if (token !== systemActionRun) return
  if (result.kind === 'rejected') {
    failSystemAction(token, result.error)
    return
  }
  await waitForDeviceRestart(token)
}

async function waitForRecoveryDisconnect(token: number) {
  const deadline = Date.now() + 60_000
  systemActionStage.value = 'waiting'
  await sleep(1_000)
  while (token === systemActionRun && Date.now() < deadline) {
    try {
      await api.getStatus()
    } catch {
      systemActionSawOffline.value = true
      systemActionStage.value = 'complete'
      return
    }
    await sleep(SYSTEM_ACTION_POLL_INTERVAL_MS)
  }
  if (token === systemActionRun) systemActionStage.value = 'timeout'
}

async function performEnterRecovery() {
  if (systemAction.value) return
  enteringRecovery.value = true
  const token = beginSystemAction('recovery')
  const result = await dispatchSystemAction(api.enterRecovery())
  if (token !== systemActionRun) return
  if (result.kind === 'rejected') {
    failSystemAction(token, result.error)
    return
  }
  await waitForRecoveryDisconnect(token)
}

function continueWaitingForSystemAction() {
  const action = systemAction.value
  if (!action) return
  const token = ++systemActionRun
  if (action === 'factory-reset') void waitForFactoryReset(token)
  else if (action === 'reboot') void waitForDeviceRestart(token)
  else void waitForRecoveryDisconnect(token)
}

function confirmFactoryReset() {
  dialog.warning({
    title: t('settings.factoryReset.title', 'Restore factory settings'),
    content: t('settings.factoryReset.confirm', 'All OneKVM settings and the login account will be removed. Continue?'),
    positiveText: t('settings.factoryReset.action', 'Restore'),
    negativeText: t('common.cancel', 'Cancel'),
    positiveButtonProps: { type: 'error' },
    onPositiveClick: () => {
      void performFactoryReset()
    },
  })
}

function confirmSystemReboot() {
  dialog.warning({
    title: t('settings.rebootDevice.title', 'Restart device'),
    content: t('settings.rebootDevice.confirm', 'The device will restart and the current session will end. Continue?'),
    positiveText: t('settings.rebootDevice.confirmAction', 'Restart'),
    negativeText: t('common.cancel', 'Cancel'),
    positiveButtonProps: { type: 'warning' },
    onPositiveClick: () => {
      void performSystemReboot()
    },
  })
}

function confirmEnterRecovery() {
  dialog.warning({
    title: t('settings.recoveryMode.title', 'Recovery'),
    content: t('settings.recoveryMode.confirm', 'The device will restart and the current session will end. Continue?'),
    positiveText: t('settings.recoveryMode.confirmAction', 'Restart to recovery'),
    negativeText: t('common.cancel', 'Cancel'),
    positiveButtonProps: { type: 'warning' },
    onPositiveClick: () => {
      void performEnterRecovery()
    },
  })
}

function syncSettingsAppLayout(event?: MediaQueryListEvent) {
  mobileSettings.value = event?.matches ?? Boolean(settingsAppQuery?.matches)
}

onMounted(() => {
  window.addEventListener('onekvm:extensions-changed', onExtensionsChanged)
  window.addEventListener('onekvm-themechange', applyPluginFrameTheme)
  settingsAppQuery = window.matchMedia(SETTINGS_APP_QUERY)
  mobileSettings.value = settingsAppQuery.matches
  settingsAppQuery.addEventListener('change', syncSettingsAppLayout)
  void load()
  void loadExtensions()
	void refreshNetworkApplyStatus()
	clockTimer = window.setInterval(() => {
		clockTick.value = Date.now()
		if (networkApply.value?.pending &&
			(networkApplySeconds.value === 0 || Date.now() - networkApplyLastPoll >= 3_000)) {
			networkApplyLastPoll = Date.now()
			void refreshNetworkApplyStatus(networkApplySeconds.value === 0)
		}
	}, 1000)
})
onBeforeUnmount(() => {
  window.removeEventListener('onekvm:extensions-changed', onExtensionsChanged)
  window.removeEventListener('onekvm-themechange', applyPluginFrameTheme)
  settingsAppQuery?.removeEventListener('change', syncSettingsAppLayout)
  settingsAppQuery = null
  systemActionRun += 1
  stopPluginFrameObserver()
  stopUpdatePolling()
  stopOnlineUpdatePolling()
  if (clockTimer !== null) window.clearInterval(clockTimer)
})

watch([sections, section, () => auth.loading], ([available]) => {
  if (auth.loading) return
  if (isSettingsIndex(section.value)) return
  if (!extensionsLoaded.value && section.value.startsWith('extension:')) return
  if (section.value.startsWith('extension:') && activeExtensionSummary.value) return
  if (!available.some(({ key }) => key === section.value)) {
    const fallback = section.value === 'users'
      ? 'system'
      : props.route.replace(/^\/+/, '').startsWith('cloud/') ? 'cloud' : 'plugins'
    emit('navigate', fallback)
  }
})
watch(() => props.route, (route) => {
  section.value = sectionFromRoute(route)
  if (!isSettingsIndex(section.value)) lastDetailSection.value = section.value
})
watch(section, (value) => {
  if (!isSettingsIndex(value)) lastDetailSection.value = value
})
watch(activeExtensionSummary, (extension, previous) => {
  void loadExtensionDetail(extension, Boolean(extension && extension.id !== previous?.id))
}, { immediate: true })
watch(mobileSettings, (mobile) => {
  if (mobile || !isSettingsIndex(section.value)) return
  const fallback = lastDetailSection.value
  section.value = fallback
  emit('navigate', routeFromSection(fallback))
})
watch([section, visibleSections], () => {
  if (mobileSettings.value) return
  void revealActiveSidebarItem()
}, { flush: 'post', immediate: true })
watch(activeExtensionURL, () => {
  stopPluginFrameObserver()
  pluginFrameHeight.value = null
})
watch(paneSection, (value) => {
  if (value === 'time' || value === 'update') void loadSystemDetails()
  else {
    stopUpdatePolling()
    stopOnlineUpdatePolling()
  }
}, { immediate: true })
</script>

<template>
  <div class="advanced-settings-root">
  <section class="advanced-settings-page" :class="settingsPageClass">
    <header class="advanced-settings-header">
      <n-button
        quaternary
        size="small"
        class="advanced-settings-back"
        :aria-label="settingsBackLabel"
        @click="onSettingsBack"
      >
        <template #icon><ArrowLeft /></template>
        {{ settingsBackLabel }}
      </n-button>
      <img v-if="!mobileSettings" class="brand-mark" src="/brand/onekvm-app-icon.svg" alt="OneKVM" />
      <div v-if="!mobileSettings || mobileDetail" class="advanced-settings-heading">
        <strong>{{ settingsHeaderTitle }}</strong>
        <span v-if="!mobileDetail" class="advanced-settings-device">{{ deviceVariant }}</span>
      </div>
      <div class="advanced-settings-account">
        <n-dropdown trigger="click" placement="bottom-end" :options="accountOptions" @select="selectAccount">
          <n-tooltip>
            <template #trigger>
              <n-button
                quaternary
                size="small"
                class="account-button"
                :aria-label="t('settings.account.title', 'Account')"
              >
                <template #icon><CircleUserRound /></template>
                <span class="button-label account-name">{{ isCloudHosted() ? t('auth.cloudIdentity', 'Cloud account') : auth.username }}</span>
              </n-button>
            </template>
            {{ t('settings.account.title', 'Account') }}
          </n-tooltip>
        </n-dropdown>
      </div>
    </header>

    <div class="advanced-settings-layout">
      <aside class="advanced-settings-sidebar">
        <nav ref="sidebarNav">
          <button
            v-for="item in visibleSections"
            :key="item.key"
            type="button"
            :class="{
              active: settingsSidebarActive(item.key, section, activeExtensionParent),
              'group-active': settingsSidebarGroupActive(item.key, section, activeExtensionParent),
              'plugin-child': Boolean(item.parent),
            }"
            :aria-busy="sidebarItemLoading(item)"
            :aria-expanded="item.key === 'plugins' ? pluginsExpanded : undefined"
            @click="selectSidebar(item)"
          >
            <LoaderCircle v-if="sidebarItemLoading(item)" class="sidebar-loading-icon spin" :size="17" />
            <img v-else-if="item.iconURL" class="sidebar-custom-icon" :src="item.iconURL" alt="" />
            <component v-else :is="item.icon" :size="17" />
            <span>{{ item.label }}</span>
            <ChevronDown
              v-if="item.key === 'plugins'"
              class="sidebar-group-chevron"
              :class="{ collapsed: !pluginsExpanded }"
              :size="14"
            />
          </button>
        </nav>
      </aside>

      <div class="advanced-settings-panes">
        <div v-if="mobileSettings" class="advanced-settings-index-pane">
          <SettingsAppList
            :title="t('settings.advancedSettings.title', 'Advanced settings')"
            :subtitle="deviceVariant"
            :groups="settingsListGroups"
            @select="selectSettingsItem"
          />
        </div>
        <main class="advanced-settings-main">
        <Transition name="advanced-section" mode="out-in">
          <div :key="paneSection" class="advanced-settings-view">
            <header class="advanced-settings-section-header">
              <h1>{{ activeTitle }}</h1>
              <n-button
                v-if="activeExtensionStandaloneURL"
                tag="a"
                :href="activeExtensionStandaloneURL"
                target="_blank"
                rel="noopener noreferrer"
                secondary
                size="small"
              >
                <template #icon><ExternalLink /></template>
                {{ t('common.openInNewTab', 'Open in new tab') }}
              </n-button>
            </header>

            <n-alert v-if="error || extensionError || systemDetailsError" type="error" :bordered="false">{{ error || extensionError || systemDetailsError }}</n-alert>
            <n-spin class="advanced-settings-content" :show="loading || systemDetailsLoading">
              <section v-if="paneSection === 'display' && config" class="advanced-settings-section">
                <n-alert v-if="!canChangeVideo" type="info" :bordered="false">
                  {{ t('settings.advancedSettings.displaySecondary', 'Video settings are controlled by the primary WebRTC client. This client shares its stream.') }}
                </n-alert>
                <DisplaySettingsForm
                  v-model="config.video"
                  :disabled="saving || !canChangeVideo"
                  :read-only="schema?.read_only"
                  :video-codecs="schema?.video_codecs"
                  :video-bitrate-range="schema?.video_bitrate_kbps"
                />
                <footer class="advanced-settings-actions">
                  <n-button @click="load">{{ t('common.refresh', 'Reload') }}</n-button>
                  <n-button type="primary" :loading="saving" :disabled="!canChangeVideo" @click="save">
                    <template #icon><Save /></template>
                    {{ t('common.save', 'Save') }}
                  </n-button>
                </footer>
              </section>

              <section v-else-if="paneSection === 'keyboard' && config" class="advanced-settings-section">
				<div class="system-control-list keyboard-layout-setting">
					<div>
						<dt>{{ t('keyboard.layout', 'Keyboard layout') }}</dt>
						<dd>
							<n-select
								v-model:value="config.keyboard.layout"
								:options="keyboardLayoutOptions"
								:disabled="saving"
							/>
							<small>{{ t('keyboard.layoutHint', 'Select the layout configured on the remote host.') }}</small>
						</dd>
					</div>
				</div>
                <KeyboardShortcutEditor
                  v-model="config.keyboard.shortcuts"
                  :disabled="saving"
                  @validity="keyboardShortcutsValid = $event"
                />
                <footer class="advanced-settings-actions">
                  <n-button :disabled="saving" @click="load">{{ t('common.refresh', 'Reload') }}</n-button>
                  <n-button
                    type="primary"
                    :loading="saving"
                    :disabled="!keyboardShortcutsValid"
                    @click="saveKeyboardShortcuts"
                  >
                    <template #icon><Save /></template>
                    {{ t('common.save', 'Save') }}
                  </n-button>
                </footer>
              </section>

              <section v-else-if="paneSection === 'usb' && config" class="advanced-settings-section">
                <USBSettingsForm
                  v-model="config.usb"
                  v-model:audio="config.audio"
                  :gadget="status?.hid?.gadget"
                  :disabled="saving"
                  @validity="usbSettingsValid = $event"
                />
                <footer class="advanced-settings-actions">
                  <n-button :disabled="saving" @click="load">{{ t('common.refresh', 'Reload') }}</n-button>
                  <n-button type="primary" :loading="saving" :disabled="!usbSettingsValid" @click="save">
                    <template #icon><Save /></template>
                    {{ t('common.save', 'Save') }}
                  </n-button>
                </footer>
              </section>

              <section v-else-if="paneSection === 'network' && config" class="advanced-settings-section">
                <NetworkInterfaceManager
                  v-model="config.network"
                  :disabled="saving"
                  :wireguard-available="schema?.capabilities?.wireguard !== false"
                  :ip-tunnels-available="schema?.capabilities?.ip_tunnels !== false"
                  :openvpn-available="schema?.capabilities?.openvpn !== false"
                  :pppoe-available="schema?.capabilities?.pppoe !== false"
                  :pptp-available="schema?.capabilities?.pptp !== false"
                  :l2tp-available="schema?.capabilities?.l2tp !== false"
                  :wifi-available="status?.network?.wifi_available === true"
                  @validity="networkEditorsValid = $event"
                />
				<HostnameSettingsForm
				  v-model="config.network.hostname"
				  :mdns="config.network.mdns"
				  :disabled="saving"
				  @update:mdns="config.network.mdns = $event"
				/>
				<DiscoverySettingsForm
				  v-model="config.network.discovery_url"
				  :enabled="config.network.discovery_enabled"
				  :use-custom-url="config.network.use_custom_discovery_url"
				  :disabled="saving"
				  @update:enabled="config.network.discovery_enabled = $event"
				  @update:use-custom-url="config.network.use_custom_discovery_url = $event"
				/>
				<ProxySettingsForm
				  :model-value="config.network.proxy"
				  :disabled="saving"
				  @update:model-value="config.network.proxy = $event"
				/>
				<WebRtcIceSettingsForm
				  :model-value="config.network.webrtc"
				  :disabled="saving"
				  @update:model-value="config.network.webrtc = $event"
				/>
				<DNSSettingsForm
				  v-model="config.network.dns"
				  :custom-dns-enabled="usesCustomDNS(config.network)"
				  :automatic-servers="automaticDNSServers"
				  :dnssec="config.network.dnssec"
				  :disabled="saving"
				  @update:custom-dns-enabled="config.network.use_custom_dns = $event"
				  @update:dnssec="config.network.dnssec = $event"
				/>
				<ActiveRoutesPanel />
				<StaticRoutesForm
				  v-model="config.network.static_routes"
				  :interfaces="routeInterfaceNames"
				  :disabled="saving"
				/>
                <footer class="advanced-settings-actions">
                  <n-button @click="load">{{ t('common.refresh', 'Reload') }}</n-button>
                  <n-button
                    type="primary"
                    :loading="saving"
                    :disabled="!networkDirty || !networkEditorsValid || !validHostname(config.network.hostname) || !isNetworkConfigValid(config.network)"
                    @click="save"
                  >
                    <template #icon><Save /></template>
                    {{ t('settings.network.save', 'Apply') }}
                  </n-button>
                </footer>
              </section>

              <section v-else-if="paneSection === 'cloud'" class="advanced-settings-section">
                <CloudProvidersPage
                  :catalog="extensions"
                  :loading="extensionsLoading"
                  @catalog="updateExtensions"
                  @open="openCloudProvider"
                  @manage="manageCloudProvider"
                  @open-plugins="manageCloudProvider"
                />
              </section>

              <section v-else-if="paneSection === 'plugins'" class="advanced-settings-section">
                <ExtensionManager
                  :active="paneSection === 'plugins'"
                  :catalog="extensions"
                  :catalog-loading="extensionsLoading"
                  @catalog="updateExtensions"
                />
              </section>

              <section v-else-if="activeExtension" class="advanced-settings-section plugin-page-section">
                <ExtensionServiceRecovery :extension="activeExtension" @updated="updateExtensionDetail" />
                <ExtensionVuePage
                  v-if="activeExtension.page?.renderer === 'vue'"
                  :extension="activeExtension"
                  @updated="updateExtensionDetail"
                />
                <ExtensionLayoutPage
                  v-else-if="activeExtension.page?.renderer === 'layout'"
                  :extension="activeExtension"
                  @updated="updateExtensionDetail"
                />
                <iframe
                  v-else
                  ref="pluginFrame"
                  class="plugin-page-frame"
                  :src="activeExtensionURL"
                  :title="activeExtension.page?.title || activeExtension.name"
                  :style="pluginFrameHeight ? { height: `${pluginFrameHeight}px` } : undefined"
                  sandbox="allow-forms allow-scripts allow-same-origin"
                  @load="observePluginFrame"
                />
              </section>

              <section v-else-if="paneSection === 'resources'" class="advanced-settings-section">
                <ResourceMonitorPage :extensions="extensions" />
              </section>

              <section v-else-if="paneSection === 'sessions'" class="advanced-settings-section">
                <OnlineSessionsPage />
              </section>

              <section v-else-if="paneSection === 'services'" class="advanced-settings-section">
                <ServicesPage :extensions="extensions" @navigate="navigateFromService" />
              </section>

              <section v-else-if="paneSection === 'logs'" class="advanced-settings-section">
                <LogsPage />
              </section>

              <section v-else-if="paneSection === 'files' && canManageSettings" class="advanced-settings-section">
                <FileManagerPage />
              </section>

              <section v-else-if="paneSection === 'users' && canManageUsers" class="advanced-settings-section">
                <UserManagement
                  :auth="auth"
                  :current-username="auth.username"
                  layout="list"
                />
              </section>

              <section v-else-if="activeProductSection" class="advanced-settings-section">
                <component :is="activeProductSection.component" />
              </section>

              <section v-else-if="paneSection === 'system'" class="advanced-settings-section">
                <template v-if="status">
                  <header class="system-device-overview">
                    <div class="system-device-icon"><ServerCog :size="30" /></div>
                    <div class="system-device-identity">
                      <h2>{{ status.network.hostname || 'OneKVM' }}</h2>
                      <p>{{ deviceVariant }}</p>
                    </div>
                    <span class="system-online-state">
                      <span />{{ t('settings.advancedSettings.systemPage.online', 'Online') }}
                    </span>
                  </header>

                  <section class="system-settings-group">
                    <h2>{{ t('settings.advancedSettings.systemPage.deviceSpecifications', 'Device specifications') }}</h2>
                    <dl class="system-spec-cards">
                      <div>
                        <dt>
                          <Cpu :size="17" />{{ t('settings.advancedSettings.systemPage.processor', 'Processor') }}
                          <SystemSpecBadge
                            v-if="status.system?.architecture"
                            :value="status.system.architecture"
                            :label="t('settings.advancedSettings.systemPage.processorArchitecture', 'Processor architecture')"
                            :description="t('settings.advancedSettings.systemPage.processorArchitectureHint', 'The processor instruction set, such as arm64 or riscv64.')"
                          />
                        </dt>
                        <dd>{{ status.system?.processor || '-' }}<small v-if="status.system?.soc_name" class="system-spec-detail">SoC: {{ status.system.soc_name }}</small></dd>
                      </div>
                      <SystemMemorySpec
                        :physical-bytes="status.system?.memory_physical_bytes"
                        :memory-type="status.system?.memory_type"
                        :managed-bytes="status.system?.memory_total_bytes"
                        :hardware-reserved-bytes="status.system?.memory_hardware_reserved_bytes"
                        :linux-reserved-bytes="status.system?.memory_linux_reserved_bytes"
                      />
                      <div>
                        <dt>
                          <HardDrive :size="17" />{{ t('settings.advancedSettings.systemPage.storage', 'Storage') }}
                          <SystemSpecBadge
                            v-if="status.system?.storage_type"
                            :value="status.system.storage_type"
                            :label="t('settings.advancedSettings.systemPage.storageType', 'Storage type')"
                            :description="t('settings.advancedSettings.systemPage.storageTypeHint', 'The storage medium used by the system, such as an SD card or eMMC.')"
                          />
                        </dt>
                        <dd>
                          {{ formatStorageCapacity(storageCapacityBytes) }}
                        </dd>
                      </div>
                      <div>
                        <dt><Boxes :size="17" />{{ t('screen.deviceVariant', 'Device variant') }}</dt>
                        <dd>{{ deviceVariant }}</dd>
                      </div>
                    </dl>

                    <div v-if="storagePartitions.length" class="storage-layout">
                      <h3>{{ t('settings.advancedSettings.systemPage.storageLayout', 'Storage layout') }}</h3>
                      <div class="storage-partition-bar" role="img" :aria-label="t('settings.advancedSettings.systemPage.storageLayout', 'Storage layout')">
                        <n-tooltip
                          v-for="partition in storagePartitions"
                          :key="partition.device"
                          trigger="hover"
                          placement="top"
                        >
                          <template #trigger>
                            <div
                              class="storage-partition-segment"
                              :class="[`role-${partition.role}`, { highlighted: highlightedStoragePartition === partition.device }]"
                              :style="{ flexGrow: partition.total_bytes }"
                              tabindex="0"
                              :aria-label="`${partitionRoleLabel(partition.role)}: ${formatStorageBytes(partition.used_bytes)} / ${formatStorageBytes(partition.total_bytes)}`"
                              @mouseenter="highlightedStoragePartition = partition.device"
                              @mouseleave="highlightedStoragePartition = ''"
                              @focus="highlightedStoragePartition = partition.device"
                              @blur="highlightedStoragePartition = ''"
                            >
                              <span :style="{ width: `${partitionUsedPercent(partition)}%` }" />
                            </div>
                          </template>
                          <div class="storage-partition-tooltip">
                            <strong>{{ partitionRoleLabel(partition.role) }}</strong>
                            <span>{{ partition.device }}<template v-if="partition.filesystem"> · {{ partition.filesystem }}</template></span>
                            <span>
                              {{ t('settings.advancedSettings.systemPage.partitionUsed', 'Used') }}:
                              {{ formatStorageBytes(partition.used_bytes) }} / {{ formatStorageBytes(partition.total_bytes) }}
                            </span>
                          </div>
                        </n-tooltip>
                      </div>
                      <ul class="storage-partition-legend">
                        <li
                          v-for="partition in storagePartitions"
                          :key="`legend-${partition.device}`"
                          :class="[`role-${partition.role}`, { highlighted: highlightedStoragePartition === partition.device }]"
                          @mouseenter="highlightedStoragePartition = partition.device"
                          @mouseleave="highlightedStoragePartition = ''"
                        >
                          <i />
                          <div>
                            <strong>{{ partitionRoleLabel(partition.role) }}</strong>
                            <small>
                              {{ partition.device }}<template v-if="partition.filesystem"> · {{ partition.filesystem }}</template>
                              <template v-if="partition.active"> · {{ t('settings.advancedSettings.systemPage.activePartition', 'Active') }}</template>
                            </small>
                          </div>
                          <span>
                            {{ t('settings.advancedSettings.systemPage.partitionUsed', 'Used') }}
                            <strong>{{ formatStorageBytes(partition.used_bytes) }}</strong> / {{ formatStorageBytes(partition.total_bytes) }}
                            <em>{{ formatPartitionPercent(partition) }}</em>
                          </span>
                          <div
                            class="storage-partition-usage"
                            role="progressbar"
                            :aria-label="`${partitionRoleLabel(partition.role)} ${t('settings.advancedSettings.systemPage.partitionUsed', 'Used')}`"
                            :aria-valuenow="partitionUsedPercent(partition)"
                            aria-valuemin="0"
                            aria-valuemax="100"
                          >
                            <span
                              :class="{ visible: partition.used_bytes > 0 }"
                              :style="{ width: `${partitionUsedPercent(partition)}%` }"
                            />
                          </div>
                        </li>
                      </ul>
                    </div>
                  </section>

                  <section class="system-settings-group">
                    <h2>{{ t('settings.advancedSettings.systemPage.osSpecifications', 'OneKVM OS specifications') }}</h2>
                    <dl class="system-spec-list">
                      <div>
                        <dt>{{ t('settings.advancedSettings.systemPage.edition', 'Edition') }}</dt>
                        <dd>OneKVM OS</dd>
                      </div>
                      <div>
                        <dt>{{ t('settings.advancedSettings.systemPage.version', 'Version') }}</dt>
                        <dd>{{ status.version || '-' }}</dd>
                      </div>
                      <div>
                        <dt>{{ t('settings.advancedSettings.systemPage.kernelVersion', 'Linux kernel') }}</dt>
                        <dd>{{ status.system?.kernel_version || '-' }}</dd>
                      </div>
                      <div>
                        <dt>{{ t('settings.advancedSettings.systemPage.uptime', 'Uptime') }}</dt>
                        <dd>{{ formatUptime(status.uptime_seconds) }}</dd>
                      </div>
                    </dl>
                  </section>

                  <section class="system-settings-group">
                    <h2>{{ t('settings.advancedSettings.systemPage.deviceStatus', 'Device status') }}</h2>
                    <ul class="system-status-list">
                      <li>
                        <MonitorUp :size="18" />
                        <span>{{ t('settings.advancedSettings.systemPage.hdmiInput', 'HDMI input') }}</span>
                        <strong class="system-state-value" :class="{ connected: status.video.hdmi_connected }">
                          <span />{{ connectionLabel(status.video.hdmi_connected) }}
                        </strong>
                      </li>
                      <li>
                        <Keyboard :size="18" />
                        <span>{{ t('settings.advancedSettings.systemPage.hid', 'Keyboard and mouse') }}</span>
                        <strong
                          class="system-state-value"
                          :class="{ connected: status.hid.connected, unavailable: !status.hid.available }"
                        >
                          <span />{{ connectionLabel(status.hid.connected, status.hid.available) }}
                        </strong>
                      </li>
                      <li>
                        <Cable :size="18" />
                        <span>{{ t('settings.advancedSettings.systemPage.ethernet', 'Ethernet') }}</span>
                        <strong class="system-state-value" :class="{ connected: status.network.ethernet_connected }">
                          <span />{{ connectionLabel(status.network.ethernet_connected) }}
                        </strong>
                      </li>
                      <li>
                        <Wifi :size="18" />
                        <span>{{ t('settings.advancedSettings.systemPage.wifi', 'Wi-Fi') }}</span>
                        <strong
                          class="system-state-value"
                          :class="{ connected: status.network.wifi_connected, unavailable: !status.network.wifi_available }"
                        >
                          <span />{{ connectionLabel(status.network.wifi_connected, status.network.wifi_available) }}
                        </strong>
                      </li>
                    </ul>
                  </section>

                  <section class="system-settings-group system-recovery-group">
                    <h2>{{ t('settings.advancedSettings.systemPage.recovery', 'Recovery') }}</h2>
                    <div class="system-recovery-row">
                      <strong>{{ t('settings.rebootDevice.title', 'Restart device') }}</strong>
                      <n-button type="warning" secondary :loading="rebooting" :disabled="systemAction !== null" @click="confirmSystemReboot">
                        <template #icon><RefreshCw /></template>
                        {{ t('settings.rebootDevice.action', 'Restart') }}
                      </n-button>
                    </div>
                    <div class="system-recovery-row">
                      <strong>{{ t('settings.factoryReset.title', 'Restore factory settings') }}</strong>
                      <n-button type="error" secondary :loading="resetting" :disabled="systemAction !== null" @click="confirmFactoryReset">
                        <template #icon><RotateCcw /></template>
                        {{ t('settings.factoryReset.action', 'Restore') }}
                      </n-button>
                    </div>
                    <div v-if="status.machine === 'nanokvm'" class="system-recovery-row">
                      <strong>{{ t('settings.recoveryMode.title', 'Recovery') }}</strong>
                      <n-button type="warning" secondary :loading="enteringRecovery" :disabled="systemAction !== null" @click="confirmEnterRecovery">
                        <template #icon><LifeBuoy /></template>
                        {{ t('settings.recoveryMode.action', 'Enter') }}
                      </n-button>
                    </div>
                    <div class="system-recovery-row">
                      <strong>{{ t('settings.diagnostics.title', 'Download diagnostic data') }}</strong>
                      <n-button secondary :disabled="systemAction !== null" @click="diagnosticsOpen = true">
                        <template #icon><Download /></template>
                        {{ t('settings.diagnostics.action', 'Download') }}
                      </n-button>
                    </div>
                  </section>
                </template>
              </section>

              <section v-else-if="paneSection === 'time'" class="advanced-settings-section">
                <template v-if="systemTime">
                  <dl class="system-control-list">
                    <div>
                      <dt>{{ t('settings.advancedSettings.systemPage.regionFormat', 'Regional format') }}</dt>
                      <dd>
                        <n-select
                          v-model:value="selectedDeviceLanguage"
                          :options="languageOptions"
                        />
                      </dd>
                    </div>
                    <div>
                      <dt>{{ t('settings.advancedSettings.systemPage.timezone', 'Time zone') }}</dt>
                      <dd>
                        <n-select
                          v-model:value="selectedTimezone"
                          :options="timezoneOptions"
                          filterable
                          virtual-scroll
                        />
                        <TimezoneMap v-model="selectedTimezone" />
                      </dd>
                    </div>
                    <div>
                      <dt>{{ t('settings.advancedSettings.systemPage.automaticTime', 'Set time automatically') }}</dt>
                      <dd><n-switch v-model:value="selectedNTP" :disabled="!systemTime.can_ntp" /></dd>
                    </div>
                    <div>
                      <dt>{{ t('settings.advancedSettings.systemPage.ntpServers', 'Custom NTP servers') }}</dt>
                      <dd class="ntp-server-editor">
                        <div
                          v-for="(_, index) in selectedNTPServers"
                          :key="index"
                          class="ntp-server-row"
                        >
                          <n-input
                            v-model:value="selectedNTPServers[index]"
                            placeholder="time.cloudflare.com"
                            :maxlength="253"
                          />
                          <n-button
                            quaternary
                            circle
                            :aria-label="t('common.delete', 'Delete')"
                            @click="removeNTPServer(index)"
                          >
                            <template #icon><Trash2 /></template>
                          </n-button>
                        </div>
                        <n-button
                          secondary
                          :disabled="selectedNTPServers.length >= 8"
                          @click="addNTPServer"
                        >
                          <template #icon><Plus /></template>
                          {{ t('common.add', 'Add') }}
                        </n-button>
                      </dd>
                    </div>
                    <div>
                      <dt>{{ t('settings.advancedSettings.systemPage.currentTime', 'Current date and time') }}</dt>
                      <dd class="system-time-value">
                        <span>{{ currentDateTime }}</span>
                        <n-button
                          secondary
                          :loading="browserTimeSyncing"
                          :disabled="timeSaving"
                          @click="syncBrowserTime"
                        >
                          <template #icon><LaptopMinimalCheck /></template>
                          {{ t('settings.advancedSettings.systemPage.syncBrowserTime', 'Sync from browser') }}
                        </n-button>
                      </dd>
                    </div>
                  </dl>
                  <footer class="system-group-actions">
                    <n-button
                      type="primary"
                      :loading="timeSaving"
                      :disabled="browserTimeSyncing"
                      @click="applySystemTime"
                    >
                      <template #icon><Save /></template>
                      {{ t('common.apply', 'Apply') }}
                    </n-button>
                  </footer>
                </template>
              </section>

              <section v-else-if="paneSection === 'update'" class="advanced-settings-section">
                <n-alert v-if="systemUpdateUnavailable" type="info" :bordered="false">
                  {{ t('settings.advancedSettings.systemPage.updateUnavailable', 'System updates are unavailable in this boot mode. This development system has no A/B update service.') }}
                </n-alert>
                <template v-if="systemUpdate">
                  <section class="system-settings-group">
                    <h2>{{ t('settings.advancedSettings.systemPage.bootSlots', 'A/B boot slots') }}</h2>
                    <ul class="system-slot-list">
                      <li v-for="slot in systemUpdate.slots" :key="slot.name">
                        <div class="system-slot-name">
                          <strong>{{ t('settings.advancedSettings.systemPage.slot', 'Slot') }} {{ slot.bootname || slot.name }}</strong>
                          <span>{{ slot.version || slot.device }}</span>
                        </div>
                        <div class="system-slot-badges">
                          <span v-if="slot.state === 'booted'" class="system-slot-badge active">{{ t('settings.advancedSettings.systemPage.booted', 'Booted') }}</span>
                          <span v-if="slot.name === systemUpdate.primary_slot" class="system-slot-badge primary">{{ t('settings.advancedSettings.systemPage.nextBoot', 'Next boot') }}</span>
                          <span class="system-slot-badge" :class="{ bad: slot.boot_status === 'bad' }">
                            {{ slot.boot_status === 'bad' ? t('settings.advancedSettings.systemPage.bad', 'Bad') : t('settings.advancedSettings.systemPage.good', 'Good') }}
                          </span>
                        </div>
                        <n-button
                          secondary
                          :disabled="slot.name === systemUpdate.primary_slot || systemUpdate.operation !== 'idle'"
                          :loading="slotSwitching === slot.name"
                          @click="confirmSlotSwitch(slot)"
                        >
                          {{ t('settings.advancedSettings.systemPage.useNextBoot', 'Use for next boot') }}
                        </n-button>
                      </li>
                    </ul>
                  </section>

                  <section class="system-settings-group">
                    <h2>{{ t('settings.advancedSettings.systemPage.systemUpdate', 'System update') }}</h2>
                    <div class="system-update-panel">
                      <SystemUpdateSourceSelector
                        v-model="updateMethod"
                        :disabled="updateInstalling || systemUpdate.operation !== 'idle'"
                        @install="confirmSourceUpdate"
                      >
                      <template #error>
                        <n-alert v-if="onlineUpdateError" type="error" :bordered="false">{{ onlineUpdateError }}</n-alert>
                      </template>
                      <template #github>
                      <div v-if="onlineUpdateLoading || onlineUpdate" class="system-update-source-info">
                        <Download :size="20" />
                        <div>
                          <strong v-if="onlineUpdateLoading">{{ t('settings.advancedSettings.systemPage.checkingOnlineUpdate', 'Checking for updates…') }}</strong>
                          <template v-else-if="onlineUpdate">
                            <strong>{{ onlineUpdateLabel(onlineUpdate) }}</strong>
                            <span>{{ t('settings.advancedSettings.systemPage.currentVersion', '当前版本') }} {{ onlineUpdate.current_version }}<template v-if="onlineUpdate.available && onlineUpdate.latest_version"> · {{ t('settings.advancedSettings.systemPage.latestVersion', '最新版本') }} {{ onlineUpdate.latest_version }}</template></span>
                          </template>
                        </div>
                      </div>
                      <div v-else class="system-update-source-info">
                        <Download :size="20" />
                        <span>{{ t('settings.advancedSettings.systemPage.checkOnlineUpdateHint', '检查此设备可用的最新正式版本') }}</span>
                      </div>
                      <div class="system-update-actions system-online-update-actions">
                        <n-button secondary :loading="onlineUpdateLoading" :disabled="onlineUpdateLoading || updateInstalling" @click="loadOnlineUpdate">
                          {{ t('settings.advancedSettings.systemPage.checkOnlineUpdate', 'Check for updates') }}
                        </n-button>
                        <n-button v-if="onlineUpdate?.available && !onlineUpdateLoading" type="primary" :disabled="updateInstalling || systemUpdate.operation !== 'idle'" :loading="updateInstalling" @click="confirmOnlineUpdate">
                          {{ t('settings.advancedSettings.systemPage.downloadAndInstall', 'Download and install') }}
                        </n-button>
                      </div>
                      <a v-if="!onlineUpdateLoading && onlineUpdate?.repository" class="system-update-release-link" :href="onlineUpdate.repository" target="_blank" rel="noopener noreferrer">
                        {{ t('settings.advancedSettings.systemPage.releaseRepository', '查看发布仓库') }} <ExternalLink :size="13" />
                      </a>
                      </template>
                      <template #upload>
                      <div
                        class="system-update-upload"
                        :class="{ selected: updateFile, dragging: updateFileDragging }"
                        @dragenter.prevent="updateFileDragging = true"
                        @dragover.prevent="updateFileDragging = true"
                        @dragleave.self="updateFileDragging = false"
                        @drop.prevent="dropUpdateFile"
                      >
                        <input
                          ref="updateFileInput"
                          class="system-update-input"
                          type="file"
                          accept=".fwup,application/vnd.onekvm.firmware-update"
                          @change="selectUpdateFile"
                        />
                        <div class="system-update-file-icon"><FileUp :size="20" /></div>
                        <div class="system-update-file">
                          <strong>{{ updateFile?.name || t('settings.advancedSettings.systemPage.bundleFile', 'System update bundle') }}</strong>
                          <span v-if="updateFile">{{ formatBytes(updateFile.size) }}</span>
                          <span v-else>{{ t('settings.advancedSettings.systemPage.bundleFormat', 'Signed .fwup update package') }}</span>
                        </div>
                        <div class="system-update-actions">
                          <n-tooltip v-if="updateFile">
                            <template #trigger>
                              <n-button
                                quaternary
                                circle
                                :disabled="updateInstalling"
                                :aria-label="t('settings.advancedSettings.systemPage.removeBundle', 'Clear selected bundle')"
                                @click="clearUpdateFile"
                              >
                                <template #icon><Trash2 /></template>
                              </n-button>
                            </template>
                            {{ t('settings.advancedSettings.systemPage.removeBundle', 'Clear selected bundle') }}
                          </n-tooltip>
                          <n-button secondary :disabled="updateInstalling" @click="updateFileInput?.click()">
                            <template #icon><Upload /></template>
                            {{ updateFile
                              ? t('settings.advancedSettings.systemPage.replaceBundle', 'Change')
                              : t('settings.advancedSettings.systemPage.selectBundle', 'Select bundle') }}
                          </n-button>
                          <n-button
                            type="primary"
                            :loading="updateInstalling"
                            :disabled="!updateFile || systemUpdate.operation !== 'idle'"
                            @click="confirmSystemUpdate"
                          >
                            {{ t('settings.advancedSettings.systemPage.install', 'Install') }}
                          </n-button>
                        </div>
                      </div>
                      </template>
                      </SystemUpdateSourceSelector>
                    </div>
                  </section>

                  <section v-if="updateStarted || systemUpdate.operation !== 'idle'" class="system-settings-group">
                    <h2>{{ t('settings.advancedSettings.systemPage.updateStatus', '升级状态') }}</h2>
                    <div class="system-update-panel">
                      <n-progress
                        v-if="onlineUpdateProgress?.phase === 'downloading'"
                        type="line"
                        :percentage="onlineDownloadPercent"
                        :show-indicator="onlineUpdateProgress.total_bytes > 0"
                        :processing="onlineUpdateProgress.total_bytes === 0"
                      />
                      <span v-if="onlineUpdateProgress?.phase === 'downloading'" class="system-update-transfer">
                        {{ formatBytes(onlineUpdateProgress.bytes) }}<template v-if="onlineUpdateProgress.total_bytes"> / {{ formatBytes(onlineUpdateProgress.total_bytes) }}</template>
                      </span>
                      <div class="system-update-status">
                        <Download :size="19" />
                        <div>
                          <strong>{{ updateOperationLabel(systemUpdate.operation) }}</strong>
                          <span>{{ systemUpdate.compatible }}</span>
                        </div>
                        <span v-if="systemUpdate.operation !== 'idle'">{{ systemUpdate.progress.percentage }}%</span>
                      </div>
                      <n-progress
                        v-if="systemUpdate.operation !== 'idle' || updateInstalling"
                        type="line"
                        :percentage="systemUpdate.progress.percentage"
                        :show-indicator="false"
                        status="success"
                      />
                      <span v-if="systemUpdate.last_error" class="system-update-error">{{ systemUpdate.last_error }}</span>

                    </div>
                  </section>
                </template>
              </section>
            </n-spin>
          </div>
        </Transition>
      </main>
      </div>
    </div>
    <AccountDrawer v-model:show="accountOpen" />
    <DiagnosticsCollectModal v-model:show="diagnosticsOpen" />
  </section>
  <Transition name="onekvm-page-loading">
    <AdvancedSettingsLoading v-if="loading && !config" />
  </Transition>
  </div>

  <Teleport to="body">
	<Transition name="system-action-overlay">
		<div
			v-if="networkApply?.pending"
			class="system-action-modal-mask"
			role="dialog"
			aria-modal="true"
			aria-labelledby="network-apply-title"
			aria-describedby="network-apply-description"
		>
			<section class="system-action-modal-card network-apply-modal" aria-live="assertive">
				<div class="network-apply-countdown" :class="{ urgent: networkApplySeconds <= 10 }">
					<span>
						{{ networkApplySeconds }}
						<small>{{ t('common.secondsShort', 's') }}</small>
					</span>
				</div>
				<h2 id="network-apply-title">{{ t('network.confirm.title', 'Confirm Network Configuration') }}</h2>
				<p id="network-apply-description">{{ networkApplyMessage }}</p>
				<p>{{ t('network.confirm.description', 'If not confirmed, configuration will automatically rollback to previous state') }}</p>
				<p v-if="networkApplyConnectionLost" class="network-apply-warning">
					{{ networkApplyLinks.length
						? t('network.confirm.connectionLost', 'The connection was interrupted. Open the device at its new address and confirm within 60 seconds; otherwise the old configuration will return automatically.')
						: t('network.confirm.connectionLostNoNewAddress', 'The connection was interrupted. Reconnect to the device and confirm within 60 seconds; otherwise the old configuration will return automatically.') }}
				</p>
				<div v-if="networkApplyLinks.length" class="network-apply-addresses">
					<span>{{ t('network.confirm.openNewAddress', 'Open the new device address:') }}</span>
					<n-button
						v-for="link in networkApplyLinks"
						:key="link.href"
						tag="a"
						:href="link.href"
						target="_blank"
						type="primary"
						secondary
					>
						{{ link.label }}
					</n-button>
				</div>
				<p v-else-if="networkApplySeconds <= 10" class="network-apply-warning">
					{{ t('network.confirm.urgentWarning', 'Time is running out! Please confirm the configuration.') }}
				</p>
				<div class="system-action-modal-actions">
					<n-button
						type="primary"
						:loading="networkConfirming"
						:disabled="networkApply.ready === false"
						@click="confirmNetworkConfiguration"
					>
						{{ t('network.confirm.confirm', 'Confirm Configuration') }}
					</n-button>
				</div>
			</section>
		</div>
	</Transition>
  </Teleport>

  <Teleport to="body">
    <Transition name="system-action-overlay">
      <div
        v-if="systemAction"
        class="system-action-modal-mask"
        role="dialog"
        aria-modal="true"
        aria-labelledby="system-action-title"
        aria-describedby="system-action-description"
      >
        <section class="system-action-modal-card" aria-live="assertive" :aria-busy="systemActionSpinning">
          <div class="system-action-modal-icon" :class="{ complete: systemActionStage === 'complete', timeout: systemActionStage === 'timeout' }">
            <n-spin v-if="systemActionSpinning" size="large" />
            <RotateCcw v-else-if="systemAction === 'factory-reset'" :size="30" />
            <LifeBuoy v-else-if="systemAction === 'recovery'" :size="30" />
            <RefreshCw v-else :size="30" />
          </div>
          <h2 id="system-action-title">{{ systemActionTitle }}</h2>
          <p id="system-action-description">{{ systemActionDescription }}</p>
          <div v-if="systemActionStage === 'timeout' || (systemAction === 'recovery' && systemActionStage === 'complete')" class="system-action-modal-actions">
            <n-button v-if="systemActionStage === 'timeout'" secondary @click="continueWaitingForSystemAction">
              {{ t('settings.systemAction.continueWaiting', 'Continue waiting') }}
            </n-button>
            <n-button @click="reloadCurrentPage">
              {{ t('settings.systemAction.reload', 'Reload page') }}
            </n-button>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
