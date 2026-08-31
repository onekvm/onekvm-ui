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

export function parseRecoveryStatus(body: string): string[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return []
  }
  if (!parsed || typeof parsed !== 'object') return []
  const addresses = (parsed as { addresses?: unknown }).addresses
  if (!Array.isArray(addresses)) return []
  return addresses.filter((item): item is string => typeof item === 'string' && item.length > 0)
}

export async function loadRecoveryStatus(): Promise<string[]> {
  const response = await fetch('/status')
  const text = await response.text()
  if (!response.ok) throw new Error(recoveryErrorMessage(response.status, text))
  return parseRecoveryStatus(text)
}

export async function postRecovery(path: string, body?: BodyInit): Promise<string> {
  if (!isRecoveryPath(path)) throw new Error('unknown recovery path')
  const response = await fetch(path, { method: 'POST', body })
  const text = await response.text()
  if (!response.ok) throw new Error(recoveryErrorMessage(response.status, text))
  return text
}
