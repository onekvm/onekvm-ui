export interface MicrophoneActivationSteps<T> {
  requestPermission: () => Promise<T>
  enableDevice?: () => Promise<void>
  claimSession: () => Promise<boolean>
  attach: (resource: T) => Promise<void>
  releaseSession: () => Promise<void>
  stop: (resource: T) => void
}

export async function activateBrowserMicrophone<T>(
  steps: MicrophoneActivationSteps<T>,
): Promise<T | null> {
  const resource = await steps.requestPermission()
  let claimed = false

  const stop = () => {
    try {
      steps.stop(resource)
    } catch {
      // The original activation error is more useful than a cleanup error.
    }
  }

  try {
    await steps.enableDevice?.()
    claimed = await steps.claimSession()
    if (!claimed) {
      stop()
      return null
    }
    await steps.attach(resource)
    return resource
  } catch (error) {
    stop()
    if (claimed) await steps.releaseSession().catch(() => undefined)
    throw error
  }
}

export function microphoneAccessErrorKind(error: unknown): 'permission' | 'unavailable' | 'other' {
  const name = error && typeof error === 'object' && 'name' in error
    ? String((error as { name?: unknown }).name || '')
    : ''

  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return 'permission'
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'NotReadableError') {
    return 'unavailable'
  }
  return 'other'
}
