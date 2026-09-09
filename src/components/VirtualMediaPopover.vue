<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { ArrowLeft, Ban, Check, CircleCheck, CirclePlus, ClipboardPaste, Copy, Database, Disc3, Download, File, Folder, FolderOpen, FolderPlus, HardDrive, House, Info, Laptop, LayoutGrid, Pause, Pencil, Plug, Scissors, Server, Smartphone, Trash2, Unplug, Upload, X } from '@lucide/vue'
import { useDialog, useMessage } from 'naive-ui'

import { api, APIError, type MSDFileEntry, type MSDISOUpload, type MSDMedia, type MSDStatus } from '@/api/client'
import { useUploadProgress } from '@/composables/useUploadProgress'
import { t } from '@/i18n/runtime'
import { BrowserISO, type BrowserISOProgress } from '@/lib/browser-iso'
import { nextUploadSpeed, uploadPercentage, uploadRemainingSeconds } from '@/lib/upload-speed'

import XpTransferDialog from './XpTransferDialog.vue'

defineProps<{
  placement?: 'top-end' | 'bottom-end' | 'right-start' | 'left-start'
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

const ISO_UPLOAD_CHUNK_SIZE = 4 << 20
const ISO_UPLOAD_MANIFEST_KEY = 'onekvm-msd-upload:pending'

type PendingISOUpload = {
  id: string
  name: string
  size: number
  lastModified: number
  fingerprint: string
  offset: number
  kind: 'iso' | 'drive'
}

type DriveClipboard = {
  driveID: string
  operation: 'copy' | 'move'
  path: string
  name: string
  directory: boolean
}

function readPendingUpload(): PendingISOUpload | null {
  try {
    const raw = localStorage.getItem(ISO_UPLOAD_MANIFEST_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<PendingISOUpload>
    if (!value.id || !value.name || typeof value.fingerprint !== 'string' || !Number.isFinite(value.size) || !Number.isFinite(value.offset) || !Number.isFinite(value.lastModified)) return null
    return { ...value, kind: value.kind === 'drive' ? 'drive' : 'iso' } as PendingISOUpload
  } catch {
    return null
  }
}

function uploadResumeKey(fingerprint: string) {
  return `onekvm-msd-upload:file:${fingerprint}`
}

const message = useMessage()
const dialog = useDialog()
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
const isoSource = ref<IsoSource>('local')
const driveCreateOpen = ref(false)
const folderCreateOpen = ref(false)
const popoverOpen = ref(false)
let uploadSampleAt = 0
let uploadSampleBytes = 0
const uploadRequestControllers = new Set<AbortController>()
const initialPendingUpload = readPendingUpload()
const pendingUpload = ref<PendingISOUpload | null>(initialPendingUpload)
const uploadProgress = ref(initialPendingUpload ? uploadPercentage(initialPendingUpload.offset, initialPendingUpload.size) : 0)
const uploadTransferred = ref(initialPendingUpload?.offset || 0)
const uploadSpeed = ref(0)
const uploading = ref(false)
const uploadStopRequested = ref(false)
const activeUploadID = ref(initialPendingUpload?.id || '')
const uploadDialogOpen = ref(false)
const uploadWindow = ref<InstanceType<typeof XpTransferDialog> | null>(null)
const uploadPosition = ref<{ x: number; y: number } | null>(null)
const uploadFileName = ref(initialPendingUpload?.name || '')
const uploadFileSize = ref(initialPendingUpload?.size || 0)
const driveName = ref('OneKVM Disk')
const driveSize = ref<number | null>(1024)
const driveSizeUnit = ref<'MiB' | 'GiB'>('MiB')
const creatingDrive = ref(false)
const browsingDrive = ref<MSDMedia | null>(null)
const currentPath = ref('')
const files = ref<MSDFileEntry[]>([])
const fileLoading = ref(false)
const newFolderName = ref('')
const browserISO = shallowRef<BrowserISO | null>(null)
const browserMounting = ref(false)
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
const mountBlocked = computed(() => uploading.value || Boolean(pendingUpload.value) || Boolean(status.value?.iso_uploading))
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
  pendingUpload.value?.size || uploadFileSize.value,
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
const uploadStatusLabel = computed(() => t(
  uploading.value ? 'virtualMedia.uploadingFile' : 'virtualMedia.uploadPausedFile',
  uploading.value ? 'Uploading {name}…' : 'Paused: {name}',
).replace('{name}', pendingUpload.value?.name || uploadFileName.value))
const pendingUploadKind = computed<'iso' | 'drive'>(() => pendingUpload.value?.kind === 'drive' ? 'drive' : 'iso')
const uploadProgressTitle = computed(() => pendingUploadKind.value === 'drive'
  ? t('virtualMedia.driveUploadTitle', 'Disk upload')
  : t('virtualMedia.uploadProgressTitle', 'ISO upload'))

watch(
  [uploadDialogOpen, uploading, uploadProgress, uploadTransferred, uploadSpeed, pendingUpload, uploadProgressTitle],
  () => emit('upload-state', {
    minimized: Boolean(pendingUpload.value) && !uploadDialogOpen.value,
    uploading: uploading.value,
    name: pendingUpload.value?.name || uploadFileName.value,
    progress: uploadProgress.value,
    transferred: uploadTransferred.value,
    total: pendingUpload.value?.size || uploadFileSize.value,
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
  if (feature.value === 'iso') return t('virtualMedia.isoTab', 'ISO mounting')
  if (feature.value === 'drive') return t('virtualMedia.driveTab', 'Virtual disk')
  if (feature.value === 'mtp') return t('virtualMedia.mtpTab', 'File transfer')
  return t('virtualMedia.title', 'Virtual Media')
})
const featureIcon = computed(() => {
  if (feature.value === 'iso') return Disc3
  if (feature.value === 'drive') return HardDrive
  if (feature.value === 'mtp') return Smartphone
  return Disc3
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

function openFeature(name: MediaTab) {
  tab.value = name
  feature.value = name
}

function backToHome() {
  feature.value = null
}

function featureFromStatus(): MediaTab | null {
  if (status.value?.iso_mounted && storageAvailable.value) return 'iso'
  if (status.value?.drive_mounted && storageAvailable.value) return 'drive'
  if (status.value?.mtp && mtpAvailable.value) return 'mtp'
  return null
}

function updateShow(show: boolean) {
  if (!show && (folderCreateOpen.value || driveCreateOpen.value || fileDeletePopoverPath.value)) return
  popoverOpen.value = show
  emit('update:show', show)
  if (show) {
    browserISO.value?.requestStatus()
    void refresh().then(() => {
      if (!feature.value) feature.value = featureFromStatus()
      if (status.value?.iso_mounted === 'browser') isoSource.value = 'local'
      else if (status.value?.iso_mounted) isoSource.value = 'device'
    })
    void restorePendingUpload()
  } else {
    feature.value = null
  }
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

async function isoFingerprint(file: File) {
  const sampleSize = 64 << 10
  const first = new Uint8Array(await file.slice(0, sampleSize).arrayBuffer())
  const last = new Uint8Array(await file.slice(Math.max(0, file.size - sampleSize)).arrayBuffer())
  const metadata = new TextEncoder().encode(`${file.name}\n${file.size}\n${file.lastModified}\n`)
  const sample = new Uint8Array(metadata.length + first.length + last.length)
  sample.set(metadata)
  sample.set(first, metadata.length)
  sample.set(last, metadata.length + first.length)
  let firstHash = 0x811c9dc5
  let secondHash = 0x9e3779b9
  for (const byte of sample) {
    firstHash = Math.imul(firstHash ^ byte, 0x01000193)
    secondHash = Math.imul(secondHash ^ byte, 0x85ebca6b)
  }
  return `${(firstHash >>> 0).toString(16).padStart(8, '0')}${(secondHash >>> 0).toString(16).padStart(8, '0')}`
}

function storePendingUpload(upload: PendingISOUpload) {
  pendingUpload.value = upload
  activeUploadID.value = upload.id
  uploadProgress.value = uploadPercentage(upload.offset, upload.size)
  if (!uploading.value) {
    uploadTransferred.value = upload.offset
    uploadSpeed.value = 0
  }
  try {
    localStorage.setItem(ISO_UPLOAD_MANIFEST_KEY, JSON.stringify(upload))
    if (upload.fingerprint) localStorage.setItem(uploadResumeKey(upload.fingerprint), upload.id)
  } catch {
    // The active page can still resume while it remains open.
  }
}

function clearPendingUpload(upload = pendingUpload.value) {
  try {
    if (upload?.fingerprint) localStorage.removeItem(uploadResumeKey(upload.fingerprint))
    localStorage.removeItem(ISO_UPLOAD_MANIFEST_KEY)
  } catch {
    // Ref state below remains authoritative for the active page.
  }
  pendingUpload.value = null
  activeUploadID.value = ''
  uploadProgress.value = 0
  uploadTransferred.value = 0
  uploadSpeed.value = 0
}

function syncPendingUploadFromStatus(upload: MSDISOUpload | undefined) {
  if (!upload || uploading.value) return
  const current = pendingUpload.value
  if (current?.id === upload.id) {
    storePendingUpload({
      ...current,
      name: upload.name,
      size: upload.size,
      offset: upload.offset,
      kind: upload.kind === 'drive' ? 'drive' : current.kind,
    })
    return
  }
  if (current) clearPendingUpload(current)
  storePendingUpload({
    id: upload.id,
    name: upload.name,
    size: upload.size,
    lastModified: 0,
    fingerprint: '',
    offset: upload.offset,
    kind: upload.kind === 'drive' ? 'drive' : 'iso',
  })
}

async function restorePendingUpload() {
  const remembered = pendingUpload.value
  if (!remembered || uploading.value) return
  const drive = remembered.kind === 'drive'
  try {
    const upload = drive
      ? await api.getMSDDriveUpload(remembered.id)
      : await api.getMSDISOUpload(remembered.id)
    if (upload.name !== remembered.name || upload.size !== remembered.size) {
      clearPendingUpload(remembered)
      return
    }
    storePendingUpload({ ...remembered, offset: upload.offset })
    if (upload.offset === upload.size) {
      if (drive) await api.completeMSDDriveUpload(upload.id)
      else await api.completeMSDISOUpload(upload.id)
      clearPendingUpload(remembered)
      uploadDialogOpen.value = false
      message.success(drive
        ? t('virtualMedia.driveUploadSuccess', 'Disk image uploaded')
        : t('virtualMedia.uploadSuccess', 'ISO uploaded'))
      await refresh()
    }
  } catch (error) {
    if (error instanceof APIError && error.status === 404) clearPendingUpload(remembered)
  }
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
    syncPendingUploadFromStatus(nextStatus.iso_upload)
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
  try {
    await api.mountMSDMedia(item.id)
    message.success(t('virtualMedia.mountSuccess', 'Media mounted'))
    await refresh()
  } catch (error) {
    message.error(`${t('virtualMedia.mountFailed', 'Mount failed')}: ${error instanceof Error ? error.message : String(error)}`)
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
  if (!file || browserISO.value) return
  if (!hostConnected.value) {
    message.warning(t('virtualMedia.pleaseConnect', 'Connect virtual media before exposing it to the host.'))
    return
  }
  if (mountBlocked.value) {
    message.warning(t('virtualMedia.mountBlockedByUpload', 'Mounting is unavailable while an ISO is uploading.'))
    return
  }
  if (!await validISOFile(file)) {
    message.error(t('virtualMedia.invalidISO', 'The selected file is not a valid ISO image.'))
    return
  }
  browserMounting.value = true
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
  } finally {
    browserMounting.value = false
  }
}

function confirmDelete(item: MSDMedia) {
  dialog.warning({
    title: t('virtualMedia.deleteMedia', 'Delete media'),
    content: t('virtualMedia.deleteMediaConfirm', 'The stored image and all of its contents will be permanently deleted.'),
    positiveText: t('common.delete', 'Delete'),
    negativeText: t('common.cancel', 'Cancel'),
    onPositiveClick: async () => {
      await api.deleteMSDMedia(item.id)
      if (browsingDrive.value?.id === item.id) browsingDrive.value = null
      await refresh()
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
  if (!file) return
  if (kind === 'iso' && !await validISOFile(file)) {
    message.error(t('virtualMedia.invalidISO', 'The selected file is not a valid ISO image.'))
    return
  }
  if (kind === 'drive' && !validDriveImage(file)) {
    message.error(t('virtualMedia.invalidDriveImage', 'The selected file is not a valid disk image.'))
    return
  }
  const fingerprint = await isoFingerprint(file)
  if (pendingUpload.value && (
    pendingUpload.value.kind !== kind
    || pendingUpload.value.name !== file.name
    || pendingUpload.value.size !== file.size
    || (pendingUpload.value.fingerprint && pendingUpload.value.fingerprint !== fingerprint)
  )) {
    message.warning(t('virtualMedia.resumeDifferentFile', 'Another ISO upload is paused. Resume it with the same file or cancel it first.'))
    return
  }

  uploadFileName.value = file.name
  uploadFileSize.value = file.size
  uploadPosition.value = null
  uploadDialogOpen.value = true
  updateShow(false)
  uploading.value = true
  uploadStopRequested.value = false
  const resumeKey = uploadResumeKey(fingerprint)
  try {
    let upload: MSDISOUpload | null = null
    const remembered = pendingUpload.value?.fingerprint === fingerprint
      ? pendingUpload.value.id
      : localStorage.getItem(resumeKey)
    if (remembered) {
      upload = kind === 'drive'
        ? await api.getMSDDriveUpload(remembered).catch(() => null)
        : await api.getMSDISOUpload(remembered).catch(() => null)
    }
    if (!upload || upload.name !== file.name || upload.size !== file.size) {
      localStorage.removeItem(resumeKey)
      upload = kind === 'drive'
        ? await api.beginMSDDriveUpload(file.name, file.size)
        : await api.beginMSDISOUpload(file.name, file.size)
    }
    const tracking: PendingISOUpload = {
      id: upload.id,
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      fingerprint,
      offset: upload.offset,
      kind,
    }
    storePendingUpload(tracking)
    resetUploadTelemetry(upload.offset, file.size)
    if (upload.offset > 0) {
      message.info(`${t('virtualMedia.resumingUpload', 'Resuming upload from')} ${formatBytes(upload.offset)}`)
    }
    while (upload.offset < file.size) {
      if (uploadStopRequested.value) {
        message.info(t('virtualMedia.uploadPaused', 'Upload paused.'))
        return
      }
      const chunkOffset = upload.offset
      const chunkEnd = Math.min(file.size, chunkOffset + ISO_UPLOAD_CHUNK_SIZE)
      const uploadID: string = upload.id
      const requestController = new AbortController()
      uploadRequestControllers.add(requestController)
      try {
        const writeChunk = kind === 'drive' ? api.writeMSDDriveUpload : api.writeMSDISOUpload
        await writeChunk(
          uploadID,
          chunkOffset,
          file.slice(chunkOffset, chunkEnd),
          (loaded, total) => {
            updateUploadTelemetry(
              chunkOffset + Math.min(loaded, total, chunkEnd - chunkOffset),
              file.size,
            )
          },
          requestController.signal,
        )
      } finally {
        uploadRequestControllers.delete(requestController)
      }
      if (uploadStopRequested.value) {
        message.info(t('virtualMedia.uploadPaused', 'Upload paused.'))
        return
      }
      upload = kind === 'drive'
        ? await api.getMSDDriveUpload(uploadID)
        : await api.getMSDISOUpload(uploadID)
      updateUploadTelemetry(upload.offset, file.size)
      tracking.offset = upload.offset
      storePendingUpload(tracking)
    }
    if (uploadStopRequested.value) {
      message.info(t('virtualMedia.uploadPaused', 'Upload paused.'))
      return
    }
    if (kind === 'drive') await api.completeMSDDriveUpload(upload.id)
    else await api.completeMSDISOUpload(upload.id)
    clearPendingUpload(tracking)
    uploadDialogOpen.value = false
    message.success(kind === 'drive'
      ? t('virtualMedia.driveUploadSuccess', 'Disk image uploaded')
      : t('virtualMedia.uploadSuccess', 'ISO uploaded'))
    await refresh()
  } catch (error) {
    if (error instanceof APIError && error.status === 409) await refresh()
    if (!pendingUpload.value) uploadDialogOpen.value = false
    if (!uploadStopRequested.value) {
      message.error(`${t('virtualMedia.uploadFailed', 'Upload failed')}: ${error instanceof Error ? error.message : String(error)}`)
    }
  } finally {
    uploading.value = false
    uploadStopRequested.value = false
    uploadSpeed.value = 0
  }
}

function pauseUpload() {
  uploadStopRequested.value = true
  abortActiveUploadRequests()
}

function minimizeUploadDialog() {
  uploadDialogOpen.value = false
}

function restoreUploadDialog() {
  uploadDialogOpen.value = true
}

defineExpose({ restoreUploadDialog })

async function cancelUpload() {
  const upload = pendingUpload.value
  uploadStopRequested.value = true
  abortActiveUploadRequests()
  if (upload?.id) {
    if (upload.kind === 'drive') await api.cancelMSDDriveUpload(upload.id).catch(() => undefined)
    else await api.cancelMSDISOUpload(upload.id).catch(() => undefined)
  }
  clearPendingUpload(upload)
  uploadDialogOpen.value = false
  message.info(t('virtualMedia.uploadCancelled', 'Upload cancelled'))
  await refresh()
}

async function createDrive() {
  if (!driveSize.value || !driveName.value.trim()) return
  creatingDrive.value = true
  try {
    const sizeMiB = driveSize.value * driveSizeDivisor.value
    await api.createMSDDrive(driveName.value.trim(), 'ONEKVM', Math.round(sizeMiB))
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
    :mask-closable="!folderCreateOpen && !driveCreateOpen && !fileDeletePopoverPath"
    :close-on-esc="!folderCreateOpen && !driveCreateOpen && !fileDeletePopoverPath"
    @update:show="updateShow"
  >
      <n-card
        class="virtual-media-dialog"
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
          <div v-else-if="mediaOpen && !feature" class="virtual-media-home">
            <p class="virtual-media-home-lead"><LayoutGrid :size="16" />{{ t('virtualMedia.chooseFeature', 'Choose a feature') }}</p>
            <div class="virtual-media-home-grid">
              <button v-if="storageAvailable" type="button" class="virtual-media-home-card" @click="openFeature('iso')">
                <Disc3 :size="32" />
                <strong>{{ t('virtualMedia.isoTab', 'ISO mounting') }}</strong>
                <span>{{ t('virtualMedia.isoHomeDescription', 'Mount a disc image for the controlled device.') }}</span>
              </button>
              <button v-if="storageAvailable" type="button" class="virtual-media-home-card" @click="openFeature('drive')">
                <HardDrive :size="32" />
                <strong>{{ t('virtualMedia.driveTab', 'Virtual disk') }}</strong>
                <span>{{ t('virtualMedia.driveHomeDescription', 'Create, upload, and mount a virtual disk.') }}</span>
              </button>
              <button v-if="mtpAvailable" type="button" class="virtual-media-home-card" @click="openFeature('mtp')">
                <Smartphone :size="32" />
                <strong>{{ t('virtualMedia.mtpTab', 'File transfer') }}</strong>
                <span>{{ t('virtualMedia.mtpDescription', 'Share the virtual-media folder with the controlled device, like plugging in a phone.') }}</span>
              </button>
            </div>
          </div>
          <template v-else-if="mediaOpen && feature">
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
                      <n-button type="primary" :loading="browserMounting" :disabled="hostMountBlocked || Boolean(status?.iso_mounted)" tag="span"><template #icon><Disc3 /></template>{{ t('virtualMedia.mount', 'Mount') }}</n-button>
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
                    <strong class="media-title"><Server :size="16" />{{ t('virtualMedia.isoMode', 'ISO images') }}</strong>
                    <span>{{ t('virtualMedia.isoModeDescription', 'Upload resumable ISO images to the device and mount them later.') }}</span>
                  </div>
                  <div class="media-mode-header-actions">
                    <small class="storage-free"><Database :size="13" />{{ formatBytes(status?.storage_free || 0) }} {{ t('virtualMedia.free', 'free') }}</small>
                    <label class="file-picker">
                      <input type="file" accept=".iso,application/x-iso9660-image" :disabled="uploading" @change="uploadISO" />
                      <n-button :disabled="uploading" tag="span"><template #icon><Upload /></template>{{ pendingUpload ? t('virtualMedia.resumeUpload', 'Resume upload') : t('virtualMedia.uploadISO', 'Upload ISO') }}</n-button>
                    </label>
                    <n-button v-if="status?.iso_mounted && status.iso_mounted !== 'browser'" @click="eject('iso')"><template #icon><Unplug /></template>{{ t('virtualMedia.unmount', 'Eject') }}</n-button>
                  </div>
                </header>
                <n-empty v-if="!isoMedia.length && !loading" :description="t('virtualMedia.noISO', 'No uploaded ISO images')">
                  <template #icon><Disc3 /></template>
                </n-empty>
                <div class="media-list">
                  <div v-for="item in isoMedia" :key="item.id" class="media-row">
                    <Disc3 :size="24" />
                    <div class="media-copy"><strong class="media-filename" :title="item.name">{{ item.name }}</strong><span>{{ formatBytes(item.size) }}<template v-if="item.external && item.label"> · {{ item.label }}</template></span></div>
                    <n-tag v-if="item.mounted" type="success" size="small"><CircleCheck :size="12" />{{ t('virtualMedia.mountedStatus', 'Mounted') }}</n-tag>
                    <n-button v-if="!item.mounted && !status?.iso_mounted" size="small" type="primary" :disabled="hostMountBlocked" @click="mount(item)"><template #icon><Disc3 /></template>{{ t('virtualMedia.mount', 'Mount') }}</n-button>
                    <n-button v-else-if="item.mounted" size="small" @click="eject('iso')"><template #icon><Unplug /></template>{{ t('virtualMedia.unmount', 'Eject') }}</n-button>
                    <n-button v-if="!item.external" quaternary circle size="small" :disabled="item.mounted" @click="confirmDelete(item)"><template #icon><Trash2 /></template></n-button>
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
                      <n-popover
                        v-model:show="driveCreateOpen"
                        trigger="click"
                        placement="left-start"
                        to="body"
                        :z-index="4500"
                        :show-arrow="false"
                        class="drive-create-popover"
                      >
                        <template #trigger>
                          <n-button size="small" @click="browsingDrive = null"><template #icon><CirclePlus /></template>{{ t('virtualMedia.createDriveTab', 'Create disk') }}</n-button>
                        </template>
                        <section class="drive-create-card">
                          <header class="drive-create-header">
                            <strong class="media-title"><HardDrive :size="16" />{{ t('virtualMedia.createDriveTab', 'Create disk') }}</strong>
                            <n-button text size="small" @click="driveCreateOpen = false">{{ t('common.cancel', 'Cancel') }}</n-button>
                          </header>
                          <n-form label-placement="top" class="drive-create-form">
                            <n-form-item :label="t('virtualMedia.driveName', 'Disk name')">
                              <n-input v-model:value="driveName" :placeholder="t('virtualMedia.driveName', 'Disk name')" />
                            </n-form-item>
                            <n-form-item :label="t('virtualMedia.driveCapacity', 'Capacity')">
                              <div class="drive-size-input">
                                <n-input-number
                                  v-model:value="driveSize"
                                  :min="minimumDriveSize"
                                  :max="maximumDriveSize"
                                  :step="driveSizeUnit === 'GiB' ? 0.25 : 64"
                                />
                                <n-select
                                  :value="driveSizeUnit"
                                  :options="driveSizeUnitOptions"
                                  :consistent-menu-width="false"
                                  @update:value="updateDriveSizeUnit"
                                />
                              </div>
                            </n-form-item>
                            <div class="drive-create-actions">
                              <n-button type="primary" :loading="creatingDrive" :disabled="!driveName.trim() || !driveSize" @click="createDrive"><template #icon><CirclePlus /></template>{{ t('virtualMedia.createDrive', 'Create') }}</n-button>
                            </div>
                          </n-form>
                        </section>
                      </n-popover>
                      <label class="file-picker">
                        <input type="file" accept=".img,.raw,.bin,application/octet-stream" :disabled="uploading" @change="uploadDriveImage" />
                        <n-button size="small" :disabled="uploading" tag="span">
                          <template #icon><Upload /></template>
                          {{ pendingUploadKind === 'drive' && pendingUpload ? t('virtualMedia.resumeUpload', 'Resume upload') : t('virtualMedia.uploadDriveImage', 'Upload disk image') }}
                        </n-button>
                      </label>
                    </div>
                    <div class="media-list">
                      <div class="media-row no-virtual-drive-row" :class="{ selected: !status?.drive_mounted }">
                        <Ban :size="24" />
                        <div class="media-copy">
                          <strong>{{ t('virtualMedia.noVirtualDrive', 'No virtual disk') }}</strong>
                          <span>{{ t('virtualMedia.noVirtualDriveDescription', 'Do not expose a virtual disk to the host.') }}</span>
                        </div>
                        <n-tag v-if="!status?.drive_mounted" type="info" size="small"><CircleCheck :size="12" />{{ t('virtualMedia.selected', 'Selected') }}</n-tag>
                        <n-button v-else size="small" @click="eject('drive')"><template #icon><Check /></template>{{ t('virtualMedia.select', 'Select') }}</n-button>
                      </div>
                      <n-empty v-if="!driveMedia.length && !loading" :description="t('virtualMedia.noDrives', 'No virtual disks')">
                        <template #icon><HardDrive /></template>
                      </n-empty>
                        <div v-for="item in driveMedia" :key="item.id" class="media-row">
                          <HardDrive :size="24" />
                          <div class="media-copy"><strong class="media-filename" :title="item.name">{{ item.name }}</strong><span>{{ item.label }} · {{ formatBytes(item.size) }}</span></div>
                          <n-tag v-if="item.mounted" type="success" size="small"><CircleCheck :size="12" />{{ t('virtualMedia.mountedStatus', 'Mounted') }}</n-tag>
                          <n-button v-if="!item.mounted && !status?.drive_mounted" size="small" type="primary" :disabled="hostMountBlocked" @click="mount(item)"><template #icon><HardDrive /></template>{{ t('virtualMedia.mount', 'Mount') }}</n-button>
                          <n-button v-else-if="item.mounted" size="small" @click="eject('drive')"><template #icon><Unplug /></template>{{ t('virtualMedia.unmount', 'Eject') }}</n-button>
                          <n-button v-if="!item.imported" size="small" :disabled="item.mounted" @click="openDrive(item)"><template #icon><FolderOpen /></template>{{ t('virtualMedia.files', 'Files') }}</n-button>
                          <n-button quaternary circle size="small" :disabled="item.mounted" @click="confirmDelete(item)"><template #icon><Trash2 /></template></n-button>
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
                        </div>
                        <n-alert v-if="browsingDrive.mounted" type="warning">{{ t('virtualMedia.ejectToManage', 'Eject the drive before managing files.') }}</n-alert>
                        <template v-else>
                          <div class="file-actions">
                            <label class="file-picker"><input type="file" :disabled="driveUpload.uploading.value" @change="uploadDriveFile" /><n-button tag="span" size="small" :disabled="driveUpload.uploading.value"><template #icon><Upload /></template>{{ t('virtualMedia.uploadFile', 'Upload file') }}</n-button></label>
                            <n-popover v-model:show="folderCreateOpen" trigger="click" placement="bottom-start" to="body" :z-index="4600" :show-arrow="false" class="folder-create-popover">
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
                                    to="body"
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
          </template>
        </div>
      </n-card>
  </n-modal>

  <XpTransferDialog
    ref="uploadWindow"
    :show="uploadDialogOpen"
    :dialog-label="uploadProgressTitle"
    :window-style="uploadWindowStyle"
    :status="uploadStatusLabel"
    :transferred="uploadTransferred"
    :total="pendingUpload?.size || uploadFileSize"
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
    <template #hint>
      <div v-if="pendingUpload && !uploading" class="xp-resume-hint">
        {{ t('virtualMedia.resumeHint', 'Select the same ISO again to resume from the saved position.') }}
      </div>
    </template>
    <template #actions>
      <button v-if="uploading" @click="pauseUpload"><Pause :size="14" />{{ t('virtualMedia.pauseUpload', 'Pause') }}</button>
      <label v-else-if="pendingUpload" class="xp-upload-file-button">
        <input type="file" accept=".iso,application/x-iso9660-image" @change="uploadISO" />
        <span>{{ t('virtualMedia.resumeUpload', 'Resume upload') }}</span>
      </label>
      <button :disabled="!activeUploadID" @click="cancelUpload">{{ t('virtualMedia.cancelUpload', 'Cancel upload') }}</button>
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
.virtual-media-dialog :deep(.n-card-header__main) { min-width: 0; }
.virtual-media-dialog :deep(.n-card-header__extra) { display: flex; align-items: center; }
.virtual-media-dialog :deep(.n-card__content) {
  min-height: 0;
  max-height: calc(100vh - 96px);
  padding: 0 18px 18px;
  overflow: hidden;
}
.virtual-media-heading { display: inline-flex; align-items: center; gap: 8px; }
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
.virtual-media-content { min-height: 120px; max-height: calc(100vh - 168px); overflow-y: auto; padding-right: 3px; scrollbar-width: thin; }
.virtual-media-tab-connect { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.virtual-media-tab-connect > :deep(.n-button) { flex: 0 0 auto; }
.virtual-media-loading { display: grid; min-height: 112px; place-items: center; }
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
.drive-create-card { width: min(360px, calc(100vw - 48px)); padding: 4px; }
.drive-create-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
.drive-create-form { display: grid; grid-template-columns: minmax(0, 1fr); }
.drive-create-form :deep(.n-form-item) { min-width: 0; margin-bottom: 8px; }
.drive-create-form :deep(.n-input), .drive-create-form :deep(.n-input-number) { width: 100%; }
.drive-size-input { display: grid; grid-template-columns: minmax(0, 1fr) 86px; gap: 8px; }
.drive-create-actions { display: flex; justify-content: flex-end; }
.folder-create-card { display: grid; width: min(320px, calc(100vw - 48px)); gap: 10px; padding: 4px; }
.folder-create-actions { display: flex; justify-content: flex-end; gap: 8px; }
.no-virtual-drive-row.selected { border-color: rgba(32, 128, 240, .45); background: rgba(32, 128, 240, .08); }
.file-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
.file-picker input { display: none; }
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
.media-copy { display: flex; flex: 1; min-width: 0; flex-direction: column; }
.media-filename { min-width: 0; max-width: 100%; overflow-wrap: anywhere; word-break: break-word; white-space: normal; }
.media-copy span { color: var(--n-text-color-3); font-size: 12px; }
.file-manager { margin-top: 18px; padding-top: 14px; border-top: 1px solid rgba(128, 128, 128, .2); }
.file-manager-header { display: flex; min-width: 0; align-items: center; gap: 12px; margin-bottom: 12px; }
.file-manager-header > strong { flex: 0 1 auto; }
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
  .virtual-media-dialog { width: calc(100vw - 16px); max-height: calc(100vh - 16px); }
  .virtual-media-dialog :deep(.n-card-header) { padding: 12px 14px 10px; }
  .virtual-media-dialog :deep(.n-card__content) { max-height: calc(100vh - 74px); padding: 0 12px 12px; }
  .virtual-media-content { max-height: calc(100vh - 138px); }
  .virtual-media-home-grid { grid-template-columns: 1fr; }
  .iso-mode-grid { grid-template-columns: 1fr; }
}
@media (max-width: 620px) { .media-mode-header { flex-direction: column; align-items: stretch; } .media-mode-header-actions { width: 100%; } .media-row { flex-wrap: wrap; } .media-copy { flex-basis: calc(100% - 44px); } }
@media (max-width: 620px) { .virtual-media-disconnected { grid-template-columns: auto minmax(0, 1fr); } .virtual-media-disconnected :deep(.n-button) { grid-column: 1 / -1; justify-self: stretch; } .virtual-media-disconnect-button { padding-inline: 8px; } }
</style>
