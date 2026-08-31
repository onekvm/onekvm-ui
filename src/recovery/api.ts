export const RECOVERY_PATHS = {
  firmware: '/firmware',
  resetUser: '/reset-user',
  reboot: '/reboot',
} as const

export type RecoveryPath = (typeof RECOVERY_PATHS)[keyof typeof RECOVERY_PATHS]

const allowedPaths = new Set<string>(Object.values(RECOVERY_PATHS))

export function isRecoveryPath(path: string): path is RecoveryPath {
  return allowedPaths.has(path)
}

export function recoveryErrorMessage(status: number, body: string) {
  const text = body.trim()
  if (text) return text
  return String(status)
}

export function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message
  return String(error)
}

export type RecoveryStatus = {
  addresses: string[]
  firmwareMax: number
}

export function parseRecoveryStatus(body: string): RecoveryStatus {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return { addresses: [], firmwareMax: 0 }
  }
  if (!parsed || typeof parsed !== 'object') return { addresses: [], firmwareMax: 0 }
  const record = parsed as { addresses?: unknown; firmwareMax?: unknown }
  const addresses = Array.isArray(record.addresses)
    ? record.addresses.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : []
  const firmwareMax =
    typeof record.firmwareMax === 'number' && Number.isFinite(record.firmwareMax) && record.firmwareMax > 0
      ? Math.floor(record.firmwareMax)
      : 0
  return { addresses, firmwareMax }
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes >= 1024 * 1024) {
    const mib = bytes / (1024 * 1024)
    const text = mib >= 10 ? mib.toFixed(0) : mib.toFixed(1)
    return `${text.replace(/\.0$/, '')} MiB`
  }
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KiB`
  return `${Math.round(bytes)} B`
}

export async function loadRecoveryStatus(): Promise<RecoveryStatus> {
  const response = await fetch('/status')
  const text = await response.text()
  if (!response.ok) throw new Error(recoveryErrorMessage(response.status, text))
  return parseRecoveryStatus(text)
}

export const FIRMWARE_PHASES = [
  'idle',
  'upload',
  'extract',
  'verify',
  'write-rootfs',
  'write-boot',
  'switch',
  'done',
  'error',
] as const

export type FirmwarePhase = (typeof FIRMWARE_PHASES)[number]

export type FirmwareProgress = {
  phase: FirmwarePhase
  received?: number
  total?: number
  message?: string
  sha256?: string
}

function isFirmwarePhase(value: string): value is FirmwarePhase {
  return (FIRMWARE_PHASES as readonly string[]).includes(value)
}

function ratio(received: number | undefined, total: number | undefined) {
  if (!total || total <= 0 || !received || received < 0) return 0
  if (received >= total) return 1
  return received / total
}

export function parseFirmwareProgress(body: string): FirmwareProgress {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return { phase: 'idle' }
  }
  if (!parsed || typeof parsed !== 'object') return { phase: 'idle' }
  const record = parsed as {
    phase?: unknown
    received?: unknown
    total?: unknown
    message?: unknown
    sha256?: unknown
  }
  if (typeof record.phase !== 'string' || !isFirmwarePhase(record.phase)) {
    return { phase: 'idle' }
  }
  const progress: FirmwareProgress = { phase: record.phase }
  if (typeof record.received === 'number' && Number.isFinite(record.received)) {
    progress.received = record.received
  }
  if (typeof record.total === 'number' && Number.isFinite(record.total)) {
    progress.total = record.total
  }
  if (typeof record.message === 'string' && record.message) {
    progress.message = record.message
  }
  if (typeof record.sha256 === 'string' && /^[0-9a-f]{64}$/.test(record.sha256)) {
    progress.sha256 = record.sha256
  }
  return progress
}

export function bytesPercent(received?: number, total?: number) {
  return Math.round(ratio(received, total) * 100)
}

export function firmwareProgressPercent(progress: FirmwareProgress) {
  if (progress.phase === 'idle' || progress.phase === 'error') return 0
  if (progress.phase === 'upload') return Math.round(ratio(progress.received, progress.total) * 55)
  if (progress.phase === 'extract') return 60
  if (progress.phase === 'verify') return 63
  if (progress.phase === 'write-rootfs') return 65 + Math.round(ratio(progress.received, progress.total) * 25)
  if (progress.phase === 'write-boot') return 93
  if (progress.phase === 'switch') return 97
  return 100
}

const phaseOrder: Record<FirmwarePhase, number> = {
  idle: 0,
  upload: 1,
  extract: 2,
  verify: 3,
  'write-rootfs': 4,
  'write-boot': 5,
  switch: 6,
  done: 7,
  error: 7,
}

export function shouldApplyFirmwareProgress(
  current: FirmwareProgress,
  incoming: FirmwareProgress,
  uploadActive: boolean,
) {
  if (incoming.phase === 'idle') return false
  if (uploadActive && current.phase === 'upload' && (incoming.phase === 'done' || incoming.phase === 'error')) {
    return false
  }
  if (current.phase === 'done' || current.phase === 'error') return incoming.phase === 'upload'
  return phaseOrder[incoming.phase] >= phaseOrder[current.phase]
}

export async function postRecovery(path: string, body?: BodyInit): Promise<string> {
  if (!isRecoveryPath(path)) throw new Error('unknown recovery path')
  const response = await fetch(path, { method: 'POST', body })
  const text = await response.text()
  if (!response.ok) throw new Error(recoveryErrorMessage(response.status, text))
  return text
}

export function uploadFirmware(
  file: File,
  onProgress: (progress: FirmwareProgress) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const abort = new AbortController()
    let poll = 0
    let stopped = false
    let current: FirmwareProgress = { phase: 'upload', received: 0, total: file.size }

    const stop = () => {
      stopped = true
      abort.abort()
      if (poll) window.clearInterval(poll)
      poll = 0
    }

    const emit = (progress: FirmwareProgress) => {
      if (stopped && progress.phase !== 'done' && progress.phase !== 'error') return
      if (!shouldApplyFirmwareProgress(current, progress, !stopped)) return
      if (!progress.sha256 && current.sha256) progress = { ...progress, sha256: current.sha256 }
      current = progress
      onProgress(progress)
    }

    const readServerProgress = async () => {
      if (stopped) return
      try {
        const response = await fetch('/progress', { signal: abort.signal })
        if (!response.ok || stopped) return
        emit(parseFirmwareProgress(await response.text()))
      } catch {
        /* keep the last client-side update */
      }
    }

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return
      emit({ phase: 'upload', received: event.loaded, total: event.total })
    }
    xhr.onload = () => {
      stop()
      if (xhr.status >= 200 && xhr.status < 300) {
        emit({ phase: 'done' })
        resolve(xhr.responseText)
        return
      }
      const message = recoveryErrorMessage(xhr.status, xhr.responseText || '')
      emit({ phase: 'error', message })
      reject(new Error(message))
    }
    xhr.onerror = () => {
      stop()
      emit({ phase: 'error', message: 'network error' })
      reject(new Error('network error'))
    }
    xhr.onabort = () => {
      stop()
      emit({ phase: 'error', message: 'upload aborted' })
      reject(new Error('upload aborted'))
    }
    poll = window.setInterval(() => {
      void readServerProgress()
    }, 400)
    xhr.open('POST', RECOVERY_PATHS.firmware)
    xhr.send(file)
  })
}
