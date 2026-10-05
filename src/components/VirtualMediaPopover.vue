<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { ArrowLeft, Check, CircleCheck, CirclePlus, ClipboardPaste, Copy, Database, Disc3, Download, File, Folder, FolderOpen, FolderPlus, HardDrive, House, Info, Laptop, LayoutGrid, LoaderCircle, Pencil, Plug, Scissors, Server, Smartphone, Trash2, Unplug, Upload, X } from '@lucide/vue'
import { useDialog, useMessage } from 'naive-ui'

import { api, APIError, type MSDFileEntry, type MSDMedia, type MSDStatus } from '@/api/client'
import { useUploadProgress } from '@/composables/useUploadProgress'
import { useOverlayMount } from '@/composables/useOverlayMount'
import { t } from '@/i18n/runtime'
import { BrowserISO, type BrowserISOProgress } from '@/lib/browser-iso'
import { nextUploadSpeed, uploadPercentage, uploadRemainingSeconds } from '@/lib/upload-speed'

import XpTransferDialog from './XpTransferDialog.vue'

defineProps<{
  placement?: 'top-end' | 'bottom-end' | 'right-start' | 'left-start'
  sheet?: boolean
}>()

const emit = defineEmits<{
  status: [status: MSDStatus]
  'update:show': [show: boolean]
  'upload-state': [state: {
    minimized: boolean
    uploading: boolean
    name: string
    progress: number
    transferred: number
    total: number
    speed: number
    remainingSeconds: number
    title: string
  }]
}>()

type DriveClipboard = {
  driveID: string
  operation: 'copy' | 'move'
  path: string
  name: string
  directory: boolean
}

function clearLegacyUploadResume() {
  try {
    const keys: string[] = []
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (key?.startsWith('onekvm-msd-upload:')) keys.push(key)
    }
    for (const key of keys) localStorage.removeItem(key)
  } catch {
    // Private mode can reject storage access. The upload no longer reads it.
  }
}

const message = useMessage()
const dialog = useDialog()
const overlayTo = useOverlayMount()
const loading = ref(false)
const connecting = ref(false)
const disconnecting = ref(false)
const mtpBusy = ref(false)
const status = ref<MSDStatus | null>(null)
const media = ref<MSDMedia[]>([])
type MediaTab = 'iso' | 'drive' | 'mtp'
type IsoSource = 'local' | 'device'
const tab = ref<MediaTab>('iso')
const feature = ref<MediaTab | null>(null)
type FeatureNavDirection = 'forward' | 'back'
const featureNavDirection = ref<FeatureNavDirection>('forward')
const featureNavAnimated = ref(false)
const featureNavName = computed(() => featureNavDirection.value === 'back'
  ? 'virtual-media-back'
  : 'virtual-media-forward')
const isoSource = ref<IsoSource>('local')
const driveCreateOpen = ref(false)
const folderCreateOpen = ref(false)
const popoverOpen = ref(false)
let uploadSampleAt = 0
let uploadSampleBytes = 0
const uploadRequestControllers = new Set<AbortController>()
const uploadProgress = ref(0)
const uploadTransferred = ref(0)
const uploadSpeed = ref(0)
const uploading = ref(false)
const uploadStopRequested = ref(false)
const uploadKind = ref<'iso' | 'drive'>('iso')
const uploadDialogOpen = ref(false)
const uploadWindow = ref<InstanceType<typeof XpTransferDialog> | null>(null)
const uploadPosition = ref<{ x: number; y: number } | null>(null)
const uploadFileName = ref('')
const uploadFileSize = ref(0)
const driveName = ref('OneKVM Disk')
const driveSize = ref<number | null>(1024)
const driveSizeUnit = ref<'MiB' | 'GiB'>('MiB')
const driveFilesystem = ref('exfat')
const creatingDrive = ref(false)
const browsingDrive = ref<MSDMedia | null>(null)
const currentPath = ref('')
const files = ref<MSDFileEntry[]>([])
const fileLoading = ref(false)
const newFolderName = ref('')
const browserISO = shallowRef<BrowserISO | null>(null)
const browserMounting = ref(false)
const mountingID = ref<string | null>(null)
const deletingID = ref<string | null>(null)
const browserProgress = ref<BrowserISOProgress | null>(null)
const renamingPath = ref('')
const renameValue = ref('')
const fileDeletePopoverPath = ref('')
const driveClipboard = ref<DriveClipboard | null>(null)
const draggedEntry = ref<DriveClipboard | null>(null)
const dragTargetPath = ref<string | null>(null)
const fileTransferDialogOpen = ref(false)
const fileTransferOperation = ref<'copy' | 'move'>('copy')
const fileTransferName = ref('')
const fileTransferCurrent = ref('')
const fileTransferTransferred = ref(0)
const fileTransferTotal = ref(0)
const fileTransferDone = ref(false)
const fileTransferError = ref('')
const fileTransferActive = ref(false)
const fileTransferSpeed = ref(0)
let fileTransferSampleAt = 0
let fileTransferSampleBytes = 0
let fileTransferController: AbortController | null = null
let fileTransferCloseTimer: number | null = null
const driveUpload = useUploadProgress()
let uploadDragOffset = { x: 0, y: 0 }
let uploadDragging = false

const storageAvailable = computed(() => Boolean(status.value?.available))
const mtpAvailable = computed(() => Boolean(status.value?.mtp_available))
const mediaOpen = computed(() => storageAvailable.value || mtpAvailable.value)
const isoMedia = computed(() => media.value.filter((item) => item.kind === 'iso'))
const driveMedia = computed(() => media.value.filter((item) => item.kind === 'drive'))
const driveSizeUnitOptions = [
  { label: 'MiB', value: 'MiB' },
  { label: 'GiB', value: 'GiB' }
] as const
const driveSizeDivisor = computed(() => driveSizeUnit.value === 'GiB' ? 1024 : 1)
const driveFormatCatalog = computed(() => [
  { label: t('virtualMedia.formatFat32', 'FAT32'), value: 'fat32', hint: t('virtualMedia.formatFat32Hint', 'Works with the most operating systems. Individual files cannot exceed 4 GiB.') },
  { label: t('virtualMedia.formatExfat', 'exFAT'), value: 'exfat', hint: t('virtualMedia.formatExfatHint', 'Best for large files. The controlled system must support exFAT.') },
  { label: t('virtualMedia.formatNtfs', 'NTFS'), value: 'ntfs', hint: t('virtualMedia.formatNtfsHint', 'Best for Windows. Supports large files.') },
  { label: t('virtualMedia.formatExt4', 'EXT4'), value: 'ext4', hint: t('virtualMedia.formatExt4Hint', 'Best for Linux. The controlled system must support EXT4.') },
  { label: t('virtualMedia.formatXfs', 'XFS'), value: 'xfs', hint: t('virtualMedia.formatXfsHint', 'Linux XFS. Suited for large disks and files.') },
])
const driveFormatOptions = computed(() => {
  const available = status.value?.drive_filesystems
  const options = driveFormatCatalog.value.map(({ label, value }) => ({ label, value }))
  if (!available?.length) return options.filter((option) => option.value === 'fat32' || option.value === 'exfat')
  return options.filter((option) => available.includes(option.value))
})
const driveFormatHint = computed(() =>
  driveFormatCatalog.value.find((option) => option.value === driveFilesystem.value)?.hint
  || t('virtualMedia.formatExfatHint', 'Best for large files. The controlled system must support exFAT.'))
watch(driveFormatOptions, (options) => {
  if (!options.some((option) => option.value === driveFilesystem.value) && options[0]) {
    driveFilesystem.value = options[0].value
  }
})
const minimumDriveSize = computed(() => (status.value?.minimum_drive_mib || 64) / driveSizeDivisor.value)
const maximumDriveSize = computed(() => status.value?.maximum_drive_mib
  ? status.value.maximum_drive_mib / driveSizeDivisor.value
  : undefined)
const breadcrumbs = computed(() => currentPath.value ? currentPath.value.split('/') : [])
const logicalPath = computed(() => currentPath.value ? `/${currentPath.value}` : '/')
const fileTransferPercentage = computed(() => fileTransferTotal.value > 0
  ? Math.min(100, Math.round(fileTransferTransferred.value * 1000 / fileTransferTotal.value) / 10)
  : (fileTransferDone.value ? 100 : 0))
const folderNameValid = computed(() => {
  const name = newFolderName.value.trim()
  return Boolean(name && name !== '.' && name !== '..' && !name.includes('/') && !name.includes('\\'))
})
const mountBlocked = computed(() => uploading.value || Boolean(status.value?.iso_uploading))
const hostConnected = computed(() => Boolean(status.value?.connected))
const hostMountBlocked = computed(() => mountBlocked.value || !hostConnected.value)
const uploadWindowStyle = computed(() => uploadPosition.value
  ? { position: 'fixed' as const, left: `${uploadPosition.value.x}px`, top: `${uploadPosition.value.y}px` }
  : undefined)
const activeConnection = computed(() => {
  if (tab.value === 'mtp') {
    return Boolean(status.value?.mtp)
  }
  return hostConnected.value
})
const activeConnectionLabel = computed(() => activeConnection.value
  ? t('virtualMedia.connected', 'Connected')
  : t('virtualMedia.disconnected', 'Disconnected'))
const isoUploadRemainingSeconds = computed(() => uploadRemainingSeconds(
  uploadFileSize.value,
  uploadTransferred.value,
  uploadSpeed.value,
  uploading.value,
))

function formatUploadRemaining(seconds: number) {
  if (seconds <= 0) return t('virtualMedia.remainingCalculating', 'Calculating time remaining…')
  if (seconds < 60) return t('virtualMedia.remainingLessThanMinute', 'Less than 1 minute remaining')
  return t('virtualMedia.remainingMinutes', '{count} minutes remaining')
    .replace('{count}', String(Math.ceil(seconds / 60)))
}

const uploadRemainingLabel = computed(() => formatUploadRemaining(isoUploadRemainingSeconds.value))
const driveUploadStatus = computed(() => t('virtualMedia.uploadingFile', 'Uploading {name}…')
  .replace('{name}', driveUpload.name.value))
const driveUploadRemainingLabel = computed(() => driveUpload.uploading.value
  ? formatUploadRemaining(driveUpload.remainingSeconds.value)
  : '')
const uploadStatusLabel = computed(() => t('virtualMedia.uploadingFile', 'Uploading {name}…')
  .replace('{name}', uploadFileName.value))
const uploadProgressTitle = computed(() => uploadKind.value === 'drive'
  ? t('virtualMedia.driveUploadTitle', 'Disk upload')
  : t('virtualMedia.uploadProgressTitle', 'ISO upload'))

watch(
  [uploadDialogOpen, uploading, uploadProgress, uploadTransferred, uploadSpeed, uploadFileName, uploadFileSize, uploadProgressTitle],
  () => emit('upload-state', {
    minimized: uploading.value && !uploadDialogOpen.value,
    uploading: uploading.value,
    name: uploadFileName.value,
    progress: uploadProgress.value,
    transferred: uploadTransferred.value,
    total: uploadFileSize.value,
    speed: uploadSpeed.value,
    remainingSeconds: isoUploadRemainingSeconds.value,
    title: uploadProgressTitle.value,
  }),
  { immediate: true },
)

const isoSourceLocked = computed<IsoSource | null>(() => {
  if (status.value?.iso_mounted === 'browser') return 'local'
  if (status.value?.iso_mounted) return 'device'
  return null
})
const featureTitle = computed(() => {
  if (feature.value === 'iso') return t('virtualMedia.isoTab', 'Image mount')
  if (feature.value === 'drive') return t('virtualMedia.driveTab', 'Virtual disk')
  if (feature.value === 'mtp') return t('virtualMedia.mtpTab', 'File transfer')
  return t('virtualMedia.title', 'Virtual Media')
})
const featureIcon = computed(() => {
  if (feature.value === 'iso') return Disc3
  if (feature.value === 'drive') return HardDrive
  if (feature.value === 'mtp') return Smartphone
  return LayoutGrid
})

watch(isoSourceLocked, (locked) => {
  if (locked) isoSource.value = locked
})

watch([storageAvailable, mtpAvailable], () => {
  if (tab.value !== 'mtp' && !storageAvailable.value && mtpAvailable.value) tab.value = 'mtp'
  if (tab.value === 'mtp' && !mtpAvailable.value && storageAvailable.value) tab.value = 'iso'
  if (feature.value === 'mtp' && !mtpAvailable.value) feature.value = null
  if ((feature.value === 'iso' || feature.value === 'drive') && !storageAvailable.value) feature.value = null
})

function closeDrive() {
  browsingDrive.value = null
  currentPath.value = ''
  files.value = []
  folderCreateOpen.value = false
  fileDeletePopoverPath.value = ''
  renamingPath.value = ''
  renameValue.value = ''
}

function navigateFeature(next: MediaTab | null, direction: FeatureNavDirection) {
  featureNavAnimated.value = true
  featureNavDirection.value = direction
  if (next !== 'drive') closeDrive()
  if (next) tab.value = next
  feature.value = next
}

function openFeature(name: MediaTab) {
  navigateFeature(name, 'forward')
}

function backToHome() {
  navigateFeature(null, 'back')
}

function featureFromStatus(): MediaTab | null {
  if (status.value?.iso_mounted && storageAvailable.value) return 'iso'
  if (status.value?.drive_mounted && storageAvailable.value) return 'drive'
  if (status.value?.mtp && mtpAvailable.value) return 'mtp'
  return null
}

function resetFeatureView() {
  featureNavAnimated.value = false
  feature.value = null
  browsingDrive.value = null
  driveCreateOpen.value = false
  folderCreateOpen.value = false
  fileDeletePopoverPath.value = ''
}

function openCreateDrive() {
  closeDrive()
  driveCreateOpen.value = true
}

function updateShow(show: boolean) {
  if (!show) {
    driveCreateOpen.value = false
    folderCreateOpen.value = false
    fileDeletePopoverPath.value = ''
  }
  popoverOpen.value = show
  emit('update:show', show)
  featureNavAnimated.value = false
  if (!show) return
  browserISO.value?.requestStatus()
  void refresh().then(() => {
    if (!feature.value) feature.value = featureFromStatus()
    if (status.value?.iso_mounted === 'browser') isoSource.value = 'local'
    else if (status.value?.iso_mounted) isoSource.value = 'device'
  })
}

function clampUploadPosition() {
  const windowElement = uploadWindow.value?.windowElement
  if (!windowElement || !uploadPosition.value) return
  const rect = windowElement.getBoundingClientRect()
  uploadPosition.value = {
    x: Math.max(8, Math.min(window.innerWidth - rect.width - 8, uploadPosition.value.x)),
    y: Math.max(8, Math.min(window.innerHeight - rect.height - 8, uploadPosition.value.y)),
  }
}

function startUploadDrag(event: PointerEvent) {
  const windowElement = uploadWindow.value?.windowElement
  if (event.button !== 0 || !windowElement || (event.target as Element).closest('button')) return
  const rect = windowElement.getBoundingClientRect()
  uploadPosition.value = { x: rect.left, y: rect.top }
  uploadDragOffset = { x: event.clientX - rect.left, y: event.clientY - rect.top }
  uploadDragging = true
  window.addEventListener('pointermove', dragUploadWindow)
  window.addEventListener('pointerup', stopUploadDrag, { once: true })
  event.preventDefault()
}

function dragUploadWindow(event: PointerEvent) {
  if (!uploadDragging) return
  uploadPosition.value = {
    x: event.clientX - uploadDragOffset.x,
    y: event.clientY - uploadDragOffset.y,
  }
  clampUploadPosition()
}

function stopUploadDrag() {
  uploadDragging = false
  window.removeEventListener('pointermove', dragUploadWindow)
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)))
  return `${(value / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`
}

function driveFilesystemLabel(item: MSDMedia) {
  if (item.imported && !item.filesystem) return ''
  switch (item.filesystem) {
    case 'fat32': return t('virtualMedia.formatFat32', 'FAT32')
    case 'ntfs': return t('virtualMedia.formatNtfs', 'NTFS')
    case 'ext4': return t('virtualMedia.formatExt4', 'EXT4')
    case 'xfs': return t('virtualMedia.formatXfs', 'XFS')
    case 'exfat':
    case undefined:
      return t('virtualMedia.formatExfat', 'exFAT')
    default: return item.filesystem
  }
}

function resetUploadTelemetry(transferred: number, size: number) {
  uploadTransferred.value = transferred
  uploadProgress.value = uploadPercentage(transferred, size)
  uploadSpeed.value = 0
  uploadSampleAt = performance.now()
  uploadSampleBytes = transferred
}

function updateUploadTelemetry(transferred: number, size: number) {
  uploadTransferred.value = transferred
  uploadProgress.value = uploadPercentage(transferred, size)
  const now = performance.now()
  const sampled = nextUploadSpeed(uploadSpeed.value, transferred, uploadSampleBytes, now - uploadSampleAt)
  if (sampled === null) return
  uploadSpeed.value = sampled
  uploadSampleAt = now
  uploadSampleBytes = transferred
}

function abortActiveUploadRequests() {
  for (const controller of uploadRequestControllers) controller.abort()
}

async function validISOFile(file: File) {
  if (!file.name.toLowerCase().endsWith('.iso') || file.size < 17 * 2048 || file.size % 2048 !== 0) return false
  try {
    const descriptor = new Uint8Array(await file.slice(16 * 2048, 17 * 2048).arrayBuffer())
    return descriptor.length === 2048 && new TextDecoder('ascii').decode(descriptor.subarray(1, 6)) === 'CD001'
  } catch {
    return false
  }
}

function validDriveImage(file: File) {
  const name = file.name.toLowerCase()
  return (name.endsWith('.img') || name.endsWith('.raw') || name.endsWith('.bin'))
    && file.size >= 1024 * 1024
    && file.size % 512 === 0
}

async function refresh() {
  loading.value = true
  try {
    const nextStatus = await api.getMSDStatus()
    status.value = nextStatus
    emit('status', nextStatus)
    if (!nextStatus.available) {
      media.value = []
      browsingDrive.value = null
      currentPath.value = ''
      files.value = []
      return
    }
    const nextMedia = await api.getMSDMedia()
    media.value = Array.isArray(nextMedia) ? nextMedia : []
    if (browsingDrive.value) {
      browsingDrive.value = nextMedia.find((item) => item.id === browsingDrive.value?.id) || null
      if (browsingDrive.value && !browsingDrive.value.mounted) await refreshFiles()
    }
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  } finally {
    loading.value = false
  }
}

async function setMTP(enabled: boolean) {
  if (mtpBusy.value) return
  mtpBusy.value = true
  try {
    const nextStatus = enabled ? await api.connectMSDMTP() : await api.disconnectMSDMTP()
    status.value = nextStatus
    emit('status', nextStatus)
    message.success(enabled
      ? t('virtualMedia.mtpEnabled', 'The virtual-media folder is now shared with the controlled device')
      : t('virtualMedia.mtpDisabled', 'File transfer stopped'))
  } catch (error) {
    message.error(`${t('virtualMedia.mtpFailed', 'File transfer failed')}: ${error instanceof Error ? error.message : String(error)}`)
    await refresh()
  } finally {
    mtpBusy.value = false
  }
}

async function connectVirtualMedia() {
  if (connecting.value || disconnecting.value) return
  connecting.value = true
  try {
    const nextStatus = await api.connectMSD()
    status.value = nextStatus
    emit('status', nextStatus)
    message.success(t('virtualMedia.connectSuccess', 'Virtual media connected'))
    await refresh()
  } catch (error) {
    message.error(`${t('virtualMedia.connectionFailed', 'Connection failed:')} ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    connecting.value = false
  }
}

async function disconnectVirtualMedia() {
  if (connecting.value || disconnecting.value) return
  disconnecting.value = true
  try {
    const nextStatus = await api.disconnectMSD()
    browserISO.value?.destroy()
    browserISO.value = null
    browserProgress.value = null
    status.value = nextStatus
    emit('status', nextStatus)
    message.success(t('virtualMedia.disconnectSuccess', 'Virtual media disconnected'))
    await refresh()
  } catch (error) {
    message.error(`${t('virtualMedia.disconnectFailed', 'Disconnect failed:')} ${error instanceof Error ? error.message : String(error)}`)
    await refresh()
  } finally {
    disconnecting.value = false
  }
}

async function mount(item: MSDMedia) {
  if (!hostConnected.value) {
    message.warning(t('virtualMedia.pleaseConnect', 'Connect virtual media before exposing it to the host.'))
    return
  }
  if (mountBlocked.value) {
    message.warning(t('virtualMedia.mountBlockedByUpload', 'Mounting is unavailable while an ISO is uploading.'))
    return
  }
  if (mountingID.value || browserMounting.value) return
  mountingID.value = item.id
  try {
    await api.mountMSDMedia(item.id)
    message.success(t('virtualMedia.mountSuccess', 'Media mounted'))
    await refresh()
  } catch (error) {
    message.error(`${t('virtualMedia.mountFailed', 'Mount failed')}: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    if (mountingID.value === item.id) mountingID.value = null
  }
}

async function eject(kind: 'iso' | 'drive') {
  const browserSession = kind === 'iso' ? browserISO.value : null
  try {
    if (browserSession) {
      await browserSession.eject()
    } else {
      await api.ejectMSD(kind)
    }
    message.success(t('virtualMedia.ejectSuccess', 'Media ejected'))
  } catch (error) {
    message.error(`${t('virtualMedia.unmountFailed', 'Eject failed')}: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    if (browserSession && browserISO.value === browserSession) {
      browserISO.value = null
      browserProgress.value = null
    }
    await refresh()
  }
}

async function mountBrowserISO(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || browserISO.value || browserMounting.value || mountingID.value) return
  if (!hostConnected.value) {
    message.warning(t('virtualMedia.pleaseConnect', 'Connect virtual media before exposing it to the host.'))
    return
  }
  if (mountBlocked.value) {
    message.warning(t('virtualMedia.mountBlockedByUpload', 'Mounting is unavailable while an ISO is uploading.'))
    return
  }
  browserMounting.value = true
  try {
    if (!await validISOFile(file)) {
      message.error(t('virtualMedia.invalidISO', 'The selected file is not a valid ISO image.'))
      return
    }
    const session = new BrowserISO(api.getMSDWebSocketURL(), {
      progress: (progress) => { browserProgress.value = progress },
      disconnected: (detail) => {
        if (browserISO.value === session) {
          browserISO.value = null
          browserProgress.value = null
          message.error(detail)
          void refresh()
        }
      },
    })
    browserISO.value = session
    try {
      await session.mount(file)
      message.success(t('virtualMedia.mountSuccess', 'Media mounted'))
      await refresh()
    } catch (error) {
      if (browserISO.value === session) browserISO.value = null
      session.destroy()
      browserProgress.value = null
      message.error(`${t('virtualMedia.mountFailed', 'Mount failed')}: ${error instanceof Error ? error.message : String(error)}`)
      await refresh()
    }
  } finally {
    browserMounting.value = false
  }
}

function confirmDelete(item: MSDMedia) {
  const prompt = dialog.warning({
    title: t('virtualMedia.deleteMedia', 'Delete media'),
    content: t('virtualMedia.deleteMediaConfirm', 'The stored image and all of its contents will be permanently deleted.'),
    positiveText: t('common.delete', 'Delete'),
    negativeText: t('common.cancel', 'Cancel'),
    onPositiveClick: async () => {
      prompt.loading = true
      deletingID.value = item.id
      try {
        await api.deleteMSDMedia(item.id)
        if (browsingDrive.value?.id === item.id) browsingDrive.value = null
        await refresh()
      } catch (error) {
        prompt.loading = false
        message.error(`${t('virtualMedia.deleteFailed', 'Delete failed')}: ${error instanceof Error ? error.message : String(error)}`)
        return false
      } finally {
        if (deletingID.value === item.id) deletingID.value = null
      }
    },
  })
}

async function uploadISO(event: Event) {
  return uploadStoredMedia(event, 'iso')
}

async function uploadDriveImage(event: Event) {
  return uploadStoredMedia(event, 'drive')
}

async function uploadStoredMedia(event: Event, kind: 'iso' | 'drive') {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || uploading.value) return
  if (kind === 'iso' && !await validISOFile(file)) {
    message.error(t('virtualMedia.invalidISO', 'The selected file is not a valid ISO image.'))
    return
  }
  if (kind === 'drive' && !validDriveImage(file)) {
    message.error(t('virtualMedia.invalidDriveImage', 'The selected file is not a valid disk image.'))
    return
  }

  uploadKind.value = kind
  uploadFileName.value = file.name
  uploadFileSize.value = file.size
  uploadPosition.value = null
  uploadDialogOpen.value = true
  updateShow(false)
  uploading.value = true
  uploadStopRequested.value = false
  resetUploadTelemetry(0, file.size)
  const requestController = new AbortController()
  uploadRequestControllers.add(requestController)
  try {
    const upload = kind === 'drive' ? api.uploadMSDDriveImage : api.uploadMSDISO
    await upload(
      file,
      (loaded) => updateUploadTelemetry(Math.min(loaded, file.size), file.size),
      requestController.signal,
    )
    message.success(kind === 'drive'
      ? t('virtualMedia.driveUploadSuccess', 'Disk image uploaded')
      : t('virtualMedia.uploadSuccess', 'ISO uploaded'))
    await refresh()
  } catch (error) {
    if (!uploadStopRequested.value) {
      if (error instanceof APIError && error.status === 409) await refresh()
      message.error(`${t('virtualMedia.uploadFailed', 'Upload failed')}: ${error instanceof Error ? error.message : String(error)}`)
    }
  } finally {
    uploadRequestControllers.delete(requestController)
    uploadDialogOpen.value = false
    uploading.value = false
    uploadStopRequested.value = false
    uploadSpeed.value = 0
    uploadProgress.value = 0
    uploadTransferred.value = 0
  }
}

function minimizeUploadDialog() {
  uploadDialogOpen.value = false
}

function restoreUploadDialog() {
  uploadDialogOpen.value = true
}

defineExpose({ restoreUploadDialog })

function cancelUpload() {
  if (!uploading.value || uploadStopRequested.value) return
  uploadStopRequested.value = true
  abortActiveUploadRequests()
  message.info(t('virtualMedia.uploadCancelled', 'Upload cancelled'))
}

async function createDrive() {
  if (!driveSize.value || !driveName.value.trim()) return
  creatingDrive.value = true
  try {
    const sizeMiB = driveSize.value * driveSizeDivisor.value
    await api.createMSDDrive(driveName.value.trim(), 'ONEKVM', Math.round(sizeMiB), driveFilesystem.value)
    message.success(t('virtualMedia.driveCreated', 'Virtual disk created'))
    await refresh()
    driveCreateOpen.value = false
    tab.value = 'drive'
    feature.value = 'drive'
  } catch (error) {
    message.error(`${t('virtualMedia.createDriveFailed', 'Drive creation failed')}: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    creatingDrive.value = false
  }
}

function updateDriveSizeUnit(unit: 'MiB' | 'GiB') {
  if (unit === driveSizeUnit.value) return
  if (driveSize.value !== null) {
    driveSize.value = unit === 'GiB'
      ? driveSize.value / 1024
      : driveSize.value * 1024
  }
  driveSizeUnit.value = unit
}

async function openDrive(item: MSDMedia) {
  if (item.imported) return
  if (browsingDrive.value?.id === item.id) {
    closeDrive()
    return
  }
  browsingDrive.value = item
  currentPath.value = ''
  await refreshFiles()
}

async function refreshFiles() {
  const drive = browsingDrive.value
  if (!drive || drive.mounted) return
  fileLoading.value = true
  try {
    files.value = await api.listMSDDriveFiles(drive.id, currentPath.value)
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  } finally {
    fileLoading.value = false
  }
}

function childPath(name: string) {
  return currentPath.value ? `${currentPath.value}/${name}` : name
}

function navigateBreadcrumb(index: number) {
  currentPath.value = breadcrumbs.value.slice(0, index + 1).join('/')
  void refreshFiles()
}

async function uploadDriveFile(event: Event) {
  const input = event.target as HTMLInputElement
  const selected = input.files?.[0]
  input.value = ''
  if (!selected || !browsingDrive.value) return
  if (files.value.some((entry) => entry.name === selected.name)) {
    dialog.warning({
      title: t('virtualMedia.replaceFile', 'Replace file'),
      content: t('virtualMedia.replaceFileConfirm', 'A file with this name already exists. Replace it?'),
      positiveText: t('common.confirm', 'Replace'),
      negativeText: t('common.cancel', 'Cancel'),
      onPositiveClick: () => writeDriveFile(selected, true),
    })
    return
  }
  await writeDriveFile(selected, false)
}

async function writeDriveFile(selected: File, overwrite: boolean) {
  if (!browsingDrive.value || driveUpload.uploading.value || fileTransferActive.value) return
  const controller = driveUpload.begin(selected.name, selected.size)
  try {
    await api.uploadMSDDriveFile(
      browsingDrive.value.id,
      childPath(selected.name),
      selected,
      overwrite,
      driveUpload.progress,
      controller.signal,
    )
    await refreshFiles()
  } catch (error) {
    if (controller.signal.aborted) return
    message.error(error instanceof Error ? error.message : String(error))
  } finally {
    driveUpload.finish(controller)
  }
}

async function createFolder() {
  if (!folderNameValid.value || !browsingDrive.value) return
  try {
    await api.createMSDDriveDirectory(browsingDrive.value.id, childPath(newFolderName.value.trim()))
    newFolderName.value = ''
    folderCreateOpen.value = false
    await refreshFiles()
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

async function deleteDriveEntry(entry: MSDFileEntry) {
  const drive = browsingDrive.value
  if (!drive) return
  fileDeletePopoverPath.value = ''
  try {
    await api.deleteMSDDriveFile(drive.id, childPath(entry.name))
    await refreshFiles()
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

function updateDeletePopover(entry: MSDFileEntry, show: boolean) {
  fileDeletePopoverPath.value = show ? childPath(entry.name) : ''
}

function startRename(entry: MSDFileEntry) {
  renamingPath.value = childPath(entry.name)
  renameValue.value = entry.name
}

function cancelRename() {
  renamingPath.value = ''
  renameValue.value = ''
}

async function confirmRename(entry: MSDFileEntry) {
  const drive = browsingDrive.value
  const nextName = renameValue.value.trim()
  if (!drive || !nextName || nextName.includes('/') || nextName.includes('\\')) return
  try {
    await api.renameMSDDriveFile(drive.id, childPath(entry.name), childPath(nextName))
    cancelRename()
    await refreshFiles()
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

function pathDirectory(path: string) {
  const separator = path.lastIndexOf('/')
  return separator < 0 ? '' : path.slice(0, separator)
}

function joinDrivePath(directory: string, name: string) {
  return directory ? `${directory}/${name}` : name
}

function breadcrumbPath(index: number) {
  return index < 0 ? '' : breadcrumbs.value.slice(0, index + 1).join('/')
}

function stageDriveTransfer(entry: MSDFileEntry, operation: 'copy' | 'move') {
  const drive = browsingDrive.value
  if (!drive) return
  driveClipboard.value = {
    driveID: drive.id,
    operation,
    path: childPath(entry.name),
    name: entry.name,
    directory: entry.directory,
  }
  message.info(operation === 'copy'
    ? t('virtualMedia.copyReady', 'Choose a destination and select Paste.')
    : t('virtualMedia.moveReady', 'Choose a destination and select Paste.'))
}

function copyNameInCurrentDirectory(name: string) {
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const extension = dot > 0 ? name.slice(dot) : ''
  const suffix = t('virtualMedia.copySuffix', 'copy')
  let candidate = `${stem} (${suffix})${extension}`
  let index = 2
  const names = new Set(files.value.map((entry) => entry.name))
  while (names.has(candidate)) {
    candidate = `${stem} (${suffix} ${index})${extension}`
    index += 1
  }
  return candidate
}

async function performDriveTransfer(source: DriveClipboard, targetDirectory: string, operation = source.operation) {
  const drive = browsingDrive.value
  if (!drive || drive.id !== source.driveID || fileTransferActive.value || driveUpload.uploading.value) return
  let targetName = source.name
  if (operation === 'copy' && targetDirectory === currentPath.value && pathDirectory(source.path) === targetDirectory) {
    targetName = copyNameInCurrentDirectory(source.name)
  }
  const target = joinDrivePath(targetDirectory, targetName)
  if (operation === 'move' && target === source.path) {
    message.info(t('virtualMedia.alreadyInFolder', 'The item is already in this folder.'))
    return
  }
  fileTransferOperation.value = operation
  fileTransferName.value = source.name
  fileTransferCurrent.value = target
  fileTransferTransferred.value = 0
  fileTransferTotal.value = 0
  fileTransferSpeed.value = 0
  fileTransferSampleAt = performance.now()
  fileTransferSampleBytes = 0
  fileTransferDone.value = false
  fileTransferError.value = ''
  fileTransferDialogOpen.value = true
  fileTransferActive.value = true
  if (fileTransferCloseTimer !== null) {
    window.clearTimeout(fileTransferCloseTimer)
    fileTransferCloseTimer = null
  }
  const controller = new AbortController()
  fileTransferController = controller
  try {
    await api.transferMSDDriveFile(drive.id, source.path, target, operation, (progress) => {
      fileTransferTransferred.value = progress.transferred
      fileTransferTotal.value = progress.total
      fileTransferCurrent.value = progress.current || target
      fileTransferDone.value = Boolean(progress.done)
      const now = performance.now()
      const sampled = nextUploadSpeed(
        fileTransferSpeed.value,
        progress.transferred,
        fileTransferSampleBytes,
        now - fileTransferSampleAt,
      )
      if (sampled === null) return
      fileTransferSpeed.value = sampled
      fileTransferSampleAt = now
      fileTransferSampleBytes = progress.transferred
    }, controller.signal)
    fileTransferDone.value = true
    if (driveClipboard.value?.path === source.path && driveClipboard.value.operation === operation) {
      driveClipboard.value = null
    }
    message.success(operation === 'copy'
      ? t('virtualMedia.copyComplete', 'Copy complete')
      : t('virtualMedia.moveComplete', 'Move complete'))
    await refreshFiles()
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    if (controller.signal.aborted) {
      fileTransferError.value = t('virtualMedia.transferCancelled', 'Transfer cancelled')
    } else {
      fileTransferError.value = detail
      message.error(`${t('virtualMedia.transferFailed', 'Transfer failed')}: ${detail}`)
    }
  } finally {
    if (fileTransferController === controller) fileTransferController = null
    fileTransferActive.value = false
    if (fileTransferDone.value && !fileTransferError.value) {
      fileTransferCloseTimer = window.setTimeout(() => {
        if (!fileTransferActive.value && fileTransferDone.value && !fileTransferError.value) {
          fileTransferDialogOpen.value = false
        }
        fileTransferCloseTimer = null
      }, 700)
    }
  }
}

function pasteDriveTransfer(targetDirectory = currentPath.value) {
  if (driveClipboard.value) void performDriveTransfer(driveClipboard.value, targetDirectory)
}

function startEntryDrag(event: DragEvent, entry: MSDFileEntry) {
  const drive = browsingDrive.value
  if (!drive) return
  draggedEntry.value = {
    driveID: drive.id,
    operation: 'move',
    path: childPath(entry.name),
    name: entry.name,
    directory: entry.directory,
  }
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'copyMove'
    event.dataTransfer.setData('text/plain', entry.name)
  }
}

function markDropTarget(event: DragEvent, path: string) {
  if (!draggedEntry.value) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = event.ctrlKey || event.metaKey ? 'copy' : 'move'
  dragTargetPath.value = path
}

function dropEntry(event: DragEvent, targetDirectory: string) {
  const source = draggedEntry.value
  event.preventDefault()
  event.stopPropagation()
  draggedEntry.value = null
  dragTargetPath.value = null
  if (!source) return
  void performDriveTransfer(source, targetDirectory, event.ctrlKey || event.metaKey ? 'copy' : 'move')
}

function finishEntryDrag() {
  draggedEntry.value = null
  dragTargetPath.value = null
}

function cancelFileTransfer() {
  fileTransferController?.abort()
  if (fileTransferCloseTimer !== null) window.clearTimeout(fileTransferCloseTimer)
}

function closeFileTransferDialog() {
  if (fileTransferActive.value) return
  fileTransferDialogOpen.value = false
}

onMounted(() => {
  clearLegacyUploadResume()
  window.addEventListener('resize', clampUploadPosition)
})

onBeforeUnmount(() => {
  uploadStopRequested.value = true
  abortActiveUploadRequests()
  driveUpload.cancel()
  fileTransferController?.abort()
  window.removeEventListener('resize', clampUploadPosition)
  window.removeEventListener('pointermove', dragUploadWindow)
  browserISO.value?.destroy()
})
</script>

<template>
  <span class="virtual-media-trigger" @click="updateShow(true)"><slot /></span>

  <n-modal
    :show="popoverOpen"
    :to="overlayTo"
    mask-closable
    close-on-esc
    @update:show="updateShow"
    @after-leave="resetFeatureView"
  >
      <n-card
        class="virtual-media-dialog"
        :class="{ 'is-sheet': sheet }"
        :bordered="false"
        closable
        role="dialog"
        aria-modal="true"
        :aria-label="t('virtualMedia.title', 'Virtual Media')"
        @close="updateShow(false)"
      >
        <template #header>
          <span class="virtual-media-heading">
            <n-button v-if="feature" quaternary circle size="small" :aria-label="t('virtualMedia.back', 'Back')" @click="backToHome">
              <template #icon><ArrowLeft /></template>
            </n-button>
            <component :is="featureIcon" :size="16" /><strong>{{ featureTitle }}</strong>
          </span>
        </template>
        <template #header-extra>
          <n-tag v-if="status && mediaOpen && feature" :type="activeConnection ? 'success' : 'default'" size="small" round>
            <Plug v-if="activeConnection" :size="12" /><Unplug v-else :size="12" />
            {{ activeConnectionLabel }}
          </n-tag>
        </template>

        <div class="virtual-media-content">
          <div v-if="!status && loading" class="virtual-media-loading"><n-spin size="small" /></div>
          <n-alert v-else-if="status && !mediaOpen" type="warning" :title="t('virtualMedia.unavailable', 'Virtual media is unavailable')">
            {{ t('virtualMedia.unavailableDescription', 'The virtual media service is not available on this device.') }}
          </n-alert>
          <Transition v-else-if="mediaOpen" :name="featureNavName" :css="featureNavAnimated">
          <div v-if="!feature" key="home" class="virtual-media-pane virtual-media-home">
            <p class="virtual-media-home-lead"><LayoutGrid :size="16" />{{ t('virtualMedia.chooseFeature', 'Choose a feature') }}</p>
            <div class="virtual-media-home-grid">
              <button v-if="storageAvailable" type="button" class="virtual-media-home-card" @click="openFeature('iso')">
                <Disc3 :size="32" />
                <strong>{{ t('virtualMedia.isoTab', 'Image mount') }}</strong>
                <span>{{ t('virtualMedia.isoHomeDescription', 'Mount a system image (ISO), like inserting a disc.') }}</span>
              </button>
              <button v-if="storageAvailable" type="button" class="virtual-media-home-card" @click="openFeature('drive')">
                <HardDrive :size="32" />
                <strong>{{ t('virtualMedia.driveTab', 'Virtual disk') }}</strong>
                <span>{{ t('virtualMedia.driveHomeDescription', 'Emulate a USB flash drive. Create or upload a disk, then mount it.') }}</span>
              </button>
              <button v-if="mtpAvailable" type="button" class="virtual-media-home-card" @click="openFeature('mtp')">
                <Smartphone :size="32" />
                <strong>{{ t('virtualMedia.mtpTab', 'File transfer') }}</strong>
                <span>{{ t('virtualMedia.mtpDescription', 'Share the virtual-media folder with the controlled device, like plugging in a phone.') }}</span>
              </button>
            </div>
          </div>
          <div v-else key="feature" class="virtual-media-pane">
            <n-tabs v-model:value="tab" type="segment" class="virtual-media-content-tabs">
              <n-tab-pane v-if="storageAvailable" name="iso">
                <div class="virtual-media-tab-connect">
                  <n-button v-if="hostConnected" size="small" :loading="disconnecting" @click="disconnectVirtualMedia">
                    <template #icon><Unplug /></template>{{ t('virtualMedia.disconnect', 'Disconnect') }}
                  </n-button>
                  <n-button v-else type="primary" size="small" :loading="connecting" @click="connectVirtualMedia">
                    <template #icon><Plug /></template>{{ connecting ? t('virtualMedia.connecting', 'Connecting') : t('virtualMedia.connect', 'Connect') }}
                  </n-button>
                  <span class="connect-hint"><Info :size="14" />{{ hostConnected ? t('virtualMedia.connected', 'Connected') : t('virtualMedia.disconnectedDescription', 'Connect when you want the controlled device to use disc images and a virtual disk. You can upload and organize files without connecting.') }}</span>
                </div>
                <section class="virtual-media-workspace">
              <n-radio-group v-model:value="isoSource" :disabled="Boolean(isoSourceLocked)" name="iso-source" class="iso-source-radios">
                <n-radio value="local"><span class="iso-source-option"><Laptop :size="16" />{{ t('virtualMedia.isoSourceLocal', 'This computer') }}</span></n-radio>
                <n-radio value="device"><span class="iso-source-option"><Server :size="16" />{{ t('virtualMedia.isoSourceDevice', 'Device files') }}</span></n-radio>
              </n-radio-group>
              <p class="iso-source-hint"><Info :size="14" />{{ t('virtualMedia.isoSourceHint', 'This computer mounts an ISO without uploading. Device files are stored on the device and can be mounted later.') }}</p>
              <section v-if="isoSource === 'local' && (!status?.iso_mounted || status.iso_mounted === 'browser')" class="media-mode-panel direct-mount-panel">
                <header class="media-mode-header">
                  <div class="media-mode-copy">
                    <strong class="media-title"><Laptop :size="16" />{{ t('virtualMedia.directMountMode', 'Direct mount') }}</strong>
                    <span>{{ t('virtualMedia.directMountDescription', 'Use an ISO from this computer without uploading it to the device.') }}</span>
                  </div>
                  <div class="media-mode-header-actions">
                    <n-tag v-if="status?.iso_mounted === 'browser'" type="success" size="small"><CircleCheck :size="12" />{{ t('virtualMedia.mountedStatus', 'Mounted') }}</n-tag>
                    <label v-if="status?.iso_mounted !== 'browser'" class="file-picker">
                      <input type="file" accept=".iso,application/x-iso9660-image" :disabled="hostMountBlocked || browserMounting || Boolean(status?.iso_mounted)" @change="mountBrowserISO" />
                      <n-button type="primary" :loading="browserMounting" :disabled="hostMountBlocked || Boolean(status?.iso_mounted)" tag="span">
                        <template #icon><Disc3 /></template>
                        {{ browserMounting ? t('virtualMedia.mounting', 'Mounting') : t('virtualMedia.mount', 'Mount') }}
                      </n-button>
                    </label>
                    <n-button v-else @click="eject('iso')"><template #icon><Unplug /></template>{{ t('virtualMedia.unmount', 'Eject') }}</n-button>
                  </div>
                </header>
                <n-alert v-if="status?.iso_mounted === 'browser'" type="info" class="browser-iso-note">
                  {{ t('virtualMedia.keepPageOpen', 'Keep this page open while a browser ISO is mounted.') }}
                </n-alert>
                <div v-if="status?.iso_mounted === 'browser'" class="media-list browser-media-list">
                  <div class="media-row">
                    <Disc3 :size="24" />
                    <div class="media-copy">
                      <strong class="media-filename" :title="browserProgress?.name || t('virtualMedia.browserISO', 'Browser ISO')">{{ browserProgress?.name || t('virtualMedia.browserISO', 'Browser ISO') }}</strong>
                      <span v-if="browserProgress">{{ t('virtualMedia.totalRead', 'Total read:') }} {{ formatBytes(browserProgress.transferred) }} · {{ t('virtualMedia.readSpeed', 'Read speed:') }} {{ formatBytes(browserProgress.bytesPerSecond) }}/s</span>
                    </div>
                  </div>
                </div>
              </section>

              <section v-if="isoSource === 'device' && status?.iso_mounted !== 'browser'" class="media-mode-panel">
                <header class="media-mode-header">
                  <div class="media-mode-copy">
                    <strong class="media-title"><Server :size="16" />{{ t('virtualMedia.isoMode', 'System images') }}</strong>
                    <span>{{ t('virtualMedia.isoModeDescription', 'Upload system images to the device and mount them later.') }}</span>
                  </div>
                  <div class="media-mode-header-actions">
                    <small class="storage-free"><Database :size="13" />{{ formatBytes(status?.storage_free || 0) }} {{ t('virtualMedia.free', 'free') }}</small>
                    <label class="file-picker">
                      <input type="file" accept=".iso,application/x-iso9660-image" :disabled="uploading" @change="uploadISO" />
                      <n-button :disabled="uploading" tag="span"><template #icon><Upload /></template>{{ t('virtualMedia.uploadISO', 'Upload ISO') }}</n-button>
                    </label>
                    <n-button v-if="status?.iso_mounted && status.iso_mounted !== 'browser'" @click="eject('iso')"><template #icon><Unplug /></template>{{ t('virtualMedia.unmount', 'Eject') }}</n-button>
                  </div>
                </header>
                <div v-if="loading && !isoMedia.length" class="iso-list-status" role="status">
                  <LoaderCircle class="spin" :size="18" />
                  <span>{{ t('virtualMedia.loadingImages', 'Loading ISO images…') }}</span>
                </div>
                <div v-else-if="!isoMedia.length" class="iso-list-status">
                  <Disc3 :size="18" />
                  <span>{{ t('virtualMedia.noISO', 'No system images yet') }}</span>
                </div>
                <div v-else class="media-list">
                  <div v-for="item in isoMedia" :key="item.id" class="media-row">
                    <Disc3 :size="24" />
                    <div class="media-copy"><strong class="media-filename" :title="item.name">{{ item.name }}</strong><span>{{ formatBytes(item.size) }}<template v-if="item.external && item.label"> · {{ item.label }}</template></span></div>
                    <n-tag v-if="item.mounted" type="success" size="small"><CircleCheck :size="12" />{{ t('virtualMedia.mountedStatus', 'Mounted') }}</n-tag>
                    <n-button
                      v-if="!item.mounted && !status?.iso_mounted"
                      size="small"
                      type="primary"
                      :loading="mountingID === item.id"
                      :disabled="hostMountBlocked || Boolean(mountingID && mountingID !== item.id)"
                      @click="mount(item)"
                    >
                      <template #icon><Disc3 /></template>
                      {{ mountingID === item.id ? t('virtualMedia.mounting', 'Mounting') : t('virtualMedia.mount', 'Mount') }}
                    </n-button>
                    <n-button v-else-if="item.mounted" size="small" @click="eject('iso')"><template #icon><Unplug /></template>{{ t('virtualMedia.unmount', 'Eject') }}</n-button>
                    <n-button v-if="!item.external" quaternary circle size="small" :disabled="item.mounted || Boolean(mountingID)" @click="confirmDelete(item)"><template #icon><Trash2 /></template></n-button>
                  </div>
                </div>
              </section>
                </section>
              </n-tab-pane>

              <n-tab-pane v-if="storageAvailable" name="drive">
                <div class="virtual-media-tab-connect">
                  <n-button v-if="hostConnected" size="small" :loading="disconnecting" @click="disconnectVirtualMedia">
                    <template #icon><Unplug /></template>{{ t('virtualMedia.disconnect', 'Disconnect') }}
                  </n-button>
                  <n-button v-else type="primary" size="small" :loading="connecting" @click="connectVirtualMedia">
                    <template #icon><Plug /></template>{{ connecting ? t('virtualMedia.connecting', 'Connecting') : t('virtualMedia.connect', 'Connect') }}
                  </n-button>
                  <span class="connect-hint"><Info :size="14" />{{ hostConnected ? t('virtualMedia.connected', 'Connected') : t('virtualMedia.disconnectedDescription', 'Connect when you want the controlled device to use disc images and a virtual disk. You can upload and organize files without connecting.') }}</span>
                </div>
                <section class="virtual-media-workspace">
                  <div class="virtual-drive-panel">
                    <div class="virtual-drive-toolbar">
                      <n-button size="small" @click="openCreateDrive"><template #icon><CirclePlus /></template>{{ t('virtualMedia.createDriveTab', 'Create disk') }}</n-button>
                      <label class="file-picker">
                        <input type="file" accept=".img,.raw,.bin,application/octet-stream" :disabled="uploading" @change="uploadDriveImage" />
                        <n-button size="small" :disabled="uploading" tag="span">
                          <template #icon><Upload /></template>
                          {{ t('virtualMedia.uploadDriveImage', 'Upload disk image') }}
                        </n-button>
                      </label>
                    </div>
                    <div v-if="loading && !driveMedia.length" class="iso-list-status" role="status">
                      <LoaderCircle class="spin" :size="18" />
                      <span>{{ t('virtualMedia.loadingDrives', 'Loading virtual disks…') }}</span>
                    </div>
                    <div v-else-if="!driveMedia.length" class="iso-list-status">
                      <HardDrive :size="18" />
                      <span>{{ t('virtualMedia.noVirtualDrive', 'No virtual disk') }}</span>
                    </div>
                    <div v-else class="media-list">
                        <div v-for="item in driveMedia" :key="item.id" class="media-row">
                          <HardDrive :size="24" />
                          <div class="media-copy">
                            <strong class="media-filename" :title="item.name">{{ item.name }}</strong>
                            <div class="media-badges">
                              <span v-if="item.label">{{ item.label }}</span>
                              <n-tag v-if="driveFilesystemLabel(item)" size="tiny" :bordered="false">{{ driveFilesystemLabel(item) }}</n-tag>
                              <n-tag size="tiny" :bordered="false">{{ formatBytes(item.size) }}</n-tag>
                            </div>
                          </div>
                          <n-tag v-if="item.mounted" type="success" size="small"><CircleCheck :size="12" />{{ t('virtualMedia.mountedStatus', 'Mounted') }}</n-tag>
                          <n-button v-if="!item.mounted && !status?.drive_mounted" size="small" type="primary" :loading="mountingID === item.id" :disabled="hostMountBlocked || Boolean(mountingID && mountingID !== item.id)" @click="mount(item)"><template #icon><HardDrive /></template>{{ mountingID === item.id ? t('virtualMedia.mounting', 'Mounting') : t('virtualMedia.mount', 'Mount') }}</n-button>
                          <n-button v-else-if="item.mounted" size="small" @click="eject('drive')"><template #icon><Unplug /></template>{{ t('virtualMedia.unmount', 'Eject') }}</n-button>
                          <n-button v-if="!item.imported" size="small" :type="browsingDrive?.id === item.id ? 'primary' : 'default'" :disabled="item.mounted" @click="openDrive(item)"><template #icon><FolderOpen /></template>{{ browsingDrive?.id === item.id ? t('virtualMedia.closeFiles', 'Close') : t('virtualMedia.files', 'Files') }}</n-button>
                          <n-button quaternary circle size="small" :loading="deletingID === item.id" :disabled="item.mounted || Boolean(deletingID)" @click="confirmDelete(item)"><template #icon><Trash2 /></template></n-button>
                        </div>
                    </div>

                    <section v-if="browsingDrive" class="file-manager">
                        <div class="file-manager-header">
                          <strong class="media-filename media-title" :title="browsingDrive.name"><HardDrive :size="16" />{{ browsingDrive.name }}</strong>
                          <div class="breadcrumbs" :class="{ 'has-nested-path': breadcrumbs.length > 0 }" :title="logicalPath">
                            <n-button
                              text
                              :class="{ 'drop-target': dragTargetPath === '' }"
                              @click="currentPath = ''; refreshFiles()"
                              @dragover="markDropTarget($event, '')"
                              @dragleave="dragTargetPath === '' && (dragTargetPath = null)"
                              @drop="dropEntry($event, '')"
                            ><template #icon><House /></template>{{ t('virtualMedia.rootDirectory', 'Root') }}</n-button>
                            <template v-for="(part, index) in breadcrumbs" :key="`${part}-${index}`">
                              <span>/</span><n-button
                                text
                                :class="{ 'drop-target': dragTargetPath === breadcrumbPath(index) }"
                                @click="navigateBreadcrumb(index)"
                                @dragover="markDropTarget($event, breadcrumbPath(index))"
                                @dragleave="dragTargetPath === breadcrumbPath(index) && (dragTargetPath = null)"
                                @drop="dropEntry($event, breadcrumbPath(index))"
                              >{{ part }}</n-button>
                            </template>
                          </div>
                          <n-button class="file-manager-close" quaternary circle size="small" :title="t('virtualMedia.closeFiles', 'Close')" @click="closeDrive"><template #icon><X /></template></n-button>
                        </div>
                        <n-alert v-if="browsingDrive.mounted" type="warning">{{ t('virtualMedia.ejectToManage', 'Eject the drive before managing files.') }}</n-alert>
                        <template v-else>
                          <div class="file-actions">
                            <label class="file-picker"><input type="file" :disabled="driveUpload.uploading.value" @change="uploadDriveFile" /><n-button tag="span" size="small" :disabled="driveUpload.uploading.value"><template #icon><Upload /></template>{{ t('virtualMedia.uploadFile', 'Upload file') }}</n-button></label>
                            <n-popover v-model:show="folderCreateOpen" trigger="click" placement="bottom-start" :to="overlayTo" :z-index="4600" :show-arrow="false" class="folder-create-popover">
                              <template #trigger><n-button size="small"><template #icon><FolderPlus /></template>{{ t('virtualMedia.newFolder', 'New folder') }}</n-button></template>
                              <section class="folder-create-card">
                                <strong class="media-title"><FolderPlus :size="16" />{{ t('virtualMedia.newFolder', 'New folder') }}</strong>
                                <n-input v-model:value="newFolderName" size="small" autofocus :placeholder="t('virtualMedia.folderName', 'Folder name')" @keyup.enter="createFolder" />
                                <div class="folder-create-actions">
                                  <n-button size="small" @click="folderCreateOpen = false; newFolderName = ''">{{ t('common.cancel', 'Cancel') }}</n-button>
                                  <n-button size="small" type="primary" :disabled="!folderNameValid" @click="createFolder">{{ t('common.create', 'Create') }}</n-button>
                                </div>
                              </section>
                            </n-popover>
                            <n-button v-if="driveClipboard?.driveID === browsingDrive.id" size="small" type="primary" :disabled="fileTransferActive" @click="pasteDriveTransfer()">
                              <template #icon><ClipboardPaste /></template>{{ driveClipboard.operation === 'copy' ? t('virtualMedia.pasteCopy', 'Paste copy') : t('virtualMedia.pasteMove', 'Move here') }}
                            </n-button>
                            <n-button v-if="driveClipboard?.driveID === browsingDrive.id" quaternary circle size="small" :title="t('virtualMedia.cancelSelection', 'Cancel copy or move')" @click="driveClipboard = null"><template #icon><X /></template></n-button>
                            <small class="drag-hint"><Info :size="12" />{{ t('virtualMedia.dragHint', 'Drag to a folder to move; hold Ctrl to copy.') }}</small>
                          </div>
                          <n-spin :show="fileLoading">
                            <div class="file-list">
                              <button
                                v-if="currentPath"
                                class="file-row"
                                :class="{ 'drop-target': dragTargetPath === breadcrumbPath(breadcrumbs.length - 2) }"
                                @click="currentPath = breadcrumbs.slice(0, -1).join('/'); refreshFiles()"
                                @dragover="markDropTarget($event, breadcrumbPath(breadcrumbs.length - 2))"
                                @dragleave="dragTargetPath === breadcrumbPath(breadcrumbs.length - 2) && (dragTargetPath = null)"
                                @drop="dropEntry($event, breadcrumbPath(breadcrumbs.length - 2))"
                              ><Folder :size="18" /><span>..</span></button>
                              <div
                                v-for="entry in files"
                                :key="entry.name"
                                class="file-row"
                                :class="{ dragging: draggedEntry?.path === childPath(entry.name), 'drop-target': entry.directory && dragTargetPath === childPath(entry.name) }"
                                draggable="true"
                                @dragstart="startEntryDrag($event, entry)"
                                @dragend="finishEntryDrag"
                                @dragover="entry.directory && markDropTarget($event, childPath(entry.name))"
                                @dragleave="entry.directory && dragTargetPath === childPath(entry.name) && (dragTargetPath = null)"
                                @drop="entry.directory && dropEntry($event, childPath(entry.name))"
                              >
                                <template v-if="renamingPath === childPath(entry.name)">
                                  <component :is="entry.directory ? Folder : File" :size="18" />
                                  <n-input v-model:value="renameValue" size="small" autofocus @keyup.enter="confirmRename(entry)" @keyup.esc="cancelRename" />
                                  <n-button quaternary circle size="tiny" :disabled="!renameValue.trim()" @click="confirmRename(entry)"><template #icon><Check /></template></n-button>
                                  <n-button quaternary circle size="tiny" @click="cancelRename"><template #icon><X /></template></n-button>
                                </template>
                                <template v-else>
                                  <button v-if="entry.directory" class="file-open" @click="currentPath = childPath(entry.name); refreshFiles()"><Folder :size="18" /><span :title="entry.name">{{ entry.name }}</span></button>
                                  <div v-else class="file-open" @dblclick="startRename(entry)"><File :size="18" /><span :title="entry.name">{{ entry.name }}</span><small>{{ formatBytes(entry.size) }}</small></div>
                                  <a v-if="!entry.directory" :href="api.getMSDDriveFileURL(browsingDrive.id, childPath(entry.name))" class="file-icon-action" :title="t('common.download', 'Download')"><Download :size="17" /></a>
                                  <n-button quaternary circle size="tiny" :title="t('virtualMedia.copy', 'Copy')" @click="stageDriveTransfer(entry, 'copy')"><template #icon><Copy /></template></n-button>
                                  <n-button quaternary circle size="tiny" :title="t('virtualMedia.move', 'Move')" @click="stageDriveTransfer(entry, 'move')"><template #icon><Scissors /></template></n-button>
                                  <n-button quaternary circle size="tiny" :title="t('virtualMedia.rename', 'Rename')" @click="startRename(entry)"><template #icon><Pencil /></template></n-button>
                                  <n-popconfirm
                                    :show="fileDeletePopoverPath === childPath(entry.name)"
                                    :positive-text="t('common.delete', 'Delete')"
                                    :negative-text="t('common.cancel', 'Cancel')"
                                    :to="overlayTo"
                                    :z-index="4600"
                                    @update:show="updateDeletePopover(entry, $event)"
                                    @positive-click="deleteDriveEntry(entry)"
                                    @negative-click="fileDeletePopoverPath = ''"
                                  >
                                    <template #trigger>
                                      <n-button quaternary circle size="tiny" :title="t('common.delete', 'Delete')"><template #icon><Trash2 /></template></n-button>
                                    </template>
                                    {{ t('virtualMedia.deleteFileConfirm', 'Delete “{name}”?').replace('{name}', entry.name) }}
                                  </n-popconfirm>
                                </template>
                              </div>
                            </div>
                          </n-spin>
                        </template>
                    </section>
                  </div>
                </section>
              </n-tab-pane>
              <n-tab-pane v-if="mtpAvailable" name="mtp">
                <section class="virtual-media-workspace">
                  <section class="media-mode-panel">
                    <header class="media-mode-header">
                      <div class="media-mode-copy">
                        <strong class="media-title"><Smartphone :size="16" />{{ t('virtualMedia.mtpTab', 'File transfer') }}</strong>
                        <span>{{ t('virtualMedia.mtpDescription', 'Share the virtual-media folder with the controlled device, like plugging in a phone.') }}</span>
                      </div>
                      <div class="media-mode-header-actions">
                        <n-tag v-if="status?.mtp" type="success" size="small"><CircleCheck :size="12" />{{ t('virtualMedia.connected', 'Connected') }}</n-tag>
                        <n-button v-if="status?.mtp" size="small" :loading="mtpBusy" @click="setMTP(false)">
                          <template #icon><Unplug /></template>{{ t('virtualMedia.disconnect', 'Disconnect') }}
                        </n-button>
                        <n-button v-else type="primary" size="small" :loading="mtpBusy" @click="setMTP(true)">
                          <template #icon><Plug /></template>{{ t('virtualMedia.connect', 'Connect') }}
                        </n-button>
                      </div>
                    </header>
                  </section>
                </section>
              </n-tab-pane>
            </n-tabs>
          </div>
          </Transition>
        </div>
      </n-card>
  </n-modal>

  <n-modal
    v-model:show="driveCreateOpen"
    preset="card"
    :to="overlayTo"
    :z-index="4600"
    class="drive-create-modal"
    :style="{ width: 'min(400px, calc(100vw - 48px))' }"
    :title="t('virtualMedia.createDriveTab', 'Create disk')"
    :mask-closable="!creatingDrive"
    :closable="!creatingDrive"
    :auto-focus="false"
  >
    <n-form label-placement="top" :show-feedback="false" class="drive-create-form">
      <n-form-item :label="t('virtualMedia.driveName', 'Disk name')">
        <n-input v-model:value="driveName" :placeholder="t('virtualMedia.driveName', 'Disk name')" />
      </n-form-item>
      <div class="drive-create-row">
        <n-form-item :label="t('virtualMedia.driveFormat', 'Format')">
          <n-select
            v-model:value="driveFilesystem"
            class="drive-format-select"
            :options="driveFormatOptions"
            :consistent-menu-width="false"
            :menu-props="{ to: overlayTo, zIndex: 4700 }"
          />
        </n-form-item>
        <n-form-item :label="t('virtualMedia.driveCapacity', 'Capacity')">
          <n-input-group class="drive-size-input">
            <n-input-number
              v-model:value="driveSize"
              class="drive-size-number"
              placeholder=" "
              :show-button="false"
              :min="minimumDriveSize"
              :max="maximumDriveSize"
              :step="driveSizeUnit === 'GiB' ? 0.25 : 64"
            />
            <n-select
              class="drive-size-unit"
              :value="driveSizeUnit"
              :options="driveSizeUnitOptions"
              :consistent-menu-width="false"
              :menu-props="{ to: overlayTo, zIndex: 4700 }"
              @update:value="updateDriveSizeUnit"
            />
          </n-input-group>
        </n-form-item>
      </div>
      <p class="drive-format-hint">{{ driveFormatHint }}</p>
    </n-form>
    <template #footer>
      <div class="drive-create-actions">
        <n-button :disabled="creatingDrive" @click="driveCreateOpen = false">{{ t('common.cancel', 'Cancel') }}</n-button>
        <n-button type="primary" :loading="creatingDrive" :disabled="!driveName.trim() || !driveSize" @click="createDrive">
          <template #icon><CirclePlus /></template>{{ t('virtualMedia.createDrive', 'Create') }}
        </n-button>
      </div>
    </template>
  </n-modal>

  <XpTransferDialog
    ref="uploadWindow"
    :show="uploadDialogOpen"
    :dialog-label="uploadProgressTitle"
    :window-style="uploadWindowStyle"
    :status="uploadStatusLabel"
    :transferred="uploadTransferred"
    :total="uploadFileSize"
    :percentage="uploadProgress"
    :speed="uploadSpeed"
    :remaining-label="uploading ? uploadRemainingLabel : ''"
    @title-pointerdown="startUploadDrag"
  >
    <template #title>
      <Upload :size="15" />{{ uploadProgressTitle }}
    </template>
    <template #title-actions>
      <button class="xp-title-minimize" :aria-label="t('virtualMedia.minimizeUpload', 'Minimize upload window')" @click="minimizeUploadDialog" />
    </template>
    <template #actions>
      <button :disabled="!uploading" @click="cancelUpload">{{ t('virtualMedia.cancelUpload', 'Cancel upload') }}</button>
    </template>
  </XpTransferDialog>

  <XpTransferDialog
    :show="driveUpload.uploading.value"
    :dialog-label="t('virtualMedia.uploadFile', 'Upload file')"
    :status="driveUploadStatus"
    :transferred="driveUpload.transferred.value"
    :total="driveUpload.total.value"
    :percentage="driveUpload.percentage.value"
    :speed="driveUpload.speed.value"
    :remaining-label="driveUploadRemainingLabel"
  >
    <template #title>
      <Upload :size="15" />{{ t('virtualMedia.uploadFile', 'Upload file') }}
    </template>
    <template #actions>
      <button @click="driveUpload.cancel">{{ t('virtualMedia.cancelUpload', 'Cancel upload') }}</button>
    </template>
  </XpTransferDialog>

  <XpTransferDialog
    :show="fileTransferDialogOpen"
    layer-class="xp-file-transfer-layer"
    :dialog-label="fileTransferOperation === 'copy' ? t('virtualMedia.copying', 'Copying') : t('virtualMedia.moving', 'Moving')"
  >
    <template #title>
      <Copy v-if="fileTransferOperation === 'copy'" :size="15" />
      <Scissors v-else :size="15" />
      {{ fileTransferOperation === 'copy' ? t('virtualMedia.copying', 'Copying') : t('virtualMedia.moving', 'Moving') }}
    </template>
    <template #default>
      <div v-if="fileTransferActive" class="xp-transfer-animation" aria-hidden="true">
        <span class="xp-transfer-folder xp-transfer-folder-source" />
        <span class="xp-transfer-paper xp-transfer-paper-one" />
        <span class="xp-transfer-paper xp-transfer-paper-two" />
        <span class="xp-transfer-paper xp-transfer-paper-three" />
        <span class="xp-transfer-folder xp-transfer-folder-target" />
      </div>
      <div class="xp-upload-file">
        <File :size="30" />
        <span>
          <strong :title="fileTransferName">{{ fileTransferName }}</strong>
          <small :title="fileTransferCurrent">{{ fileTransferCurrent ? `/${fileTransferCurrent}` : '/' }}</small>
        </span>
      </div>
      <p v-if="fileTransferError" class="xp-transfer-error">{{ fileTransferError }}</p>
      <p v-else-if="fileTransferDone">{{ t('virtualMedia.transferComplete', 'Transfer complete') }}</p>
      <p v-else>{{ fileTransferOperation === 'copy' ? t('virtualMedia.copyingFiles', 'Copying files…') : t('virtualMedia.movingFiles', 'Moving files…') }}</p>
      <div class="xp-progress-track" role="progressbar" :aria-valuenow="fileTransferPercentage" aria-valuemin="0" aria-valuemax="100">
        <div class="xp-progress-value" :style="{ width: `${fileTransferPercentage}%` }" />
      </div>
      <div class="xp-upload-stats">
        <span>{{ formatBytes(fileTransferTransferred) }} / {{ formatBytes(fileTransferTotal) }}</span>
        <span>{{ fileTransferSpeed > 0 ? `${formatBytes(fileTransferSpeed)}/s` : '—' }}</span>
        <strong>{{ fileTransferPercentage }}%</strong>
      </div>
      <footer class="xp-upload-actions">
        <button v-if="fileTransferActive" @click="cancelFileTransfer">{{ t('common.cancel', 'Cancel') }}</button>
        <button v-else @click="closeFileTransferDialog">{{ t('common.close', 'Close') }}</button>
      </footer>
    </template>
  </XpTransferDialog>
</template>

<style scoped>
.virtual-media-trigger { display: inline-flex; }
.virtual-media-dialog {
  width: min(820px, calc(100vw - 24px));
  max-height: calc(100vh - 32px);
  overflow: hidden;
}
.virtual-media-dialog :deep(.n-card-header) { padding: 15px 18px 12px; }
.virtual-media-dialog :deep(.n-card-header__main) { min-width: 0; overflow: hidden; }
.virtual-media-dialog :deep(.n-card-header__extra) { display: flex; align-items: center; overflow: hidden; }
.virtual-media-dialog :deep(.n-card__content) {
  min-height: 0;
  max-height: calc(100vh - 96px);
  padding: 0 18px 18px;
  overflow: hidden;
}
.virtual-media-heading { display: inline-flex; min-width: 0; align-items: center; gap: 8px; }
.virtual-media-home { display: grid; gap: 14px; padding: 6px 0 4px; }
.virtual-media-home-lead { display: flex; margin: 0; align-items: center; gap: 8px; color: var(--n-text-color-3); font-size: 13px; line-height: 1.5; }
.media-title, .iso-source-option, .storage-free, .drag-hint { display: inline-flex; align-items: center; gap: 6px; }
.virtual-media-dialog :deep(.n-tag) { display: inline-flex; align-items: center; gap: 4px; }
.virtual-media-home-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.virtual-media-home-card {
  display: grid;
  justify-items: center;
  gap: 8px;
  min-height: 168px;
  margin: 0;
  padding: 22px 16px 18px;
  border: 1px solid rgba(128, 128, 128, .22);
  border-radius: 12px;
  background: rgba(128, 128, 128, .05);
  color: inherit;
  cursor: pointer;
  text-align: center;
}
.virtual-media-home-card:hover,
.virtual-media-home-card:focus-visible {
  border-color: rgba(32, 128, 240, .55);
  background: rgba(32, 128, 240, .1);
  outline: none;
}
.virtual-media-home-card > svg { color: var(--n-text-color-2); }
.virtual-media-home-card > strong { font-size: 15px; line-height: 1.3; }
.virtual-media-home-card > span { color: var(--n-text-color-3); font-size: 12px; line-height: 1.45; }
.iso-source-radios { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 8px; }
.iso-source-radios :deep(.n-radio) { align-items: center; }
.iso-source-hint { display: flex; margin: 0 0 12px; align-items: flex-start; gap: 6px; color: var(--n-text-color-3); font-size: 12px; line-height: 1.5; }
.iso-source-hint > svg { flex: 0 0 auto; margin-top: 2px; }
.virtual-media-content {
  display: grid;
  grid-template-areas: "pane";
  position: relative;
  min-height: 120px;
  max-height: calc(100vh - 168px);
  overflow: hidden;
}
.virtual-media-pane {
  grid-area: pane;
  width: 100%;
  min-height: 0;
  max-height: calc(100vh - 168px);
  overflow-y: auto;
  padding-right: 3px;
  scrollbar-width: thin;
}
.virtual-media-forward-enter-active,
.virtual-media-back-enter-active {
  transition: transform var(--win11-enter) var(--win11-ease-out), opacity var(--win11-enter) var(--win11-ease-out);
}
.virtual-media-forward-leave-active,
.virtual-media-back-leave-active {
  z-index: 1;
  pointer-events: none;
  transition: transform var(--win11-exit) var(--win11-ease-in), opacity var(--win11-exit) var(--win11-ease-in);
}
.virtual-media-forward-enter-from { opacity: 0; transform: translateX(28px); }
.virtual-media-forward-leave-to { opacity: 0; transform: translateX(-16px); }
.virtual-media-back-enter-from { opacity: 0; transform: translateX(-28px); }
.virtual-media-back-leave-to { opacity: 0; transform: translateX(16px); }
.virtual-media-tab-connect { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.virtual-media-tab-connect > :deep(.n-button) { flex: 0 0 auto; }
.virtual-media-loading { display: grid; min-height: 112px; place-items: center; }
.iso-list-status {
  display: flex;
  width: 100%;
  min-height: 80px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--n-text-color-3);
  font-size: 13px;
  text-align: center;
}
.iso-list-status > svg {
  flex: 0 0 auto;
}
.virtual-media-disconnected { display: grid; min-height: 150px; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 14px; padding: 18px; border: 1px solid rgba(128, 128, 128, .2); border-radius: 8px; background: rgba(128, 128, 128, .045); }
.virtual-media-disconnected > svg { color: var(--n-text-color-3); }
.virtual-media-disconnected > div { display: grid; min-width: 0; gap: 4px; }
.virtual-media-disconnected > div > span { color: var(--n-text-color-3); font-size: 12px; line-height: 1.5; }
.virtual-media-disconnect-button { flex: 0 0 auto; }
.virtual-media-content-tabs > :deep(.n-tabs-nav) { display: none; }
.virtual-media-tab-label { display: inline-flex; width: 100%; min-width: 0; align-items: center; justify-content: center; gap: 7px; }
.virtual-media-tab-label > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.virtual-media-workspace { margin-top: 8px; }
.iso-mode-grid { display: grid; grid-template-columns: minmax(240px, .85fr) minmax(0, 1.25fr); align-items: start; gap: 10px; }
.media-mode-panel { min-width: 0; padding: 10px; border: 1px solid rgba(128, 128, 128, .2); border-radius: 8px; background: rgba(128, 128, 128, .045); }
.media-mode-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 13px; }
.media-mode-copy { display: grid; min-width: 0; gap: 3px; }
.media-mode-header-actions { display: flex; flex: 0 0 auto; align-items: center; justify-content: flex-end; gap: 8px; }
.media-mode-header strong { font-size: 13px; }
.media-mode-copy > span, .media-mode-header small { color: var(--n-text-color-3); font-size: 11px; line-height: 1.45; }
.media-mode-header small { flex: 0 0 auto; white-space: nowrap; }
.direct-mount-panel .media-mode-header { flex-direction: column; align-items: stretch; }
.direct-mount-panel .media-mode-header-actions { width: 100%; }
.direct-mount-panel .media-mode-header-actions > .file-picker,
.direct-mount-panel .media-mode-header-actions > :deep(.n-button) { width: 100%; }
.direct-mount-panel .file-picker :deep(.n-button) { width: 100%; }
.virtual-drive-panel { margin-top: 2px; }
.virtual-drive-toolbar { display: flex; flex-wrap: wrap; justify-content: flex-start; gap: 8px; margin-bottom: 10px; }
.drive-create-form { display: grid; }
.drive-create-form :deep(.n-form-item) { min-width: 0; margin-bottom: 10px; }
.drive-create-form :deep(.n-input) { width: 100%; }
.drive-create-row { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 0 16px; }
.drive-create-row :deep(.n-form-item) { flex: 0 0 auto; width: auto; margin-bottom: 8px; }
.drive-format-select { width: 128px; }
.drive-size-input { display: inline-flex; width: max-content; align-items: stretch; }
.drive-size-number { width: 112px; }
.drive-size-unit { width: 76px; }
.drive-format-hint { margin: 0 0 4px; color: var(--n-text-color-3); font-size: 11px; line-height: 1.45; }
.drive-create-actions { display: flex; justify-content: flex-end; gap: 8px; }
.folder-create-card { display: grid; width: min(320px, calc(100vw - 48px)); gap: 10px; padding: 4px; }
.folder-create-actions { display: flex; justify-content: flex-end; gap: 8px; }

.file-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
.file-picker {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.file-picker input { display: none; }
.file-picker :deep(.n-button) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.storage-summary { margin-left: auto; color: var(--n-text-color-3); font-size: 12px; }
.upload-progress { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.resume-upload-note { margin-bottom: 12px; }
.resume-upload-note :deep(.n-alert-body__content) { display: grid; gap: 2px; }
.resume-upload-note strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.resume-upload-note span { font-size: 12px; }
.browser-iso-note { margin-bottom: 10px; }
.browser-media-list { margin-bottom: 12px; }
.media-list { display: grid; gap: 8px; }
.media-row { display: flex; align-items: center; gap: 10px; min-height: 54px; padding: 9px 11px; border: 1px solid rgba(128, 128, 128, .2); border-radius: 8px; }
.media-copy { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 4px; }
.media-filename { min-width: 0; max-width: 100%; overflow-wrap: anywhere; word-break: break-word; white-space: normal; }
.media-copy span { color: var(--n-text-color-3); font-size: 12px; }
.media-badges { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-width: 0; }
.media-badges :deep(.n-tag) { flex: 0 0 auto; }
.file-manager { margin-top: 18px; padding-top: 14px; border-top: 1px solid rgba(128, 128, 128, .2); }
.file-manager-header { display: flex; min-width: 0; align-items: center; gap: 12px; margin-bottom: 12px; }
.file-manager-header > strong { flex: 0 1 auto; }
.file-manager-close { margin-left: auto; flex: 0 0 auto; }
.breadcrumbs { display: flex; min-width: 0; align-items: center; gap: 4px; overflow: hidden; white-space: nowrap; }
.breadcrumbs.has-nested-path { overflow-x: auto; overflow-y: hidden; }
.breadcrumbs :deep(.n-button) { flex: 0 0 auto; }
.drag-hint { margin-left: auto; color: var(--n-text-color-3); font-size: 11px; }
.connect-hint { display: flex; min-width: 0; align-items: flex-start; gap: 6px; color: var(--n-text-color-3); font-size: 12px; line-height: 1.5; }
.connect-hint > svg { flex: 0 0 auto; margin-top: 2px; }
.file-list { display: grid; min-height: 64px; align-content: start; gap: 2px; }
.file-row { display: flex; align-items: center; gap: 8px; min-height: 38px; padding: 5px 7px; border: 0; border-radius: 5px; background: transparent; color: inherit; text-align: left; }
.file-row:hover { background: rgba(128, 128, 128, .1); }
.file-row.dragging { opacity: .42; }
.file-row.drop-target, .breadcrumbs :deep(.drop-target) { background: rgba(32, 128, 240, .2); box-shadow: inset 0 0 0 1px rgba(32, 128, 240, .55); }
.file-open { display: flex; box-sizing: border-box; flex: 1; min-width: 0; align-items: center; gap: 8px; margin: 0; padding: 0; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; }
.file-open > svg, .file-row > svg { flex: 0 0 18px; }
.file-open span { min-width: 0; overflow-wrap: anywhere; word-break: break-word; }
.file-open small { margin-left: auto; color: var(--n-text-color-3); }
.file-icon-action { display: inline-flex; color: inherit; }
@media (max-width: 760px) {
  .virtual-media-dialog { width: 100vw; max-width: 100vw; max-height: 92dvh; border-radius: 16px 16px 0 0; }
  .virtual-media-dialog :deep(.n-card-header) { padding: 12px 14px 10px; }
  .virtual-media-dialog :deep(.n-card__content) { max-height: calc(92dvh - 58px); padding: 0 12px 12px; }
  .virtual-media-content,
  .virtual-media-pane { max-height: calc(92dvh - 122px); }
  .virtual-media-home-grid { grid-template-columns: 1fr; }
  .virtual-media-home-card { min-height: 96px; padding: 16px 14px; }
  .iso-mode-grid { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) {
  .virtual-media-forward-enter-active,
  .virtual-media-forward-leave-active,
  .virtual-media-back-enter-active,
  .virtual-media-back-leave-active { transition: none; }
  .virtual-media-forward-enter-from,
  .virtual-media-forward-leave-to,
  .virtual-media-back-enter-from,
  .virtual-media-back-leave-to { opacity: 1; transform: none; }
  .iso-list-status .spin { animation: none; }
}
@media (max-width: 620px) { .media-mode-header { flex-direction: column; align-items: stretch; } .media-mode-header-actions { width: 100%; } .media-row { flex-wrap: wrap; } .media-copy { flex-basis: calc(100% - 44px); } }
@media (max-width: 620px) { .virtual-media-disconnected { grid-template-columns: auto minmax(0, 1fr); } .virtual-media-disconnected :deep(.n-button) { grid-column: 1 / -1; justify-self: stretch; } .virtual-media-disconnect-button { padding-inline: 8px; } }
</style>
