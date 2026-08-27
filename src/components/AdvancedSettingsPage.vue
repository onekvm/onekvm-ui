<script setup lang="ts">
import { computed, h, nextTick, onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue'
import {
  ArrowLeft,
  Activity,
  Box,
  Boxes,
  Cable,
  ChevronDown,
  CircleUserRound,
  Clock3,
  Download,
  ExternalLink,
  FileUp,
  Keyboard,
  LaptopMinimalCheck,
  LifeBuoy,
  ListRestart,
  LoaderCircle,
  LogOut,
  Cpu,
  HardDrive,
  MemoryStick,
  MonitorUp,
  Network,
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
  Volume2,
  Wifi,
  icons,
} from '@lucide/vue'
import { NIcon, useDialog, useMessage, type DropdownOption } from 'naive-ui'

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
} from '@/api/client'
import { hasPermission } from '@/build'
import { useAuth } from '@/composables/useAuth'
import { currentLanguage, languageOptions, setLanguage, t } from '@/i18n/runtime'
import { isNetworkConfigValid, validHostname } from '@/lib/network'
import { uiProduct } from '@/product'

import ExtensionLayoutPage from './ExtensionLayoutPage.vue'
import ExtensionServiceRecovery from './ExtensionServiceRecovery.vue'
import ExtensionVuePage from './ExtensionVuePage.vue'
import AccountDrawer from './AccountDrawer.vue'
import DNSSettingsForm from './DNSSettingsForm.vue'
import ActiveRoutesPanel from './ActiveRoutesPanel.vue'
import DisplaySettingsForm from './DisplaySettingsForm.vue'
import HostnameSettingsForm from './HostnameSettingsForm.vue'
import NetworkInterfaceManager from './NetworkInterfaceManager.vue'
import ExtensionManager from './ExtensionManager.vue'
import ResourceMonitorPage from './ResourceMonitorPage.vue'
import OnlineSessionsPage from './OnlineSessionsPage.vue'
import LogsPage from './LogsPage.vue'
import ServicesPage from './ServicesPage.vue'
import StaticRoutesForm from './StaticRoutesForm.vue'
import TimezoneMap from './TimezoneMap.vue'
import { timezones } from '@/lib/timezones'
import KeyboardShortcutEditor from './KeyboardShortcutEditor.vue'
import UserManagement from './UserManagement.vue'
import USBSettingsForm from './USBSettingsForm.vue'
import AudioSettingsForm from './AudioSettingsForm.vue'
import AdvancedSettingsLoading from './AdvancedSettingsLoading.vue'

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
  if (normalized.startsWith('plugins/')) {
    try {
      return `extension:${decodeURIComponent(normalized.slice('plugins/'.length))}`
    } catch {
      return 'plugins'
    }
  }
  if (uiProduct.settingsSections?.some((item) => item.key === normalized)) return normalized
  return ['display', 'network', 'keyboard', 'usb', 'audio', 'plugins', 'services', 'logs', 'resources', 'sessions', 'system', 'users', 'time', 'update'].includes(normalized) ? normalized : 'system'
}

function routeFromSection(value: Section) {
  if (value.startsWith('extension:')) return `plugins/${encodeURIComponent(value.slice('extension:'.length))}`
  return value
}

const props = defineProps<{ status: OneKVMStatus | null; route: string }>()
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
const accountOpen = ref(false)
const section = ref<Section>(sectionFromRoute(props.route))
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
const audioSettingsValid = ref(true)
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
const networkApply = ref<NetworkApplyStatus | null>(null)
const networkApplyExpiresAt = ref(0)
const networkApplyConnectionLost = ref(false)
const networkConfirming = ref(false)
const resetting = ref(false)
const rebooting = ref(false)
const enteringRecovery = ref(false)
const systemAction = ref<SystemAction | null>(null)
const systemActionStage = ref<SystemActionStage>('submitting')
const systemActionInitialUptime = ref(0)
const systemActionInitiallyAuthenticated = ref(false)
const systemActionSawOffline = ref(false)
const error = ref('')
const systemDetailsError = ref('')
const systemTime = ref<SystemTimeStatus | null>(null)
const systemUpdate = ref<SystemUpdateStatus | null>(null)
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
		? t('network.confirm.preparing', 'Preparing the new network address…')
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
		return { address, href: url.toString() }
	})
})

function pendingNetworkStatus(): NetworkApplyStatus {
	const network = config.value?.network
	const addresses: string[] = []
	const addStaticAddress = (mode: string, value: string) => {
		if (mode !== 'static' || !value) return
		const address = value.trim().split('/')[0]
		if (address && !addresses.includes(address)) addresses.push(address)
	}
	if (network) {
		addStaticAddress(network.ipv4_mode, network.ipv4_address)
		addStaticAddress(network.ipv6_mode, network.ipv6_address)
		for (const networkInterface of network.interfaces || []) {
			addStaticAddress(networkInterface.ipv4_mode, networkInterface.ipv4_address)
			addStaticAddress(networkInterface.ipv6_mode, networkInterface.ipv6_address)
		}
	}
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
const accountOptions = computed<DropdownOption[]>(() => [
  { key: 'settings', label: t('settings.account.manage', 'Account settings'), icon: dropdownIcon(CircleUserRound) },
  { key: 'logout', label: t('settings.account.logoutBtn', 'Logout'), icon: dropdownIcon(LogOut) },
])

function selectAccount(key: string | number) {
  if (key === 'settings') accountOpen.value = true
  if (key === 'logout') void logout()
}

function lucideIcon(name: string | undefined): Component {
  if (!name) return Box
  const componentName = name.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('')
  return (icons as Record<string, Component>)[componentName] || Box
}

const sections = computed<SidebarSection[]>(() => {
  const extensionPages = extensions.value
    .filter((extension) => extension.installed && extension.enabled && extension.version && extension.has_page)
    .map((extension): SidebarSection => {
      const icon = extension.icon
      return {
        key: `extension:${extension.id}`,
        label: extensionTranslation(extension, currentLanguage.value).name,
        icon: icon?.source === 'lucide' ? lucideIcon(icon.name) : Box,
        iconURL: icon?.source === 'custom' ? extensionAssetURL(extension, icon.path) : undefined,
        parent: 'plugins',
      }
    })
  return [
    { key: 'system', label: t('settings.advancedSettings.system', 'System'), icon: ServerCog },
    { key: 'display', label: t('settings.advancedSettings.display', 'Display'), icon: MonitorUp },
		{ key: 'keyboard', label: t('settings.advancedSettings.keyboard', 'Keyboard'), icon: Keyboard },
	{ key: 'usb', label: t('settings.advancedSettings.usb', 'USB'), icon: Usb },
    { key: 'audio', label: t('settings.advancedSettings.audio', 'Audio'), icon: Volume2 },
    { key: 'network', label: t('settings.advancedSettings.network', 'Network'), icon: Network },
    { key: 'plugins', label: t('settings.advancedSettings.plugins', 'Plugins'), icon: Box },
    ...extensionPages,
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
const extensionSectionActive = computed(() => section.value.startsWith('extension:'))

function sidebarItemLoading(item: SidebarSection) {
  if (item.key === 'plugins') return extensionsLoading.value
  return item.key === section.value && item.parent === 'plugins' && extensionLoading.value
}

const activeTitle = computed(() => sections.value.find((item) => item.key === section.value)?.label || '')
const activeProductSection = computed(() =>
  sections.value.find((item) => item.key === section.value && item.component),
)
const activeExtensionSummary = computed(() => {
  if (!section.value.startsWith('extension:')) return null
  const id = section.value.slice('extension:'.length)
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
const deviceVariant = computed(() => {
  const machine = props.status?.machine === 'nanokvm' ? 'NanoKVM' : props.status?.machine || '-'
  if (!props.status?.variant) return machine
  const normalized = props.status.variant.toLowerCase()
  const variant = normalized === 'pcie' ? 'PCIe' : normalized === 'cube' ? 'Cube' : props.status.variant
  return `${machine} ${variant}`
})
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
  if (bytes >= 1_000_000_000) {
    const value = bytes / 1_000_000_000
    return `${value.toFixed(value >= 10 ? 1 : 2)} GB`
  }
  if (bytes >= 1_000_000) {
    const value = bytes / 1_000_000
    return `${value.toFixed(value >= 10 ? 0 : 1)} MB`
  }
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(0)} kB`
  return `${bytes} B`
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
    return updateFile.value
      ? t('settings.advancedSettings.systemPage.bundleReady', 'Bundle selected')
      : t('settings.advancedSettings.systemPage.updateIdle', 'Waiting for bundle')
  }
  return t('settings.advancedSettings.systemPage.updateInstalling', 'Installing')
}

async function loadSystemDetails() {
  if (section.value !== 'time' && section.value !== 'update') return
  systemDetailsLoading.value = true
  systemDetailsError.value = ''
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
    }
  } catch (reason) {
    systemDetailsError.value = reason instanceof Error ? reason.message : String(reason)
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
    const [loadedConfig, loadedSchema] = await Promise.all([
      api.getConfig(),
      api.getConfigSchema(),
    ])
		loadedConfig.network.dns ||= []
		loadedConfig.network.static_routes ||= []
		loadedConfig.network.mac_address ||= ''
		loadedConfig.keyboard ||= { layout: 'us', shortcuts: [] }
		loadedConfig.keyboard.layout ||= 'us'
    loadedConfig.keyboard.shortcuts ||= []
    loadedConfig.video.frame_detect ??= false
    loadedConfig.video.bitrate_kbps ??= 0
    loadedConfig.video.initial_qp ??= 0
    loadedConfig.video.min_qp ??= 0
    loadedConfig.video.max_qp ??= 0
    networkEditorsValid.value = true
    config.value = loadedConfig
    schema.value = loadedSchema
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

function stopPluginFrameObserver() {
  pluginFrameObserver?.disconnect()
  pluginFrameObserver = null
  pluginFrameMutationObserver?.disconnect()
  pluginFrameMutationObserver = null
  if (pluginFrameAnimationFrame !== null) window.cancelAnimationFrame(pluginFrameAnimationFrame)
  pluginFrameAnimationFrame = null
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
  if (height > 0) pluginFrameHeight.value = Math.ceil(height)
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
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
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
  if (item.key === 'plugins') {
    if (section.value === 'plugins') pluginsExpanded.value = !pluginsExpanded.value
    else pluginsExpanded.value = true
  }
  section.value = item.key
  emit('navigate', routeFromSection(item.key))
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
		const response = await api.saveConfig(config.value)
		if (response.network_apply?.pending) {
			setNetworkApplyStatus(response.network_apply)
		} else {
			message.success(t('settings.success', 'Settings saved'))
		}
	} catch (reason) {
		if (section.value === 'network' && !(reason instanceof APIError)) {
			setNetworkApplyStatus(pendingNetworkStatus(), true)
			message.warning(t('network.confirm.connectionLost', 'The network connection was interrupted. Open the new address and confirm within 60 seconds; otherwise the old configuration will return automatically.'))
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

onMounted(() => {
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
  systemActionRun += 1
  stopPluginFrameObserver()
  stopUpdatePolling()
  if (clockTimer !== null) window.clearInterval(clockTimer)
})

watch([sections, section, () => auth.loading], ([available]) => {
  if (auth.loading) return
  if (!extensionsLoaded.value && section.value.startsWith('extension:')) return
  if (!available.some(({ key }) => key === section.value)) {
    emit('navigate', section.value === 'users' ? 'system' : 'plugins')
  }
})
watch(() => props.route, (route) => { section.value = sectionFromRoute(route) })
watch(activeExtensionSummary, (extension, previous) => {
  void loadExtensionDetail(extension, Boolean(extension && extension.id !== previous?.id))
}, { immediate: true })
watch([section, visibleSections], revealActiveSidebarItem, { flush: 'post', immediate: true })
watch(activeExtensionURL, () => {
  stopPluginFrameObserver()
  pluginFrameHeight.value = null
})
watch(section, (value) => {
  if (value === 'time' || value === 'update') void loadSystemDetails()
  else stopUpdatePolling()
}, { immediate: true })
</script>

<template>
  <AdvancedSettingsLoading v-if="loading && !config" />
  <section v-else class="advanced-settings-page">
    <header class="advanced-settings-header">
      <n-button quaternary size="small" class="advanced-settings-back" :aria-label="t('settings.advancedSettings.back', 'Back')" @click="emit('close')">
        <template #icon><ArrowLeft /></template>
        {{ t('settings.advancedSettings.console', 'Console') }}
      </n-button>
      <img class="brand-mark" src="/brand/onekvm-app-icon.svg" alt="OneKVM" />
      <div class="advanced-settings-heading">
        <strong>{{ t('settings.advancedSettings.title', 'Advanced settings') }}</strong>
        <span class="advanced-settings-device">{{ deviceVariant }}</span>
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
                <span class="button-label account-name">{{ auth.username }}</span>
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
              active: section === item.key,
              'group-active': item.key === 'plugins' && extensionSectionActive,
              'plugin-child': item.parent === 'plugins',
            }"
            :aria-busy="sidebarItemLoading(item)"
            :aria-expanded="item.key === 'plugins' ? pluginsExpanded : undefined"
            @click="selectSidebar(item)"
          >
            <LoaderCircle v-if="sidebarItemLoading(item)" class="sidebar-loading-icon spin" :size="17" />
            <img v-else-if="item.iconURL" class="sidebar-custom-icon" :src="item.iconURL" alt="" />
            <component v-else :is="item.icon" :size="17" />
            <span>{{ item.label }}</span>
            <ChevronDown v-if="item.key === 'plugins'" class="sidebar-group-chevron" :class="{ collapsed: !pluginsExpanded }" :size="14" />
          </button>
        </nav>
      </aside>

      <main class="advanced-settings-main">
        <Transition name="advanced-section" mode="out-in">
          <div :key="section" class="advanced-settings-view">
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
              <section v-if="section === 'display' && config" class="advanced-settings-section">
                <DisplaySettingsForm
                  v-model="config.video"
                  :disabled="saving"
                  :read-only="schema?.read_only"
                  :video-codecs="schema?.video_codecs"
                  :video-bitrate-range="schema?.video_bitrate_kbps"
                />
                <footer class="advanced-settings-actions">
                  <n-button @click="load">{{ t('common.refresh', 'Reload') }}</n-button>
                  <n-button type="primary" :loading="saving" @click="save">
                    <template #icon><Save /></template>
                    {{ t('common.save', 'Save') }}
                  </n-button>
                </footer>
              </section>

              <section v-else-if="section === 'keyboard' && config" class="advanced-settings-section">
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

              <section v-else-if="section === 'usb' && config" class="advanced-settings-section">
                <USBSettingsForm v-model="config.usb" :disabled="saving" @validity="usbSettingsValid = $event" />
                <footer class="advanced-settings-actions">
                  <n-button :disabled="saving" @click="load">{{ t('common.refresh', 'Reload') }}</n-button>
                  <n-button type="primary" :loading="saving" :disabled="!usbSettingsValid" @click="save">
                    <template #icon><Save /></template>
                    {{ t('common.save', 'Save') }}
                  </n-button>
                </footer>
              </section>

              <section v-else-if="section === 'audio' && config" class="advanced-settings-section">
                <AudioSettingsForm v-model="config.audio" :disabled="saving" @validity="audioSettingsValid = $event" />
                <footer class="advanced-settings-actions">
                  <n-button :disabled="saving" @click="load">{{ t('common.refresh', 'Reload') }}</n-button>
                  <n-button type="primary" :loading="saving" :disabled="!audioSettingsValid" @click="save">
                    <template #icon><Save /></template>
                    {{ t('common.save', 'Save') }}
                  </n-button>
                </footer>
              </section>

              <section v-else-if="section === 'network' && config" class="advanced-settings-section">
                <NetworkInterfaceManager v-model="config.network" :disabled="saving" @validity="networkEditorsValid = $event" />
				<HostnameSettingsForm v-model="config.network.hostname" :disabled="saving" />
				<DNSSettingsForm v-model="config.network.dns" :disabled="saving" />
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
                    :disabled="!networkEditorsValid || !validHostname(config.network.hostname) || !isNetworkConfigValid(config.network)"
                    @click="save"
                  >
                    <template #icon><Save /></template>
                    {{ t('settings.network.save', 'Apply') }}
                  </n-button>
                </footer>
              </section>

              <section v-else-if="section === 'plugins'" class="advanced-settings-section">
                <ExtensionManager
                  :active="section === 'plugins'"
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
                  scrolling="no"
                  @load="observePluginFrame"
                />
              </section>

              <section v-else-if="section === 'resources'" class="advanced-settings-section">
                <ResourceMonitorPage :extensions="extensions" />
              </section>

              <section v-else-if="section === 'sessions'" class="advanced-settings-section">
                <OnlineSessionsPage />
              </section>

              <section v-else-if="section === 'services'" class="advanced-settings-section">
                <ServicesPage :extensions="extensions" @navigate="navigateFromService" />
              </section>

              <section v-else-if="section === 'logs'" class="advanced-settings-section">
                <LogsPage />
              </section>

              <section v-else-if="section === 'users' && canManageUsers" class="advanced-settings-section">
                <UserManagement
                  :auth="auth"
                  :current-username="auth.username"
                  layout="list"
                />
              </section>

              <section v-else-if="activeProductSection" class="advanced-settings-section">
                <component :is="activeProductSection.component" />
              </section>

              <section v-else-if="section === 'system'" class="advanced-settings-section">
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
                        <dt><Cpu :size="17" />{{ t('settings.advancedSettings.systemPage.processor', 'Processor') }}</dt>
                        <dd>{{ status.system?.processor || '-' }}</dd>
                      </div>
                      <div>
                        <dt><MemoryStick :size="17" />{{ t('settings.advancedSettings.systemPage.installedMemory', 'Installed memory') }}</dt>
                        <dd>{{ formatBytes(status.system?.memory_total_bytes || 0) }}</dd>
                      </div>
                      <div>
                        <dt><HardDrive :size="17" />{{ t('settings.advancedSettings.systemPage.storage', 'Storage') }}</dt>
                        <dd>
                          {{ formatStorageCapacity(storageCapacityBytes) }}<template v-if="status.system?.storage_type"> ({{ status.system.storage_type }})</template>
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
                        <span>{{ t('settings.advancedSettings.systemPage.hid', 'Keyboard and pointer') }}</span>
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
                  </section>
                </template>
              </section>

              <section v-else-if="section === 'time'" class="advanced-settings-section">
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

              <section v-else-if="section === 'update'" class="advanced-settings-section">
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
                    </div>
                  </section>
                </template>
              </section>
            </n-spin>
          </div>
        </Transition>
      </main>
    </div>
    <AccountDrawer v-model:show="accountOpen" />
  </section>

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
					{{ t('network.confirm.connectionLost', 'The connection was interrupted. Open the device at its new address to confirm the configuration.') }}
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
						{{ link.address }}
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
